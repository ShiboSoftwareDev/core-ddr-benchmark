import type { BenchmarkResult, CaseResult } from "./types"
import { getDdrSkewGroupNames } from "./ddr-skew"
import manifest from "../manifest.json"

type Summary = {
  completed: number
  passed: number
  failures: number
  timeouts: number
  crashes: number
  connectedNets: number | null
  requestedNets: number | null
  drcIssues: number | null
}

type Comparison = { label: string; report: BenchmarkResult }

function escapeCell(value: unknown): string {
  return String(value ?? "n/a").replace(/[&<>|\r\n]/g, (character) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", "|":"&#124;", "\r":" ", "\n":" ",
  })[character]!)
}

function isCompleted(row: CaseResult): boolean {
  if (["timeout","crashed","geometry_only"].includes(row.status)) return false
  return row.progress?.renderCompleted === true && row.progress.errors.length === 0 &&
    row.progress.phases.every((phase) => phase.status === "completed") &&
    row.assessment !== null && row.assessment.connectedNets === row.assessment.requestedNets
}

function drcIssues(row: CaseResult): number | null {
  return row.assessment ? Object.entries(row.assessment.findings)
    .filter(([name]) => !["missing_traces","disconnected_ports"].includes(name))
    .reduce((sum,[,count]) => sum + count,0) : null
}

function summarize(report: BenchmarkResult): Summary {
  const completed = report.cases.filter(isCompleted)
  const assessments = report.cases.map((row) => row.assessment)
  const completeAssessment = assessments.every((assessment) => assessment !== null)
  return {
    completed: report.geometryOnly ? report.cases.filter((row) => row.status === "geometry_only").length : completed.length,
    passed: report.cases.filter((row) => row.status === "passed").length,
    failures: report.cases.filter((row) => row.status === "failed").length,
    timeouts: report.cases.filter((row) => row.status === "timeout").length,
    crashes: report.cases.filter((row) => row.status === "crashed").length,
    connectedNets: completeAssessment ? assessments.reduce((sum,a) => sum + a!.connectedNets,0) : null,
    requestedNets: completeAssessment ? assessments.reduce((sum,a) => sum + a!.requestedNets,0) : null,
    drcIssues: completed.length ? completed.reduce((sum,row) => sum + drcIssues(row)!,0) : null,
  }
}

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a,b) => a-b)
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position), upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

function formatTime(value: number | null): string {
  if (value === null) return "n/a"
  return value < 1000 ? `${Math.round(value)}ms` : `${(value/1000).toFixed(1)}s`
}

function relativeDelta(base: number | null, head: number | null): string {
  if (base === null || head === null || base === 0) return "n/a"
  const delta = (head-base)/base*100
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`
}

function countDelta(base: number | null, head: number | null): string {
  if (base === null || head === null) return "n/a"
  const delta = head-base
  return `${delta > 0 ? "+" : ""}${delta}`
}

function rate(count: number, total: number): string {
  return total ? `${(count/total*100).toFixed(1)}% (${count}/${total})` : "n/a"
}

function rateDelta(base: number, head: number, total: number): string {
  if (!total) return "n/a"
  const delta = (head-base)/total*100
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)} pp`
}

function outcome(row: CaseResult): string {
  if (row.status === "timeout") return "Timeout"
  if (row.status === "crashed") return "Crashed"
  if (row.status === "geometry_only") return "Geometry audit passed"
  if (row.status === "passed") return "DRC passed"
  return isCompleted(row) ? "Completed (checks failed)" : "Failed"
}

function outcomeScore(row: CaseResult): number {
  return row.status === "passed" ? 2 : isCompleted(row) ? 1 : 0
}

function stageTimings(report: BenchmarkResult, label: string): string[] {
  const timed = report.cases.filter((row) => row.progress?.phases.some((phase) => phase.durationMs !== null))
  const partial = timed.filter((row) => !isCompleted(row)).length
  const totals = new Map<string,number>()
  for (const row of timed) for (const phase of row.progress!.phases) {
    if (phase.durationMs === null) continue
    const name = `${phase.phase} (${phase.solver ?? "unknown"})`
    totals.set(name,(totals.get(name) ?? 0)+phase.durationMs)
  }
  const total = [...totals.values()].reduce((sum,ms) => sum+ms,0)
  const lines = ["", "<details>", `<summary>${label} pipeline stage timings</summary>`, "", "**Core DDR**", ""]
  if (!timed.length) lines.push("Stage timings unavailable for this report.", "")
  else {
    lines.push(
      `Recorded timings: ${timed.length}/${report.cases.length} circuits (${partial} partial, including failed or timed-out circuits).`,
      "Times are summed across circuits; percentages use total recorded phase time. Unfinished phases have no recorded end time and are excluded.", "",
      "| Stage | Total time | % of stage time |", "| --- | ---: | ---: |",
    )
    for (const [name,ms] of [...totals].sort(([a],[b]) => a.localeCompare(b,undefined,{numeric:true}))) {
      lines.push(`| ${escapeCell(name)} | ${(ms/1000).toFixed(3)}s | ${total ? `${(ms/total*100).toFixed(1)}%` : "n/a"} |`)
    }
    lines.push(`| **Total** | **${(total/1000).toFixed(3)}s** | **${total ? "100.0%" : "n/a"}** |`, "")
  }
  lines.push("</details>")
  return lines
}

function skewReport(head: BenchmarkResult, base?: BenchmarkResult): string[] {
  const rows = head.cases.flatMap((row) => {
    const before = base?.cases.find((candidate) => candidate.circuit === row.circuit)
    const groups = new Set([...getDdrSkewGroupNames(row.circuit), ...Object.keys(row.assessment?.ddrSkew ?? {}), ...Object.keys(before?.assessment?.ddrSkew ?? {})])
    return [...groups].map((group) => ({
      title: row.title, group, values: base ? [before?.assessment?.ddrSkew?.[group], row.assessment?.ddrSkew?.[group]] : [row.assessment?.ddrSkew?.[group]],
    }))
  })
  const matched = rows.filter((row) => row.values.every((value) => value?.skewMm != null))
  const columns = base ? ["Base", "PR"] : ["Local"]
  const mm = (value: number | null | undefined) => value == null ? "n/a" : Math.abs(value) < 1e-7 ? "0.000" : value.toFixed(3)
  const delta = (values: (number | null | undefined)[]) => values.some((value) => value == null) ? "n/a" : `${values[1]! - values[0]! >= 0 ? "+" : ""}${(values[1]! - values[0]!).toFixed(3)}`
  const lines = ["", "### DDR length matching", "",
    "Skew is the longest minus shortest connected pad-center path in each memory byte (DQ + DM + DQS), DQS pair, clock pair and address/command group. Lengths are planar mm; via depth and component/package delay are excluded. Maxima come from explicit pair limits or complete length windows, including windows around DQS/CK references (marked window). A derived range bound does not replace its stricter relative-net check. An unresolved max means the captured requirements do not supply a bound for that whole group; it does not mean unconstrained hardware. Positive deltas mean worse matching.", "",
    `| Metric | ${columns.join(" | ")}${base ? " | Delta (mm)" : ""} |`,
    `| --- | ${columns.map(() => "---:").join(" | ")}${base ? " | ---:" : ""} |`,
    `| Complete groups | ${columns.map((_, index) => `${rows.filter((row) => row.values[index]?.skewMm != null).length}/${rows.length}`).join(" | ")}${base ? " | —" : ""} |`,
  ]
  for (const [label, aggregate] of [["Mean skew", (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length], ["Worst skew", (values: number[]) => Math.max(...values)]] as const) {
    const values = columns.map((_, index) => matched.length ? aggregate(matched.map((row) => row.values[index]!.skewMm!)) : null)
    lines.push(`| ${label} (mm) | ${values.map(mm).join(" | ")}${base ? ` | ${delta(values)}` : ""} |`)
  }
  const limited = columns.map((_, index) => rows.map((row) => row.values[index]).filter((value) => value?.maxSkewMm !== undefined && value.skewMm !== null))
  lines.push(`| Skew groups over wanted max | ${limited.map((values) => values.length ? `${values.filter((value) => value!.skewMm! > value!.maxSkewMm! + 1e-7).length}/${values.length}` : "n/a").join(" | ")}${base ? " | —" : ""} |`)
  const compared = columns.map((_, index) => rows.map((row) => row.values[index]).filter((value) => value?.referenceDeltaMm != null))
  lines.push(`| Matching preserved vs original board | ${compared.map((values) => values.length ? `${values.filter((value) => value!.matchingStatus === "preserved").length}/${values.length}` : "n/a").join(" | ")}${base ? " | —" : ""} |`)
  lines.push("", `Aggregates use ${matched.length} ${base ? "matched " : ""}complete groups. Missing fields in older results and incomplete paths remain n/a; partial groups never count as zero skew.`, "",
    "<details>", "<summary>DDR skew by memory and signal group</summary>", "",
    "Original-board skew is measured from the immutable source copper using the same planar pad-center metric, including series sections and excluding branch stubs. It is a preservation target, separate from the electrical maximum. Increased skew fails matching assessment (0.000001 mm rounding tolerance); missing paths remain incomplete. The baseline generator verifies source and fixture hashes.", "",
    `| Circuit | Group | ${columns.map((label) => `${label} skew (mm) | ${label} hardware max (mm) | ${label} hardware margin (mm) | ${label} signals | ${label} preserve ≤ (mm) | ${label} vs original (mm) | ${label} matching`).join(" | ")}${base ? " | Delta (mm)" : ""} |`,
    `| --- | --- | ${columns.map(() => "---: | ---: | ---: | ---: | ---: | ---: | ---").join(" | ")}${base ? " | ---:" : ""} |`)
  for (const row of rows) {
    const cells = row.values.map((value) => `${mm(value?.skewMm)} | ${value?.maxSkewMm === undefined ? "unresolved" : `${mm(value.maxSkewMm)}${value.limitBasis === "length_window" ? " (window)" : ""}${value.limitSeverity && value.limitSeverity !== "error" ? ` [source ${value.limitSeverity}]` : ""}`} | ${value?.maxSkewMm !== undefined && value.skewMm !== null ? mm(value.maxSkewMm - value.skewMm) : "n/a"} | ${value ? `${Object.values(value.lengthsMm).filter((length) => length !== null).length}/${Object.keys(value.lengthsMm).length}` : "n/a"} | ${mm(value?.referenceSkewMm)} | ${mm(value?.referenceDeltaMm)} | ${value?.matchingStatus ?? "n/a"}`)
    lines.push(`| ${escapeCell(row.title)} | ${escapeCell(row.group)} | ${cells.join(" | ")}${base ? ` | ${delta(row.values.map((value) => value?.skewMm))}` : ""} |`)
  }
  lines.push("", "</details>")
  lines.push("", "<details>", "<summary>Reference length and skew requirements</summary>", "",
    "Supported error-severity targets are supplied to Core in its planar length model. Source warning/ignore targets are comparison-only. Core bus-lanes cannot tune branched-net lengths; those targets are assessed on controller-to-RAM paths and marked assessed only. Error-severity targets gate pass/fail. These checks exclude native KiCad via-height, pad-shortcut and hardware delay calculations. H616 retains KiCad 8's maximum absolute deviation from the original class mean. Core receives its necessary range bound (twice that deviation); assessment checks the exact mean condition. H616's three broken class selectors are repaired as the explicitly named class unions; i.MX6's unique leaf pair selector is qualified to its hierarchy. Original and applied expressions are retained in results. i.MX6 uses KiCad 9 range skew; its saved offset targets remain signed selected-path minus coupled-path windows. Unbounded tuner state remains unapplied.", "",
    `| Circuit | Requirement | Wanted (mm) | ${columns.map((label) => `${label} actual (mm) | ${label} margin (mm) | ${label} status`).join(" | ")} |`,
    `| --- | --- | --- | ${columns.map(() => "---: | ---: | ---").join(" | ")} |`)
  for (const row of head.cases) {
    const before = base?.cases.find((candidate) => candidate.circuit === row.circuit)
    const names = new Set([...(row.assessment?.ddrConstraints ?? []).map((constraint) => constraint.name), ...(before?.assessment?.ddrConstraints ?? []).map((constraint) => constraint.name)])
    const source = manifest.circuits.find((circuit) => circuit.id === row.circuit)?.source
    for (const name of names) {
      const values = (base ? [before, row] : [row]).map((sample) => sample?.assessment?.ddrConstraints?.find((constraint) => constraint.name === name))
      const target = values.at(-1) ?? values[0]!
      const isSkew = target!.maxLengthSkew !== undefined || target!.skewReference === "signed_pair"
      const wanted = target!.skewReference === "signed_pair" ? `${mm(target!.minSignedSkew)}–${mm(target!.maxSignedSkew)} signed (selected − coupled)` : isSkew ? `${target!.skewComparison === "lt" ? "<" : "≤"} ${mm(target!.maxLengthSkew)} ${target!.skewReference === "mean" ? "from mean" : target!.skewReference === "references" ? "from each DQS/CK reference" : target!.skewReference === "memory_endpoints" ? "between RAM branches of each net" : "range/pair skew"}` : `${target!.minLength === undefined ? "unset" : mm(target!.minLength)}–${target!.maxLength === undefined ? "unset" : mm(target!.maxLength)}${target!.lengthReference ? " vs shortest CK" : ""}`
      const url = target!.sourceUrl ?? (source && `https://github.com/${source.repo}/blob/${source.commit}/${target!.sourcePath.split("/").map(encodeURIComponent).join("/")}`)
      const label = (url ? `[${escapeCell(name)}](${url})` : escapeCell(name)) + (target!.appliedCondition ? `<br>Applied selector: ${escapeCell(target!.appliedCondition)}` : "")
      const cells = values.map((value) => `${isSkew ? mm(value?.actualSkewMm) : `${mm(value?.actualMinMm)}–${mm(value?.actualMaxMm)}${value && Object.values(value.lengthsMm).some((length) => length === null) ? " (partial)" : ""}`} | ${mm(value?.marginMm)} | ${value ? `${value.status}; source ${value.severity ?? "error"} (${Object.values(value.lengthsMm).filter((length) => length !== null).length}/${Object.keys(value.lengthsMm).length})${value.assessmentOnly ? "; assessed only (relative/overlapping groups)" : value.routerSkippedNets?.length ? `; ${value.routerSkippedNets.length} branched nets assessed only` : ""}` : "n/a"}`)
      lines.push(`| ${escapeCell(row.title)} | ${label} | ${wanted} | ${cells.join(" | ")} |`)
    }
    if (!names.size) lines.push(`| ${escapeCell(row.title)} | ${row.assessment?.ddrConstraints ? "Original reference declares no numeric target; compare original routed skew above" : "Reference targets unavailable in saved results"} | unresolved | ${columns.map(() => "n/a | n/a | unresolved").join(" | ")} |`)
  }
  const noted = head.cases.filter((row) => row.assessment?.ddrConstraintNotes?.length)
  if (noted.length) lines.push("", ...noted.map((row) => `${escapeCell(row.title)}: ${row.assessment!.ddrConstraintNotes!.map(escapeCell).join(" ")}`))
  lines.push("", "</details>")
  const routed = head.cases.filter((row) => row.assessment?.ddrRoutingTargets)
  if (routed.length) {
    lines.push("", "<details>", "<summary>Length and skew targets supplied to Core</summary>", "",
      "Original-board skew bounds and common minimum lengths are routing goals for matching preservation. Original achieved lengths never become maximum-length limits. Targets cover physical DQ/DM/DQS groups, including members formerly left in remaining routing. Vendor/source targets take priority over conflicting minimum goals; original skew preservation is still checked. Relative DQ/DM limits are projected only when reference conductors have finite enforced source windows. Multi-net source classes stay intact. Core cannot tune branched paths or sum separate series-resistor nets; their complete paths remain mandatory assessment targets.", "",
      "| Circuit | Bus | Connections | Min length (mm) | Max length (mm) | Max skew (mm) |", "| --- | --- | ---: | ---: | ---: | ---: |")
    for (const row of routed) for (const bus of row.assessment!.ddrRoutingTargets!) {
      if (bus.minLength === undefined && bus.maxLength === undefined && bus.maxLengthSkew === undefined) continue
      lines.push(`| ${escapeCell(row.title)} | ${escapeCell(bus.name)} | ${bus.connections.length} | ${mm(bus.minLength)} | ${mm(bus.maxLength)} | ${mm(bus.maxLengthSkew)} |`)
    }
    lines.push("", "</details>")
  }
  const packages = head.cases.filter((row) => row.assessment?.ddrPackageMatching)
  if (packages.length) {
    lines.push("", "<details>", "<summary>STM32 package-aware matching</summary>", "",
      "AN5122 uses package + via + PCB lengths, with the arithmetic mean of differential P/N paths as DQS/CK reference. Package offsets come from ST's AA/LFBGA448 workbook, mapped by the original controller ball. Full clock paths include both sides of the series resistors. The original board declares 1.68 mm thickness but no inner-layer stackup: via-depth bounds produce length and margin intervals. Indeterminate means the interval crosses a limit; it never counts as met. Only violations proven across the entire interval gate assessment.", "",
      "| Circuit | Requirement | Wanted (mm) | Actual interval (mm) | Margin interval (mm) | Status |", "| --- | --- | --- | ---: | ---: | --- |")
    for (const row of packages) {
      const matching = row.assessment!.ddrPackageMatching!
      for (const rule of matching.constraints) lines.push(`| ${escapeCell(row.title)} | [${escapeCell(rule.name)}](${matching.sourceUrl}) | ${rule.minMm === null ? "≤" : mm(rule.minMm) + "–"}${mm(rule.maxMm)} | ${mm(rule.actualMinMm)}–${mm(rule.actualMaxMm)} | ${mm(rule.marginMinMm)}–${mm(rule.marginMaxMm)} | ${rule.status} |`)
      lines.push("", `[ST package workbook](${matching.packageSourceUrl}) · SHA-256: \`${matching.packageSha256}\`.`)
    }
    lines.push("", "</details>")
  }
  return lines
}

export function formatReport(head: BenchmarkResult, base?: BenchmarkResult): string {
  if (base && (JSON.stringify(base.fixtureHashes) !== JSON.stringify(head.fixtureHashes) || base.benchmarkRevision !== head.benchmarkRevision || base.assessmentRevision !== head.assessmentRevision || base.timeoutSeconds !== head.timeoutSeconds || base.geometryOnly !== head.geometryOnly || base.bunVersion !== head.bunVersion || base.platform !== head.platform || base.cpu !== head.cpu || base.cases.length !== head.cases.length)) throw new Error("Cannot compare runs with different fixtures, benchmark revisions, runtime, machine, or budgets")
  const columns: Comparison[] = base ? [{label:"Base",report:base},{label:"PR",report:head}] : [{label:"Local",report:head}]
  const pairs = head.cases.map((row) => {
    const before = base?.cases.find((candidate) => candidate.circuit === row.circuit)
    if (base && !before) throw new Error(`Missing base circuit ${row.circuit}`)
    return { row,before }
  })
  const changed = pairs.filter(({row,before}) => before && outcomeScore(row) !== outcomeScore(before))
  const improved = changed.filter(({row,before}) => outcomeScore(row) > outcomeScore(before!)).length
  const summaries = columns.map(({report}) => summarize(report))
  const commitLink = (sha: string): string => `[\`${sha.slice(0,7)}\`](https://github.com/tscircuit/core/commit/${sha})`
  const lines = [
    base ? "## Same Machine Benchmark Results" : "## Benchmark Results", "",
    base ? "Both revisions ran sequentially on one machine." : "Each circuit ran locally in a fresh process.", "",
    `Dataset: \`core-ddr\` · Scenarios: ${head.cases.length}`,
    base ? `Base: ${commitLink(base.coreCommit)} · PR: ${commitLink(head.coreCommit)}` : `Commit: ${commitLink(head.coreCommit)}`,
    ...(head.geometryOnly ? ["Mode: geometry audit; routing disabled."] : []), "",
    `| Solver | Metric | ${columns.map((column) => column.label).join(" | ")}${base ? " | Delta" : ""} |`,
    `| --- | --- | ${columns.map(() => "---:").join(" | ")}${base ? " | ---:" : ""} |`,
  ]
  const appendRow = (metric: string, values: string[], delta: string): void => {
    lines.push(`| Core DDR | ${metric} | ${values.join(" | ")}${base ? ` | ${delta}` : ""} |`)
  }
  const first = summaries[0], last = summaries[summaries.length-1]
  appendRow(head.geometryOnly ? "Geometry audit" : "Completion",summaries.map((s) => rate(s.completed,head.cases.length)),rateDelta(first.completed,last.completed,head.cases.length))
  if (!head.geometryOnly) appendRow("DRC pass",summaries.map((s) => rate(s.passed,head.cases.length)),rateDelta(first.passed,last.passed,head.cases.length))
  appendRow("Connected nets",summaries.map((s) => s.connectedNets === null ? "n/a" : `${s.connectedNets}/${s.requestedNets}`),countDelta(first.connectedNets,last.connectedNets))
  appendRow("DRC issues",summaries.map((s) => String(s.drcIssues ?? "n/a")),countDelta(first.drcIssues,last.drcIssues))
  for (const [metric,key] of [["Failed","failures"],["Timeouts","timeouts"],["Crashes","crashes"]] as const) appendRow(metric,summaries.map((s) => String(s[key])),countDelta(first[key],last[key]))
  for (const p of [50,60,70,80,90,95]) {
    const values = columns.map(({report}) => percentile(report.cases.map((row) => report.geometryOnly || isCompleted(row) ? row.wallMs : report.timeoutSeconds*1000),p/100))
    appendRow(`P${p} time`,values.map(formatTime),relativeDelta(values[0],values[values.length-1]))
  }
  for (const p of [50,80,90]) {
    const values = columns.map(({report}) => report.cases.some((row) => row.peakRssMb <= 0) ? null : percentile(report.cases.map((row) => row.peakRssMb),p/100))
    appendRow(`Memory P${p}`,values.map((value) => value === null ? "n/a" : `${value.toFixed(1)} MiB`),relativeDelta(values[0],values[values.length-1]))
  }
  const matched = new Set(pairs.filter(({row,before}) => isCompleted(row) && (!base || isCompleted(before!))).map(({row}) => row.circuit))
  for (const [label,key] of [["Average vias","vias"],["Average wire length (mm)","wireLengthMm"]] as const) {
    const values = columns.map(({report}) => {
      const rows = report.cases.filter((row) => matched.has(row.circuit))
      return rows.length ? rows.reduce((sum,row) => sum+row.assessment![key],0)/rows.length : null
    })
    appendRow(label,values.map((value) => value === null ? "n/a" : value.toFixed(2)),relativeDelta(values[0],values[values.length-1]))
  }
  lines.push("",...(base ? [`Outcome changes: **${improved} improved**, **${changed.length-improved} regressed**.`] : []),
    "Completion requires settled rendering, every routing phase completed and every requested net connected. DRC pass additionally requires clean physical checks, a native pad geometry audit, no error-severity reference-target violations and no matching regressions against the original routed board. Unresolved hardware limits do not count as requirements passed. DRC issues are totaled across completed circuits.",
    `Timing percentiles include all circuits, with failed and timed-out circuits counted at their configured ${head.timeoutSeconds}s timeout; negative timing deltas are faster. Per-circuit details retain actual wall time. Average vias and wire length use ${matched.size} ${base ? "matched " : ""}completed circuits. Memory percentiles use measured render-process peak RSS.`,
  )
  lines.push(...skewReport(head, base))
  for (const column of columns) lines.push(...stageTimings(column.report,column.label))
  if (changed.length) {
    lines.push("", "<details>", `<summary>Changed outcomes (${changed.length})</summary>`, "",
      "| Solver | Circuit | Base | PR | Base time | PR time | Delta |", "| --- | --- | --- | --- | ---: | ---: | --- |")
    for (const {row,before} of changed) lines.push(`| Core DDR | ${escapeCell(row.title)} | ${outcome(before!)} | ${outcome(row)} | ${formatTime(before!.wallMs)} | ${formatTime(row.wallMs)} | ${outcomeScore(row) > outcomeScore(before!) ? "Improved" : "Regressed"} |`)
    lines.push("", "</details>")
  }
  lines.push("", "<details>", `<summary>Per-circuit results (${head.cases.length})</summary>`, "",
    `| Circuit | Metric | ${columns.map((column) => column.label).join(" | ")}${base ? " | Delta" : ""} |`,
    `| --- | --- | ${columns.map(() => "---:").join(" | ")}${base ? " | ---:" : ""} |`)
  for (const {row,before} of pairs) {
    const rows = before ? [before,row] : [row]
    const append = (metric: string, values: string[], delta: string): void => {
      lines.push(`| ${escapeCell(row.title)} | ${metric} | ${values.join(" | ")}${base ? ` | ${delta}` : ""} |`)
    }
    append("Outcome",rows.map(outcome),before && outcomeScore(before) !== outcomeScore(row) ? outcomeScore(row)>outcomeScore(before) ? "Improved" : "Regressed" : "—")
    append("Connected nets",rows.map((c) => c.assessment ? `${c.assessment.connectedNets}/${c.assessment.requestedNets}` : "n/a"),countDelta(before?.assessment?.connectedNets ?? null,row.assessment?.connectedNets ?? null))
    append("Wall time",rows.map((c) => formatTime(c.wallMs)),relativeDelta(before?.wallMs ?? null,row.wallMs))
    append("Peak RSS",rows.map((c) => c.peakRssMb > 0 ? `${c.peakRssMb.toFixed(1)} MiB` : "n/a"),relativeDelta(before?.peakRssMb ?? null,row.peakRssMb))
    append("Vias",rows.map((c) => String(c.assessment?.vias ?? "n/a")),countDelta(before?.assessment?.vias ?? null,row.assessment?.vias ?? null))
    append("Wire length (mm)",rows.map((c) => c.assessment ? c.assessment.wireLengthMm.toFixed(2) : "n/a"),relativeDelta(before?.assessment?.wireLengthMm ?? null,row.assessment?.wireLengthMm ?? null))
    append("DRC issues",rows.map((c) => String(drcIssues(c) ?? "n/a")),countDelta(before ? drcIssues(before) : null,drcIssues(row)))
    append("Unfinished phase",rows.map((c) => {
      const phase = c.progress?.phases.findLast((p) => p.status !== "completed")
      return phase ? escapeCell(`${phase.phase} (${phase.solver ?? "unknown"})`) : "—"
    }),"—")
  }
  lines.push("", "</details>", "", "<details>", "<summary>Dependency versions</summary>", "",
    `| Package | ${columns.map((column) => column.label).join(" | ")} |`, `| --- | ${columns.map(() => "---").join(" | ")} |`)
  for (const name of new Set(columns.flatMap(({report}) => Object.keys(report.dependencies)))) lines.push(`| ${escapeCell(name)} | ${columns.map(({report}) => escapeCell(report.dependencies[name])).join(" | ")} |`)
  lines.push("", "</details>", "", "<details>", "<summary>Runtime, provenance and scope</summary>", "",
    `Bun ${escapeCell(head.bunVersion)} · ${escapeCell(head.platform)} · ${escapeCell(head.cpu)} · ${head.timeoutSeconds}s render budget per circuit.`,
    `Benchmark render fingerprint: \`${head.benchmarkRevision}\`.`, `Assessment fingerprint: \`${head.assessmentRevision}\`.`,
    ...(head.assessmentRevision !== head.benchmarkRevision ? ["Saved copper was revalidated with a different assessment revision; render timings are unchanged."] : []), "",
    "Each circuit runs in a fresh process. Validation runs separately from render timing. Completed stages retain copper in SRJ artifacts; if a later stage fails, Core may emit no final PCB traces. Connected-net counts refer to saved Circuit JSON.", "",
    "The extracted DDR subsystem retains native component placement, all pads of selected components, source signal layers and routing rules. Existing copper is removed; irregular board edges use a bounding box and unsupported pad shapes use recorded approximations. Results do not establish DDR timing, skew, impedance or hardware qualification.", "", "</details>")
  return lines.join("\n")+"\n"
}

if (import.meta.main) {
  const { readFileSync,writeFileSync } = await import("node:fs")
  const [headFile,baseFile,output] = process.argv.slice(2)
  const head = JSON.parse(readFileSync(headFile,"utf8"))
  const base = baseFile && baseFile !== "-" ? JSON.parse(readFileSync(baseFile,"utf8")) : undefined
  const report = formatReport(head,base)
  if (output) writeFileSync(output,report)
  else process.stdout.write(report)
}

import type { BenchmarkResult, CaseResult } from "./types"

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
    "Completion requires settled rendering, every routing phase completed and every requested net connected. DRC pass additionally requires clean physical checks and a native pad geometry audit. DRC issues are totaled across completed circuits.",
    `Timing percentiles include all circuits, with failed and timed-out circuits counted at their configured ${head.timeoutSeconds}s timeout; negative timing deltas are faster. Per-circuit details retain actual wall time. Average vias and wire length use ${matched.size} ${base ? "matched " : ""}completed circuits. Memory percentiles use measured render-process peak RSS.`,
  )
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

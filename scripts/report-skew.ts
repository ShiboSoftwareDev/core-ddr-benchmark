import type { BenchmarkResult } from "./types"
import { getDdrSkewGroupNames } from "./ddr-skew"

type Check = {
  key: string
  circuit: string
  name: string
  target: string
  actual: string
  value: number | null
  status: "met" | "exceeded" | "incomplete" | "indeterminate"
  comparison: boolean
  skew: boolean
}

const cell = (text: string) => text.replace(/[&<>|\r\n]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "|": "&#124;", "\r": " ", "\n": " " })[c]!)
const number = (value: number | null | undefined) => value == null ? "n/a" : Math.abs(value) < 1e-7 ? "0.000" : value.toFixed(3)
const range = (min: number | null | undefined, max: number | null | undefined) => min == null && max == null ? "n/a" : min != null && max != null && Math.abs(min - max) < 1e-7 ? number(min) : `[${number(min)}, ${number(max)}]`
const delta = (before: number | null | undefined, after: number | null | undefined) => before == null || after == null ? "n/a" : `${after - before >= 0 ? "+" : ""}${number(after - before)}`
const status = (check: Check | undefined) => !check ? "n/a" : (check.comparison ? "Info: " : "") + ({ met: "Pass", exceeded: "Fail", incomplete: "Incomplete", indeterminate: "Uncertain" })[check.status]
const shortName = (name: string) => (name.startsWith("/") ? name.slice(name.lastIndexOf("/") + 1) : name)
  .replace(/ \((?:Allwinner|NXP|UG388|§[^)]*|original matching)\)$/, "")

function checks(report: BenchmarkResult): Check[] {
  return report.cases.flatMap(({ circuit, assessment }) => {
    const pcb: Check[] = (assessment?.ddrConstraints ?? []).map((check) => {
      const skew = check.maxLengthSkew !== undefined || check.skewReference === "signed_pair"
      const target = check.skewReference === "signed_pair" ? `[${number(check.minSignedSkew)}, ${number(check.maxSignedSkew)}]`
        : skew ? `${check.skewComparison === "lt" ? "<" : "≤"}${number(check.maxLengthSkew)}`
        : check.minLength === undefined && check.maxLength === undefined ? "n/a" : check.minLength === undefined ? `≤${number(check.maxLength)}` : check.maxLength === undefined ? `≥${number(check.minLength)}` : `[${number(check.minLength)}, ${number(check.maxLength)}]`
      return {
        key: `${circuit}:pcb:${check.name}`, circuit,
        name: shortName(check.name) + (check.skewReference === "mean" ? " (from mean)" : ""),
        target: target === "n/a" ? target : `${check.basis === "original_matching" ? "Orig " : ""}${target} mm`,
        actual: skew ? number(check.actualSkewMm) : range(check.actualMinMm, check.actualMaxMm),
        value: skew ? check.actualSkewMm : check.actualMinMm === check.actualMaxMm ? check.actualMinMm : null,
        status: check.status, comparison: (check.severity ?? "error") !== "error", skew,
      }
    })
    const pkg: Check[] = (assessment?.ddrPackageMatching?.constraints ?? []).map((check) => ({
      key: `${circuit}:package:${check.name}`, circuit, name: check.name,
      target: (check.minMm === null ? `≤${number(check.maxMm)}` : `[${number(check.minMm)}, ${number(check.maxMm)}]`) + " mm",
      actual: range(check.actualMinMm, check.actualMaxMm),
      value: check.actualMinMm === check.actualMaxMm ? check.actualMinMm : null,
      status: check.status, comparison: false,
      // The two clock-mean maxima are length checks, not skew checks.
      skew: !check.name.endsWith(" mean length"),
    }))
    const timing: Check[] = (assessment?.ddrDelayMatching?.constraints ?? []).map((check) => ({
      key: `${circuit}:timing:${check.name}`, circuit, name: shortName(check.name), target: `±${number(check.maxSkewPs)} ps`,
      actual: range(check.actualMinPs, check.actualMaxPs),
      value: check.actualMinPs === check.actualMaxPs ? check.actualMinPs : null,
      status: check.status, comparison: false, skew: true,
    }))
    return [...pcb, ...pkg, ...timing]
  })
}

export function skewCheckCounts(report: BenchmarkResult) {
  if (report.cases.some(({ assessment }) => !assessment || assessment.ddrConstraints === undefined && !assessment.ddrPackageMatching && !assessment.ddrDelayMatching)) return null
  const required = checks(report).filter((check) => check.skew && !check.comparison)
  return {
    passed: required.filter((check) => check.status === "met").length,
    failed: required.filter((check) => check.status === "exceeded").length,
    incomplete: required.filter((check) => check.status === "incomplete").length,
    uncertain: required.filter((check) => check.status === "indeterminate").length,
  }
}

export function skewReport(head: BenchmarkResult, base?: BenchmarkResult): string[] {
  const columns = base ? ["Base", "PR"] : ["Local"]
  const rows = head.cases.flatMap((row) => {
    const before = base?.cases.find((candidate) => candidate.circuit === row.circuit)
    const groups = new Set([...getDdrSkewGroupNames(row.circuit), ...Object.keys(row.assessment?.ddrSkew ?? {}), ...Object.keys(before?.assessment?.ddrSkew ?? {})])
    return [...groups].map((group) => ({ circuit: row.circuit, group, values: (base ? [before, row] : [row]).map((sample) => sample?.assessment?.ddrSkew?.[group]) }))
  })
  const measured = columns.map((_, i) => rows.filter((row) => row.values[i]?.skewMm != null).length)
  const matched = rows.filter((row) => row.values.every((value) => value?.skewMm != null))
  const lines = ["", "### Length matching", "",
    "Skew counts are individual required checks, not whole boards. Incomplete = missing routes; uncertain = unresolved timing. Lower skew is better.", "",
    `| Metric | ${columns.join(" | ")}${base ? " | Delta" : ""} |`,
    `| --- | ${columns.map(() => "---:").join(" | ")}${base ? " | ---:" : ""} |`,
    `| Measured groups | ${measured.map((count) => `${count}/${rows.length}`).join(" | ")}${base ? ` | ${measured[1] - measured[0]}` : ""} |`,
  ]
  for (const [label, aggregate] of [["Mean skew (mm)", (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length], ["Worst skew (mm)", (values: number[]) => Math.max(...values)]] as const) {
    const values = columns.map((_, i) => matched.length ? aggregate(matched.map((row) => row.values[i]!.skewMm!)) : null)
    lines.push(`| ${label} | ${values.map(number).join(" | ")}${base ? ` | ${delta(values[0], values[1])}` : ""} |`)
  }
  lines.push("", `Mean and worst use ${matched.length} ${base ? "matched " : ""}complete groups. Missing results are n/a.`, "",
    "<details>", "<summary>Matching against the original board</summary>", "",
    "Preserved means no worse than the original board. Timing limits are checked separately. ST P/N pairs are informational.", "",
    `| Circuit | Lane | Original (mm) | ${columns.map((name) => `${name} (mm)`).join(" | ")}${base ? " | Delta (mm)" : ""} | Matching |`,
    `| --- | --- | ---: | ${columns.map(() => "---:").join(" | ")}${base ? " | ---:" : ""} | --- |`)
  for (const row of rows) {
    const current = row.values.at(-1)
    const original = current?.referenceSkewMm ?? row.values[0]?.referenceSkewMm
    const matching = !current?.matchingStatus || current.matchingStatus === "no_reference" ? "n/a" : ({ preserved: "Preserved", regressed: "Regressed", incomplete: "Incomplete" })[current.matchingStatus]
    lines.push(`| ${cell(row.circuit)} | ${cell(row.group)} | ${number(original)} | ${row.values.map((value) => number(value?.skewMm)).join(" | ")}${base ? ` | ${delta(row.values[0]?.skewMm, current?.skewMm)}` : ""} | ${current?.preservationComparisonOnly ? "Info: " : ""}${matching} |`)
  }
  lines.push("", "</details>", "", "<details>", "<summary>Length and skew checks</summary>", "",
    "Values use the unit in Target. Orig = original-board matching target. Info = comparison only. Timing estimates can be uncertain.", "",
    `| Circuit | Check | Target | ${columns.join(" | ")}${base ? " | Delta" : ""} | Status |`,
    `| --- | --- | ---: | ${columns.map(() => "---:").join(" | ")}${base ? " | ---:" : ""} | --- |`)
  const currentChecks = checks(head), oldChecks = base ? checks(base) : []
  const all = new Map([...oldChecks, ...currentChecks].map((check) => [check.key, check]))
  const currentByKey = new Map(currentChecks.map((check) => [check.key, check]))
  const oldByKey = new Map(oldChecks.map((check) => [check.key, check]))
  for (const [key, check] of all) {
    const current = currentByKey.get(key), before = oldByKey.get(key)
    lines.push(`| ${cell(check.circuit)} | ${cell(check.name)} | ${cell(check.target)} | ${(base ? [before, current] : [current]).map((value) => value?.actual ?? "n/a").join(" | ")}${base ? ` | ${delta(before?.value, current?.value)}` : ""} | ${status(current)} |`)
  }
  if (!all.size) lines.push(`| — | Checks not recorded | — | ${columns.map(() => "n/a").join(" | ")}${base ? " | n/a" : ""} | n/a |`)
  lines.push("", "</details>")
  const audited = head.cases.filter((row) => row.assessment?.ddrLaneAudit)
  if (audited.length) {
    lines.push("", "<details>", "<summary>Lane audit</summary>", "",
      "Full signal mappings, sources and routing targets are in results.json.", "",
      "| Circuit | Groups | Cross-lane decisions | Reset/static paths | Uncovered signals |", "| --- | ---: | ---: | ---: | ---: |")
    for (const row of audited) {
      const audit = row.assessment!.ddrLaneAudit!
      lines.push(`| ${cell(row.circuit)} | ${audit.lanes.length} | ${audit.relationships.length} | ${audit.excludedSignals.length} | ${audit.lanes.reduce((sum, lane) => sum + lane.uncoveredSignals.length, 0)} |`)
    }
    lines.push("", "</details>")
  }
  return lines
}

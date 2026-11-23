import { compareSkewGroups, getSkewGroups } from "./skew"
import type { BenchmarkResult, SkewGroupResult } from "./types"

function comparisons(head: BenchmarkResult, base?: BenchmarkResult) {
  return head.cases.flatMap((row) => {
    const before = base?.cases.find((candidate) => candidate.circuit === row.circuit)
    const unavailable = () => getSkewGroups(row.circuit).map((group) => ({
      name: group.name, kind: group.kind,
      signals: Object.keys(group.signals).map((name) => ({ name, lengthMm: null })),
      minLengthMm: null, maxLengthMm: null, skewMm: null,
    }))
    const headGroups = row.assessment?.skewGroups ?? unavailable()
    const baseGroups = before ? before.assessment?.skewGroups ?? unavailable() : []
    const names = [...new Set([...getSkewGroups(row.circuit), ...headGroups, ...baseGroups].map((group) => group.name))]
    return names.map((name) => {
      const after = headGroups.find((group) => group.name === name)
      const before = baseGroups.find((group) => group.name === name)
      return { circuit: row.circuit, title: row.title, name, after, before,
        change: after ? compareSkewGroups(after, before) : before?.skewMm !== null && before !== undefined ? "Lost coverage" : "Unavailable" }
    })
  })
}

const mm = (value: number | null | undefined) => value === null || value === undefined ? "n/a" : value.toFixed(6)
const cell = (value: string) => value.replace(/[&<>|\r\n]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "|": "&#124;", "\r": " ", "\n": " " })[character]!)
function delta(after?: SkewGroupResult, before?: SkewGroupResult): string {
  if (after?.skewMm === null || after?.skewMm === undefined || before?.skewMm === null || before?.skewMm === undefined) return "n/a"
  const difference = after.skewMm - before.skewMm
  return `${difference > 0 ? "+" : ""}${difference.toFixed(6)}`
}
function coverage(group?: SkewGroupResult): string {
  return group ? `${group.signals.filter((signal) => signal.lengthMm !== null).length}/${group.signals.length}` : "n/a"
}

export function skewReportLines(head: BenchmarkResult, base?: BenchmarkResult): string[] {
  const compared = comparisons(head, base)
  if (!compared.length) return ["", "Length matching unavailable: these results contain no skew assessments. Reassess saved copper with this benchmark revision."]
  const sides = base ? ["Base", "PR"] : ["Local"]
  const afterComplete = compared.filter((row) => row.after?.skewMm !== null && row.after?.skewMm !== undefined).length
  const beforeComplete = compared.filter((row) => row.before?.skewMm !== null && row.before?.skewMm !== undefined).length
  const lines = ["", base
    ? `Length matching: **${compared.filter((row) => row.change === "Regressed").length} regressed**, **${compared.filter((row) => row.change === "Lost coverage").length} lost coverage**, ${compared.filter((row) => row.change === "Improved").length} improved, ${compared.filter((row) => row.change === "Preserved").length} preserved. Complete groups: Base ${beforeComplete}/${compared.length}, PR ${afterComplete}/${compared.length}; ${compared.filter((row) => ["Unavailable", "New coverage"].includes(row.change)).length} cannot establish preservation.`
    : `Length matching: ${afterComplete}/${compared.length} groups have complete copper paths.`,
    "Skew is max minus min controller-to-receiver planar copper length in mm. Data bytes include DQ, DM and both DQS legs; strobe and clock pairs are also measured separately. Positive skew deltas are worse. Every signal in a group must be connected; incomplete groups are n/a, never zero. Measurements can survive a later phase failure if final Circuit JSON retains their complete copper.", "",
    `| Matching group | ${sides.join(" worst skew (mm) | ")} worst skew (mm)${base ? " | Delta (mm)" : ""} |`,
    `| --- | ${sides.map(() => "---:").join(" | ")}${base ? " | ---:" : ""} |`,
  ]
  for (const [kind, label] of [["data_byte", "Data byte"], ["differential_pair", "Differential pair"], ["address_command", "Address/command"]] as const) {
    const matched = compared.filter((row) => row.after?.kind === kind && row.after.skewMm !== null && (!base || row.before?.skewMm !== null && row.before?.skewMm !== undefined))
    const after = matched.length ? Math.max(...matched.map((row) => row.after!.skewMm!)) : null
    const before = matched.length && base ? Math.max(...matched.map((row) => row.before!.skewMm!)) : null
    const difference = before === null || after === null ? null : after - before
    lines.push(`| ${label} (${matched.length} ${base ? "matched " : ""}groups) | ${base ? `${mm(before)} | ` : ""}${mm(after)}${base ? ` | ${difference !== null && difference > 0 ? "+" : ""}${mm(difference)}` : ""} |`)
  }
  lines.push("", "<details>", `<summary>DDR length matching (${compared.length} groups)</summary>`, "",
    `| Circuit | Group | ${sides.map((side) => `${side} paths | ${side} min–max (mm) | ${side} skew (mm)`).join(" | ")}${base ? " | Delta (mm) | Change" : ""} |`,
    `| --- | --- | ${sides.map(() => "---: | ---: | ---:").join(" | ")}${base ? " | ---: | ---" : ""} |`)
  for (const row of compared) {
    const groups = base ? [row.before, row.after] : [row.after]
    lines.push(`| ${cell(row.title)} | ${cell(row.name)} | ${groups.map((group) => `${coverage(group)} | ${group?.skewMm === null || !group ? "n/a" : `${mm(group.minLengthMm)}–${mm(group.maxLengthMm)}`} | ${mm(group?.skewMm)}`).join(" | ")}${base ? ` | ${delta(row.after, row.before)} | ${row.change}` : ""} |`)
  }
  lines.push("", "Per-signal lengths are retained in assessment.json and results.json. A13 sums copper on both sides of its series resistors. A64 and STM32MP157 clocks cover only the retained RAM side of their series resistors. Via barrel lengths, passive bodies, package delays and propagation velocity are excluded. These are geometric length differences, not timing skew or hardware qualification.", "", "</details>")
  return lines
}

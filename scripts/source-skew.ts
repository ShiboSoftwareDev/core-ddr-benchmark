import audit from "../provenance/source-skew.json"
import type { BenchmarkResult, SourceSkewAudit } from "./types"

export function getSourceSkewAudit(circuit: string): SourceSkewAudit {
  const source = (audit as unknown as Record<string, SourceSkewAudit>)[circuit]
  if (!source) throw new Error(`Missing source constraint audit for ${circuit}`)
  return source
}

const cell = (value: string) => value.replace(/[&<>|\r\n]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "|": "&#124;", "\r": " ", "\n": " " })[character]!)

export function sourceSkewReportLines(report: BenchmarkResult): string[] {
  const lines = ["", "<details>", "<summary>Source length/skew constraint audit</summary>", "",
    "Source declarations are recorded on every run. They are not substituted for physical matching groups or used to claim source DRC compliance. Missing limits remain unspecified; malformed conditions and per-pattern tuning modes remain visible.", "",
    "| Circuit | Source declarations | DDR tuning patterns | Via height included by source |",
    "| --- | --- | ---: | --- |",
  ]
  for (const row of report.cases) {
    const source = report.sourceSkew[row.circuit]
    const invalid = source.constraints.filter((rule) => rule.status === "invalid_condition").length
    const declaration = source.constraints.length ? `${source.constraints.length} custom rules (${invalid} malformed)` : "No custom length/skew rules"
    lines.push(`| ${cell(row.title)} | ${declaration} | ${source.tuningPatterns.length} | ${source.useHeightForLengthCalcs === null ? "not recorded" : source.useHeightForLengthCalcs ? "yes" : "no"} |`)
  }
  lines.push("", "| Circuit | Source rule | Kind | Bounds | Condition | Status |", "| --- | --- | --- | --- | --- | --- |")
  for (const row of report.cases) {
    const source = report.sourceSkew[row.circuit]
    for (const rule of source.constraints) {
      const url = `https://github.com/${source.repo}/blob/${source.commit}/${rule.sourcePath.split("/").map(encodeURIComponent).join("/")}`
      lines.push(`| ${cell(row.title)} | [${cell(rule.name)}](${url}) | ${rule.kind} | ${Object.entries(rule.bounds).map(([key, value]) => `${key} ${cell(value)}`).join(", ")} | ${cell(rule.condition)} | ${rule.status} |`)
    }
  }
  for (const row of report.cases) {
    const source = report.sourceSkew[row.circuit]
    if (source.tuningPatterns.length) {
      const modes = new Map<string, number>()
      for (const pattern of source.tuningPatterns) {
        const mode = pattern.fields.tuning_mode ?? "unspecified"
        modes.set(mode, (modes.get(mode) ?? 0) + 1)
      }
      lines.push("", `${cell(row.title)} tuning modes: ${[...modes].map(([mode, count]) => `${cell(mode)}: ${count}`).join(", ")}. Stored skew fields in length mode do not define a global skew limit.`)
    }
    if (source.constraints.length || source.tuningPatterns.length) lines.push("", ...source.notes.slice(2).map(cell))
  }
  lines.push("", "Exact targets, source paths and SHA-256 hashes are retained in results.json under sourceSkew. The committed source audit can be regenerated with python3 scripts/source_skew.py.", "", "</details>")
  return lines
}

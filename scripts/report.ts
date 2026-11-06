import type { BenchmarkResult, CaseResult } from "./types"

function cells(result: CaseResult): string {
  const a = result.assessment
  const drc = a ? Object.entries(a.findings).filter(([name]) => !["missing_traces","disconnected_ports"].includes(name)).reduce((sum,[,count]) => sum+count,0) : null
  const phase = result.progress?.phases.findLast((p) => p.status !== "completed")
  return `${result.status} | ${a ? `${a.connectedNets}/${a.requestedNets}` : "unavailable"} | ${(result.wallMs/1000).toFixed(2)} | ${result.peakRssMb.toFixed(0)} | ${a?.vias ?? "—"} | ${drc ?? "—"} | ${phase ? `${phase.phase} (${phase.solver})` : "—"}`
}

export function formatReport(head: BenchmarkResult, base?: BenchmarkResult): string {
  if (base && (JSON.stringify(base.fixtureHashes) !== JSON.stringify(head.fixtureHashes) || base.benchmarkRevision !== head.benchmarkRevision || base.timeoutSeconds !== head.timeoutSeconds || base.geometryOnly !== head.geometryOnly || base.bunVersion !== head.bunVersion || base.platform !== head.platform || base.cpu !== head.cpu || base.cases.length !== head.cases.length)) throw new Error("Cannot compare runs with different fixtures, benchmark revisions, runtime, machine, or budgets")
  const lines = ["## Core DDR workflow benchmark", "", `Core: \`${head.coreCommit}\`${base ? ` (base \`${base.coreCommit}\`)` : ""}. Benchmark: \`${head.benchmarkRevision}\`.`, `Bun ${head.bunVersion}; ${head.platform}; ${head.cpu}. Fresh process per circuit, ${head.timeoutSeconds}s render budget.`, "", "| Circuit | Revision | Status | Connected nets | Wall s | Peak RSS MB | Vias | DRC errors | Unfinished phase |", "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |"]
  for (const result of head.cases) {
    const before = base?.cases.find((b) => b.circuit === result.circuit)
    if (base && !before) throw new Error(`Missing base circuit ${result.circuit}`)
    if (before) lines.push(`| ${result.title} | base | ${cells(before)} |`)
    lines.push(`| ${result.title} | ${base ? "head" : "local"} | ${cells(result)} |`)
  }
  lines.push("", "Wall time includes module loading and TSX rendering; validation runs separately. RSS is sampled from the render process on Linux. DRC counts are findings, not unique defects. A pass requires completed rendering, every requested net connected, no routing errors, a valid geometry audit, and zero check errors. A timeout retains completed phases and partial copper.", "", "### Routing phases", "", "| Circuit | Phase | Solver | State | Seconds |", "| --- | --- | --- | --- | ---: |")
  for (const result of head.cases) for (const p of result.progress?.phases ?? []) lines.push(`| ${result.circuit} | ${p.phase} | ${p.solver ?? "unknown"} | ${p.status} | ${p.durationMs === null ? "—" : (p.durationMs/1000).toFixed(3)} |`)
  lines.push("", "### Dependency versions", "", "| Package | Base | Head/local |", "| --- | --- | --- |")
  for (const [name,version] of Object.entries(head.dependencies)) lines.push(`| ${name} | ${base?.dependencies[name] ?? "—"} | ${version} |`)
  lines.push("", "Completed routing stages retain copper in their SRJ artifacts. If a later stage fails, Core may emit no final PCB traces; the connected-net count refers to final Circuit JSON only.", "", "This measures the extracted DDR subsystem through TSX/Core, including bus phases and remaining local routing. Native component placement, all pads of selected components, source signal layers and source routing rules are retained. Existing copper is removed. Irregular board edges use a bounding box; unsupported pad shapes use recorded approximations. Results do not establish DDR timing, skew, impedance, or hardware qualification.")
  return lines.join("\n") + "\n"
}

if (import.meta.main) {
  const { readFileSync, writeFileSync } = await import("node:fs")
  const [headFile, baseFile, output] = process.argv.slice(2)
  const head = JSON.parse(readFileSync(headFile,"utf8"))
  const base = baseFile && baseFile !== "-" ? JSON.parse(readFileSync(baseFile,"utf8")) : undefined
  const report = formatReport(head,base)
  if (output) writeFileSync(output,report)
  else process.stdout.write(report)
}

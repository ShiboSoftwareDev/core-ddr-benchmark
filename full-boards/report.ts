import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { Resvg } from "@resvg/resvg-js"

const resultsRoot = resolve(process.argv[2] ?? "../results")
const output = join(resultsRoot, "full-board-results")
mkdirSync(output, { recursive: true })
const manifest = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8"))
const escape = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;")
const rows = manifest.map((fixture: any) => {
  const attempts = ["full-boards-phased", "full-boards-final"].map((run) => {
    const folder = join(resultsRoot, run, fixture.id)
    const progress = JSON.parse(readFileSync(join(folder, "progress.json"), "utf8"))
    const processResult = JSON.parse(readFileSync(join(folder, "process.json"), "utf8"))
    const assessment = JSON.parse(readFileSync(join(folder, "assessment.json"), "utf8"))
    const previewFolder = join(folder, "completed-phases")
    const previewAssessment = JSON.parse(readFileSync(join(previewFolder, "assessment.json"), "utf8"))
    const status = processResult.timedOut ? "timeout" : processResult.exitCode !== 0 || !progress.renderCompleted || progress.errors.length || assessment.geometryErrors.length || assessment.membershipErrors.length || Object.values(assessment.findings).some((n) => Number(n)>0) || assessment.connectedNets !== assessment.routableNets ? "failed" : "passed"
    return { run, folder, progress, processResult, assessment, previewFolder, previewAssessment, status }
  })
  return { ...fixture, attempts }
})
writeFileSync(join(output, "results.json"), JSON.stringify(rows, null, 2))

const tiles = rows.map((row: any, index: number) => {
  const attempt = row.attempts[0]
  const svg = readFileSync(join(attempt.previewFolder, "pcb.svg"), "utf8")
  const body = svg.replace(/^.*?<svg\b[^>]*>/s, "").replace(/<\/svg>\s*$/, "")
    .replace(/\bid="([^"]+)"/g, `id="board${index}_$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#board${index}_$1)`)
    .replace(/href="#([^"]+)"/g, `href="#board${index}_$1"`)
  const x = 24+(index%2)*1000
  const y = 120+Math.floor(index/2)*800
  return `<g><rect x="${x}" y="${y}" width="976" height="776" rx="12" fill="#171e29"/><text x="${x+24}" y="${y+38}" fill="#f0f5ff" font-size="23" font-family="sans-serif">${escape(row.title)}</text><text x="${x+24}" y="${y+68}" fill="#aebbd0" font-size="17" font-family="sans-serif">${row.parts} parts · ${row.pads} pads · ${row.nets} nets</text><text x="${x+24}" y="${y+98}" fill="${attempt.status==='passed'?'#84e9a3':'#f4bd6a'}" font-size="17" font-family="sans-serif">${attempt.status.toUpperCase()} · saved copper: ${attempt.previewAssessment.connectedNets}/${row.routableNets} nets · ${attempt.previewAssessment.pcbTraces} traces</text><svg x="${x+12}" y="${y+114}" width="952" height="654.5" viewBox="0 0 1600 1100">${body}</svg></g>`
}).join("\n")
const contact = `<svg xmlns="http://www.w3.org/2000/svg" width="2024" height="2544" viewBox="0 0 2024 2544"><rect width="2024" height="2544" fill="#0b1018"/><text x="48" y="52" fill="#f0f5ff" font-family="sans-serif" font-size="32">Six full-board TSX recreations — saved fresh-routing copper</text><text x="48" y="88" fill="#aebbd0" font-family="sans-serif" font-size="20">Incomplete runs include saved completed phases. No original tracks, vias or filled zones were imported.</text>${tiles}</svg>`
writeFileSync(join(output, "six-boards.pcb.svg"), contact)
writeFileSync(join(output, "six-boards.png"), new Resvg(contact, { fitTo: { mode: "width", value: 1800 } }).render().asPng())

const table = rows.map((row: any) => {
  const a = row.attempts[0], b = row.attempts[1]
  return `| ${row.title} | ${row.parts} | ${row.nets} | ${a.assessment.connectedNets}/${row.routableNets} | ${a.previewAssessment.connectedNets}/${row.routableNets} | ${a.status} | ${b.status} |`
}).join("\n")
const details = rows.map((row: any) => {
  const attempts = row.attempts.map((a: any) => {
    const issues = [...new Set<string>(a.progress.errors)].map((e) => `  - ${e.replaceAll("\n", " ")}`).join("\n")
    const phases = a.progress.phases.map((p: any) => `${p.name}: ${p.status}`).join(", ")
    return `- ${a.run}: **${a.status}**, ${a.assessment.connectedNets}/${row.routableNets} nets physically connected in final published copper, ${a.assessment.pcbTraces} PCB traces, ${a.assessment.vias} vias. Saved completed-phase preview: ${a.previewAssessment.connectedNets}/${row.routableNets} nets, ${a.previewAssessment.pcbTraces} traces. ${phases}\n${issues}`
  }).join("\n")
  return `### ${row.title}\n\n[TSX circuit](../../full-boards/${row.id}/board.tsx) · [PCB SVG with saved copper](../full-boards-phased/${row.id}/completed-phases/pcb.svg) · [Final core PCB SVG](../full-boards-phased/${row.id}/pcb.svg)\n\n${attempts}\n\nSource: ${JSON.parse(readFileSync(new URL('./'+row.id+'/source.json', import.meta.url),'utf8')).source.repo}; pinned PCB SHA-256 and commit are recorded in the source JSON.\n`
}).join("\n")
const report = `# Full-board fresh-routing results\n\nAll six native component inventories and electrical netlists are reconstructed as TSX components and unordered nets. Power, ground, VREF, ZQ, peripheral circuitry, connectors, mechanical holes and single-terminal nets are retained. Source tracks, vias, saved fills and saved routing were removed. Authored zone boundaries and net/layer ownership are retained for fresh plane generation.\n\nTwo explicit runs were made per board: the usual repro phase ordering (DDR byte buses, remaining DDR, all other board nets) and an upfront BGA-boundary-fanout run followed by the same phases. Failures and timeouts remain failures. The upfront configuration was rejected on several boards; those errors are distinguished from the usual phased routing results. SVGs show actual emitted copper, including incomplete results.\n\n| Board | Parts | All nets | Final connected / routable | Saved copper connected / routable | Phased run | Upfront fanout run |\n| --- | ---: | ---: | ---: | ---: | --- | --- |\n${table}\n\nOne-terminal nets are retained in the logical circuit but require no inter-pad copper. Copper continuity is assessed conservatively at the native port centers, with via and T-junction connectivity; fanout stubs alone do not count as complete nets. All components and copper/mechanical pad positions and all source-net memberships are audited against the extracted source. In addition, all 2,556 DDR pad positions match the earlier benchmark geometry; source-audit.json records these comparisons and hardware source hash checks. Detailed geometry and physical findings are in each assessment.json/findings.json.\n\nTSX uses native arbitrary-pinout components; it does not invent processor or peripheral simulation models. Arc edges and custom pad curves are tessellated. Soldermask/paste artwork and logos are omitted. Per-net manufactured widths and source clearance classes are recorded; routing uses the retained board-level DDR clearance. Authored zone intent is retained for fresh pours. Some native rule-area, per-segment width, thermal-relief, timing and impedance constraints remain outside these runs.\n\nRuntime: consult each progress.json and patched-core/build.json for the actual dependency versions and source revisions, and each process.json for its limit. runtime.mjs selects the workspace Pipeline 9 checkout.\n\nReproduce from full-boards:\n\n\`\`\`sh\nbun install --frozen-lockfile\nbun run.ts ../results/full-boards-phased\nFULL_BOARD_ROUTE_MODE=fanout bun run.ts ../results/full-boards-final\n\`\`\`\n\nRegenerate extraction with Python 3 and shapely 2.1.2 using fetch.py, then extract.py. The original pinned KiCad sources are hash-verified into ../.source-cache. Original hardware licenses remain in ../licenses and ../LICENSE. The workspace autorouter source and its installed dependencies are required next to this repository.\n\n${details}`
writeFileSync(join(output, "REPORT.md"), report)
console.log(JSON.stringify({ output, boards: rows.length }))

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"

const [id, folderArg] = process.argv.slice(2)
const folder = resolve(folderArg)
const source = JSON.parse(readFileSync(new URL(`./${id}/source.json`, import.meta.url), "utf8"))
const actual: any[] = JSON.parse(readFileSync(join(folder, "circuit.json"), "utf8"))
const progress = JSON.parse(readFileSync(join(folder, "progress.json"), "utf8"))
const accepted = new Map<string, any>()
for (const name of readdirSync(folder).filter((name) => /^phase-\d+-(input|output)\.srj\.json$/.test(name)).sort()) {
  const phaseIndex = Number(/^phase-(\d+)-/.exec(name)![1])-1
  if (name.includes("-output.") && progress.phases[phaseIndex]?.status !== "completed") continue
  const srj = JSON.parse(readFileSync(join(folder, name), "utf8"))
  for (const trace of srj.traces) accepted.set(trace.pcb_trace_id, trace)
}
const json = [...actual]
const published = new Set(actual.filter((e) => e.type === "pcb_trace").map((e) => e.pcb_trace_id))
const layers = Array.from({ length: source.layers }, (_, i) => i === 0 ? "top" : i === source.layers-1 ? "bottom" : `inner${i}`)
let viaIndex = 0
for (const trace of accepted.values()) {
  if (published.size > 0) continue
  const identity = trace.source_trace_id ?? trace.connection_name
  const net = actual.find((e) => e.type === "source_net" && e.source_net_id === identity)
  const sourceTrace = net
    ? actual.find((e) => e.type === "source_trace" && e.connected_source_net_ids?.includes(net.source_net_id))
    : actual.find((e) => e.type === "source_trace" && e.source_trace_id === identity)
  if (!sourceTrace) throw new Error(`No native source identity for completed phase trace ${trace.pcb_trace_id}: ${identity}`)
  const connectivityKey = sourceTrace.subcircuit_connectivity_map_key
  json.push({ ...trace, source_trace_id: sourceTrace.source_trace_id, subcircuit_connectivity_map_key: connectivityKey, subcircuit_id: sourceTrace.subcircuit_id })
  for (const point of trace.route) {
    if (point.route_type !== "via") continue
    json.push({ type: "pcb_via", pcb_via_id: `completed_phase_via_${viaIndex++}`, pcb_trace_id: trace.pcb_trace_id,
      x: point.x, y: point.y, layers: point.layers ?? layers,
      from_layer: point.from_layer, to_layer: point.to_layer,
      outer_diameter: point.via_diameter ?? source.rules.viaPad,
      hole_diameter: point.via_hole_diameter ?? source.rules.viaDrill,
      subcircuit_connectivity_map_key: connectivityKey, subcircuit_id: sourceTrace.subcircuit_id })
  }
}
const previewFolder = join(folder, "completed-phases")
mkdirSync(previewFolder, { recursive: true })
writeFileSync(join(previewFolder, "circuit.json"), JSON.stringify(json))
const options = { width: 1600, height: 1100, backgroundColor: "#10141c", shouldDrawErrors: false, showPcbGroups: false,
  viewport: { minX: -source.width/2-2, maxX: source.width/2+2, minY: -source.height/2-2, maxY: source.height/2+2 } }
writeFileSync(join(previewFolder, "pcb.svg"), convertCircuitJsonToPcbSvg(json, { ...options, shouldDrawRatsNest: false }))
writeFileSync(join(previewFolder, "provenance.json"), JSON.stringify({ description: "Native full-board geometry plus actual copper from completed solver phases. These traces may be withheld from the final Circuit JSON when a later phase fails. No unresolved or in-progress solver routes are invented.", acceptedPhaseTraces: accepted.size, finalPublishedTraces: published.size }, null, 2))
console.log(JSON.stringify({ id, acceptedPhaseTraces: accepted.size, finalPublishedTraces: published.size }))

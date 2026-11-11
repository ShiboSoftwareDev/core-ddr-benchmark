import { areTracePortsConnected } from "./connectivity"
import { getBusLayerErrors } from "./getBusLayerErrors"
import type { PCBPort } from "circuit-json"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { gunzipSync } from "node:zlib"
import type { Assessment } from "./types"

const [corePath, circuitId, output] = process.argv.slice(2)
const checks = await import(join(corePath, "node_modules/@tscircuit/checks/dist/index.js"))
const json = JSON.parse(readFileSync(join(output, "circuit.json"), "utf8"))
const source = JSON.parse(gunzipSync(readFileSync(join(import.meta.dir, "../circuits", `${circuitId}.json.gz`))).toString())
const started = performance.now()
const sources = json.filter((e: any) => e.type === "source_trace")
const routes = json.filter((e: any) => e.type === "pcb_trace")
const ports = new Map<PCBPort["source_port_id"],PCBPort>(json.filter((e: any) => e.type === "pcb_port").map((p: any) => [p.source_port_id, p]))
const unconnected: string[] = []
const geometryErrors: string[] = []

// Audit fixture bus restrictions independently of the router's emitted metadata.
geometryErrors.push(...getBusLayerErrors({ sources, routes, source }))

// Audit emitted pad positions against independently computed native world points.
// Both frames are mm, +X right, +Y up, +Z above, right-handed points.
for (const part of source.parts) {
  const component = json.find((e: any) => e.type === "source_component" && e.name === part.name)
  const pcbComponent = json.find((e: any) => e.type === "pcb_component" && e.source_component_id === component?.source_component_id)
  for (const pad of part.pads) {
    const angle = part.rotation * Math.PI / 180
    const x = part.x + pad.x * Math.cos(angle) + pad.y * Math.sin(angle)
    const y = part.y + pad.x * Math.sin(angle) - pad.y * Math.cos(angle)
    const emitted = json.find((e: any) => (e.type === "pcb_smtpad" || e.type === "pcb_plated_hole") && e.pcb_component_id === pcbComponent?.pcb_component_id && Math.hypot(e.x - x, e.y - y) < 1e-5)
    if (!emitted) geometryErrors.push(`${part.name}.${pad.nativePin ?? pad.pin}: missing native pad center`)
  }
}

// Connectivity uses actual wire segments and via layer transitions. A trace row
// or a generated fanout stub alone cannot count as a connected requested net.
for (const trace of sources) {
  if (!areTracePortsConnected(trace, routes, ports, json.filter((e: any) => e.type === "pcb_via"))) unconnected.push(trace.name)
}
const options = { minClearance: source.rules.appliedGlobalClearance }
const findings = {
  missing_traces: checks.checkSourceTracesHavePcbTraces(json),
  disconnected_ports: checks.checkEachPcbPortConnectedToPcbTraces(json),
  trace_overlap: checks.checkEachPcbTraceNonOverlapping(json,options),
  pad_trace: checks.checkPadTraceClearance(json,options),
  via_trace: checks.checkViaTraceClearance(json,options),
  via_pad: checks.checkViaPadClearance(json,options),
  via_spacing: checks.checkDifferentNetViaSpacing(json),
  contiguous: checks.checkTracesAreContiguous(json),
  via_in_pad: checks.checkViasInPads(json),
  hole_trace: checks.checkHoleTraceClearance(json,options),
  width: checks.checkSourceTracesMatchPcbTraceThickness(json),
}
let wireLengthMm = 0
for (const trace of routes) for (let i=1;i<trace.route.length;i++) {
  const a=trace.route[i-1], b=trace.route[i]
  if (a.route_type === "wire" && b.route_type === "wire" && a.layer === b.layer) wireLengthMm += Math.hypot(a.x-b.x,a.y-b.y)
}
const result: Assessment = {
  requestedNets: source.traces.length,
  connectedNets: source.traces.filter((t: any) => !unconnected.includes(t.name) && sources.some((s: any) => s.name === t.name)).length,
  unconnectedNets: source.traces.filter((t: any) => unconnected.includes(t.name) || !sources.some((s: any) => s.name === t.name)).map((t: any) => t.nativeNet),
  pcbTraces: routes.length, vias: json.filter((e: any) => e.type === "pcb_via").length,
  wireLengthMm, findings: Object.fromEntries(Object.entries(findings).map(([name,values]) => [name,values.filter((v: any) => v.type.endsWith("_error")).length])),
  geometryErrors, validationMs: performance.now()-started,
}
writeFileSync(join(output,"findings.json"),JSON.stringify(findings,null,2))
writeFileSync(join(output,"assessment.json"),JSON.stringify(result,null,2))

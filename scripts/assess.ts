import { arePortsConnected } from "./connectivity"
import { createCopperPathMeasurer } from "./path-length"
import { measureDdrSkew } from "./ddr-skew"
import { getDdrReference, getDdrRoutingBuses, measureDdrConstraints } from "../circuits/ddr-constraints"
import { getDdrNetEndpoints } from "../circuits/ddr-signals"
import { measureStm32Matching, stm32ViaDepthBounds, type LengthBounds } from "./stm32-matching"
import { measureGliderDelay, gliderViaDelayPs, gliderWireDelayPsPerMm } from "./glider-delay"
import { auditDdrLanes } from "./lane-audit"
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
const netWidthTraces: any[] = []
const netWidthRoutes: any[] = []
const vias = json.filter((e: any) => e.type === "pcb_via")
const pathLengths = new Map<string, (from: string, to: string) => number | null>()
const packagePathLengths = new Map<string, (from: string, to: string) => LengthBounds | null>()
const delayPaths = new Map<string, (from: string, to: string) => number | null>()

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
for (const requested of source.traces) {
  const net = json.find((e: any) => e.type === "source_net" && e.name === requested.name)
  const members = sources.filter((trace: any) => net
    ? trace.connected_source_net_ids?.includes(net.source_net_id)
    : trace.name === requested.name)
  const traceIds = new Set(members.map((trace: any) => trace.source_trace_id))
  if (net) traceIds.add(net.source_net_id)
  const memberPortIds = new Set<string>(members.flatMap((trace: any) => trace.connected_source_port_ids))
  const expectedPortIds = requested.path.map((selector: string) => {
    const match = /^\.(\S+) > \.(\S+)$/.exec(selector)
    if (!match) throw new Error(`Unsupported native port selector: ${selector}`)
    const component = json.find((e: any) => e.type === "source_component" && e.name === match[1])
    return json.find((e: any) => e.type === "source_port" && e.source_component_id === component?.source_component_id
      && (e.name === match[2] || e.port_hints?.includes(match[2])))?.source_port_id
  })
  const netRoutes = routes.filter((route: any) => traceIds.has(route.source_trace_id))
  // Give the existing width checker a multi-terminal view of shared net copper,
  // retaining its pad-neckdown policy without modifying the saved Circuit JSON.
  if (net) {
    netWidthTraces.push({ type: "source_trace", source_trace_id: net.source_net_id, name: requested.name,
      connected_source_port_ids: expectedPortIds, connected_source_net_ids: [net.source_net_id], min_trace_thickness: requested.width })
    netWidthRoutes.push(...netRoutes.map((route: any) => ({ ...route, source_trace_id: net.source_net_id })))
  }
  if (requested.group !== "remaining" && requested.group !== "preflight" && netRoutes.some((route: any) =>
    route.route.some((point: any, index: number) => {
      const next = route.route[index + 1]
      return point.route_type === "wire" && next?.route_type === "wire" && point.layer === next.layer
        && Math.hypot(point.x - next.x, point.y - next.y) > 1e-6 && !source.signalLayers.includes(point.layer)
    }))) geometryErrors.push(`${requested.nativeNet}: routed outside native signal layers`)
  if (expectedPortIds.some((id: string | undefined) => !id || !memberPortIds.has(id))
    || memberPortIds.size !== expectedPortIds.length
    || !arePortsConnected(expectedPortIds, netRoutes, ports, vias)) {
    unconnected.push(requested.name)
  } else {
    const measure = createCopperPathMeasurer(netRoutes, new Map([...ports].filter(([id]) => memberPortIds.has(id))), vias)
    const ids = new Map<string, string>(requested.path.map((selector: string, index: number) => [selector, expectedPortIds[index]]))
    pathLengths.set(requested.name, (from, to) => measure(ids.get(from)!, ids.get(to)!))
    if (source.id === "glider") {
      const delay = createCopperPathMeasurer(netRoutes, new Map([...ports].filter(([id]) => memberPortIds.has(id))), vias, gliderViaDelayPs, gliderWireDelayPsPerMm)
      delayPaths.set(requested.name, (from, to) => delay(ids.get(from)!, ids.get(to)!))
    }
    if (source.id === "stmp157") {
      const connectedPorts = new Map([...ports].filter(([id]) => memberPortIds.has(id)))
      const lower = createCopperPathMeasurer(netRoutes, connectedPorts, vias, (from, to) => stm32ViaDepthBounds(from, to)[0])
      const upper = createCopperPathMeasurer(netRoutes, connectedPorts, vias, (from, to) => stm32ViaDepthBounds(from, to)[1])
      packagePathLengths.set(requested.name, (from, to) => {
        const min = lower(ids.get(from)!, ids.get(to)!), max = upper(ids.get(from)!, ids.get(to)!)
        return min === null || max === null ? null : [min, max]
      })
    }
  }
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
  width: [
    ...checks.checkSourceTracesMatchPcbTraceThickness(json),
    ...checks.checkSourceTracesMatchPcbTraceThickness([
      ...json.filter((e: any) => e.type !== "source_trace" && e.type !== "pcb_trace"),
      ...netWidthTraces, ...netWidthRoutes,
    ]),
  ],
}
let wireLengthMm = 0
for (const trace of routes) for (let i=1;i<trace.route.length;i++) {
  const a=trace.route[i-1], b=trace.route[i]
  if (a.route_type === "wire" && b.route_type === "wire" && a.layer === b.layer) wireLengthMm += Math.hypot(a.x-b.x,a.y-b.y)
}
const ddrSkew = measureDdrSkew(source, ([net, from, to]) => pathLengths.get(net)?.(from, to) ?? null)
const ddrConstraints = measureDdrConstraints(source, (trace, memoryRef) => {
  const [from, to] = getDdrNetEndpoints(source, trace, memoryRef)
  return pathLengths.get(trace.name)?.(from, to) ?? null
}, ([net, from, to]) => pathLengths.get(net)?.(from, to) ?? null)
const constraintErrors = ddrConstraints.filter((constraint) => constraint.status === "exceeded" && (constraint.severity ?? "error") === "error")
  .map((constraint) => ({ type: "ddr_constraint_error", message: `${constraint.name}: ${constraint.basis === "original_matching" ? "original matching" : constraint.basis === "engineering_target" ? "engineering" : "reference"} target exceeded by ${(-constraint.marginMm!).toFixed(6)} mm` }))
const matchingErrors = Object.entries(ddrSkew).filter(([, group]) => group.matchingStatus === "regressed" && !group.preservationComparisonOnly)
  .map(([name, group]) => ({ type: "ddr_matching_error", message: `${name}: skew increased by ${group.referenceDeltaMm!.toFixed(6)} mm from the original routed board` }))
const ddrPackageMatching = measureStm32Matching(source, ([net, from, to]) => packagePathLengths.get(net)?.(from, to) ?? null)
const packageErrors = (ddrPackageMatching?.constraints ?? []).filter((constraint) => constraint.status === "exceeded")
  .map((constraint) => ({ type: "ddr_package_matching_error", message: `${constraint.name}: reference window exceeded even with the source's via-depth uncertainty` }))
const ddrDelayMatching = measureGliderDelay(source, ([net, from, to]) => delayPaths.get(net)?.(from, to) ?? null)
const delayErrors = (ddrDelayMatching?.constraints ?? []).filter((constraint) => constraint.status === "exceeded")
  .map((constraint) => ({ type: "ddr_delay_matching_error", message: `${constraint.name}: delay target exceeded across the modelled package interval` }))
const allFindings = { ...findings, ddr_constraints: constraintErrors, ddr_matching: matchingErrors, ddr_package_matching: packageErrors, ddr_delay_matching: delayErrors }
const result: Assessment = {
  requestedNets: source.traces.length,
  connectedNets: source.traces.length - unconnected.length,
  unconnectedNets: source.traces.filter((t: any) => unconnected.includes(t.name)).map((t: any) => t.nativeNet),
  pcbTraces: routes.length, vias: json.filter((e: any) => e.type === "pcb_via").length,
  wireLengthMm, findings: Object.fromEntries(Object.entries(allFindings).map(([name,values]) => [name,values.filter((v: any) => v.type.endsWith("_error")).length])),
  geometryErrors, validationMs: performance.now()-started,
  ddrSkew, ddrConstraints, ddrConstraintNotes: getDdrReference(source.id).notes, ddrPackageMatching, ddrDelayMatching, ddrRoutingTargets: getDdrRoutingBuses(source), ddrLaneAudit: auditDdrLanes(source),
}
writeFileSync(join(output,"findings.json"),JSON.stringify(allFindings,null,2))
writeFileSync(join(output,"assessment.json"),JSON.stringify(result,null,2))

import { getDdrReference, getDdrRoutingBuses } from "./ddr-constraints"
import { getDdrNetEndpoints, getDdrSkewGroups } from "./ddr-signals"
import type { DdrSource } from "./native-ddr-board"

type NativeTrace = DdrSource["traces"][number]
type NativeTraceName = NativeTrace["name"]
type NativeNetName = NativeTrace["nativeNet"]
type RoutingGroup = NativeTrace["group"]
type RoutingBus = ReturnType<typeof getDdrRoutingBuses>[number] & {
  lengthMatchTo?: string[]
}

export interface NativeDdrRoutingPlan {
  phases: {
    name: RoutingGroup
    autorouter: "bus_lanes" | "auto_local"
    connections: string[]
  }[]
  buses: (RoutingBus & { routingPhaseIndex: number })[]
  tracePhaseIndices: Map<NativeTraceName, number>
  netConnections: Map<NativeTraceName, string[]>
  timingPaths: { name: string; path: string[]; routingPhaseIndex: number }[]
}

function timingTraceName(trace: NativeTrace): string {
  return `DDR_TIMING_${trace.name}`
}

function routingSelector(source: DdrSource, trace: NativeTrace): string {
  if (trace.path.length > 2) return timingTraceName(trace)
  return getDdrNetEndpoints(source, trace)[0]
}

function resolveTrace(source: DdrSource, selector: string): NativeTrace {
  const trace = source.traces.find(
    (trace) =>
      trace.path.includes(selector) || timingTraceName(trace) === selector,
  )
  if (!trace) throw new Error(`Unknown native DDR timing selector ${selector}`)
  return trace
}

/** Keep every supported declared comparison, including overlapping groups.
 * Named paths select CPU-to-RAM copper without timing termination branches. */
function getNativeTimingBuses(source: DdrSource): RoutingBus[] {
  const buses: RoutingBus[] = getDdrRoutingBuses(source)
  const tracesByNet = new Map<NativeNetName, NativeTrace>(
    source.traces.map((trace) => [trace.nativeNet, trace]),
  )
  const singleSectionNets = new Set(
    getDdrSkewGroups(source).flatMap((group) =>
      group.signals
        .filter((signal) => signal.sections.length === 1)
        .map((signal) => signal.name),
    ),
  )
  for (const target of getDdrReference(source.id).constraints ?? []) {
    if (
      (target.severity ?? "error") !== "error" ||
      target.maxLengthSkew === undefined
    )
      continue
    if (target.skewReference && target.skewReference !== "references") continue
    if (
      target.nets.some(
        (net) => !tracesByNet.has(net) || !singleSectionNets.has(net),
      )
    )
      continue
    const references = target.referenceNets ?? []
    const members = target.nets
      .filter((net) => !references.includes(net))
      .map((net) => tracesByNet.get(net)!)
    const connections = members.map((trace) => routingSelector(source, trace))
    const lengthMatchTo = references.map((net) =>
      routingSelector(source, tracesByNet.get(net)!),
    )
    if (
      !lengthMatchTo.length &&
      buses.some(
        (bus) =>
          bus.maxLengthSkew !== undefined &&
          bus.maxLengthSkew <= target.maxLengthSkew! &&
          connections.every((connection) =>
            bus.connections.includes(connection),
          ),
      )
    )
      continue
    const owner = buses.find((bus) => bus.connections.includes(connections[0]))
    let name = target.name
    if (buses.some((bus) => bus.name === name)) name = `${name}_all_signals`
    const bus: RoutingBus = {
      name,
      group: owner?.group ?? members[0].group,
      connections,
      maxLengthSkew: target.maxLengthSkew,
    }
    if (lengthMatchTo.length) bus.lengthMatchTo = lengthMatchTo
    buses.push(bus)
  }
  return buses
}

function mergePhaseGroups({
  groups,
  traceGroups,
}: {
  groups: Set<RoutingGroup>
  traceGroups: Map<NativeTraceName, RoutingGroup>
}): void {
  const first = groups.values().next().value
  if (first === undefined) return
  for (const [traceName, group] of traceGroups) {
    if (groups.has(group)) traceGroups.set(traceName, first)
  }
}

/** A timing dependency must be solved before any participating phase is fixed.
 * Untimed renders retain their original byte/remaining routing requests. */
export function getNativeDdrRoutingPlan({
  source,
  matchLengths,
  dataOnly,
}: {
  source: DdrSource
  matchLengths: boolean
  dataOnly: boolean
}): NativeDdrRoutingPlan {
  const bytes = [...new Set(source.traces.map((trace) => trace.group))]
    .filter((group) => group !== "remaining" && group !== "preflight")
    .sort()
  let buses: RoutingBus[]
  if (matchLengths) buses = getNativeTimingBuses(source)
  else
    buses = bytes.map((group) => ({
      name: `DDR_BUS_${group}`,
      group,
      connections: source.traces
        .filter((trace) => trace.group === group)
        .map((trace) => trace.path[0]),
    }))
  if (dataOnly) buses = buses.filter((bus) => bytes.includes(bus.group))
  const traceGroups = new Map<NativeTraceName, RoutingGroup>(
    source.traces.map((trace) => [trace.name, trace.group]),
  )
  // A byte's declared class may also own its mask and strobe nets.
  for (const bus of buses) {
    if (!bytes.includes(bus.group)) continue
    for (const selector of bus.connections) {
      const trace = resolveTrace(source, selector)
      if (traceGroups.get(trace.name) === "remaining")
        traceGroups.set(trace.name, bus.group)
    }
  }
  if (source.routeByteGroupsTogether)
    mergePhaseGroups({ groups: new Set(bytes), traceGroups })
  for (const bus of buses) {
    const members = [...bus.connections, ...(bus.lengthMatchTo ?? [])].map(
      (selector) => resolveTrace(source, selector),
    )
    mergePhaseGroups({
      groups: new Set(members.map((trace) => traceGroups.get(trace.name)!)),
      traceGroups,
    })
  }
  const order = ["preflight", ...bytes, "remaining"]
  const phaseNames = [...new Set(traceGroups.values())]
    .filter((group) => !dataOnly || bytes.includes(group))
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
  const phaseIndices = new Map<RoutingGroup, number>(
    phaseNames.map((name, index) => [name, index]),
  )
  const tracePhaseIndices = new Map<NativeTraceName, number>()
  for (const trace of source.traces) {
    const index = phaseIndices.get(traceGroups.get(trace.name)!)
    if (index !== undefined) tracePhaseIndices.set(trace.name, index)
  }
  const stagedBuses = buses.map((bus) => ({
    ...bus,
    routingPhaseIndex: tracePhaseIndices.get(
      resolveTrace(source, bus.connections[0]).name,
    )!,
  }))
  const phases = phaseNames.map((name, index) => {
    let autorouter: "bus_lanes" | "auto_local" = "auto_local"
    if (stagedBuses.some((bus) => bus.routingPhaseIndex === index))
      autorouter = "bus_lanes"
    return {
      name,
      autorouter,
      connections: source.traces
        .filter((trace) => tracePhaseIndices.get(trace.name) === index)
        .flatMap((trace) => trace.path),
    }
  })
  const selectors = new Set(
    buses.flatMap((bus) => [...bus.connections, ...(bus.lengthMatchTo ?? [])]),
  )
  const netConnections = new Map<NativeTraceName, string[]>()
  const timingPaths: NativeDdrRoutingPlan["timingPaths"] = []
  for (const trace of source.traces) {
    if (!selectors.has(timingTraceName(trace))) continue
    const endpoints = getDdrNetEndpoints(source, trace)
    netConnections.set(
      trace.name,
      trace.path.filter((port) => !endpoints.includes(port)),
    )
    timingPaths.push({
      name: timingTraceName(trace),
      path: [...endpoints, `net.${trace.name}`],
      routingPhaseIndex: tracePhaseIndices.get(trace.name)!,
    })
  }
  return {
    phases,
    buses: stagedBuses,
    tracePhaseIndices,
    netConnections,
    timingPaths,
  }
}

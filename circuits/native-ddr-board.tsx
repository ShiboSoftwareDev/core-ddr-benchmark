import type { BusLanesPipelineSolver } from "@tscircuit/bus-lanes-solver"
import { createNativeDdrAutorouter } from "./native-ddr-autorouter"
import type { ReactElement } from "react"
import type { BoardProps, BusProps } from "@tscircuit/props"
import { NativePart } from "./native-part"
import { getDirectDdrTimingBuses, type DirectDdrBus } from "./direct-ddr-timing"
import { planDirectDdrPhases } from "./direct-ddr-phases"
import { getDdrRoutingBuses, getDdrReference } from "./ddr-constraints"

type DdrSource = {
  id: string
  title: string
  width: number
  height: number
  layers: BoardProps["layers"]
  rules: {
    widths: number[]
    appliedGlobalClearance: number
    viaPad: number
    viaDrill: number
  }
  signalLayers: BusProps["pcbAllowedLayers"]
  parts: Parameters<typeof NativePart>[0]["part"][]
  traces: {
    name: string
    nativeNet: string
    /** Unordered native net members; the fixture retains its legacy field name. */
    path: string[]
    width: number
    group: string
  }[]
  requestedNames?: string[]
  routeByteGroupsTogether?: boolean
}

type RoutingGroup = string

/** Native placements in board-world mm, +X right, +Y up, +Z above.
 * Preserve all pads on the DDR components; route byte groups before remaining nets.
 */
export function NativeDdrBoard({
  source,
  dataOnly = false,
  geometryOnly = false,
  matchLengths = true,
  busLanesSolver,
}: {
  source: DdrSource
  dataOnly?: boolean
  geometryOnly?: boolean
  matchLengths?: boolean
  busLanesSolver?: typeof BusLanesPipelineSolver
}): ReactElement {
  const activeTraces = source.requestedNames
    ? source.traces.filter((trace) =>
        source.requestedNames!.includes(trace.name),
      )
    : source.traces
  const activeNames = new Set(activeTraces.map((trace) => trace.name))
  const bytes = [...new Set(activeTraces.map((trace) => trace.group))]
    .filter((group) => group !== "remaining" && group !== "preflight")
    .sort()
  const preflight = activeTraces.some((trace) => trace.group === "preflight")
    ? ["preflight"]
    : []
  const phaseNameByGroup = new Map<RoutingGroup, string>(
    ["preflight", ...bytes, "remaining"].map((group) => [group, group]),
  )
  const matchesAcrossBytes = matchLengths && (getDdrReference(source.id).constraints ?? []).some((constraint) =>
    !constraint.assessmentOnly && (constraint.severity ?? "error") === "error" && constraint.maxLengthSkew !== undefined && new Set(source.traces.filter((trace) => constraint.nets.includes(trace.nativeNet) && bytes.includes(trace.group)).map((trace) => trace.group)).size > 1)
  if (source.routeByteGroupsTogether || matchesAcrossBytes) {
    for (const group of bytes) phaseNameByGroup.set(group, "bytes")
  }
  const groups = dataOnly ? bytes : [...preflight, ...bytes, "remaining"]
  const bytePhases = new Set(bytes.map((group) => phaseNameByGroup.get(group)!))
  const tracePhases = new Map(activeTraces.map((trace) => [trace.name, phaseNameByGroup.get(trace.group)!]))
  let directBuses: DirectDdrBus[] | null = null
  if (matchLengths && !dataOnly) directBuses = getDirectDdrTimingBuses({ ...source, traces: activeTraces })
  const buses: DirectDdrBus[] = matchLengths
    ? (directBuses ?? getDdrRoutingBuses({ ...source, traces: activeTraces })).filter((bus) => groups.includes(bus.group))
    : bytes.map((group) => ({
        name: `DDR_BUS_${group}`, group,
        connections: activeTraces.filter((trace) => trace.group === group).map((trace) => trace.path[0]),
      }))
  const busPhases = new Map(buses.map((bus) => [bus.name, phaseNameByGroup.get(bus.group)!]))
  const matchingPhases: string[] = []
  if (!dataOnly) for (const bus of buses) {
    if (bus.maxLengthSkew === undefined && bus.minLength === undefined && bus.maxLength === undefined) continue
    const members = activeTraces.filter((trace) => trace.path.some((selector) => bus.connections.includes(selector)))
    const byte = members.find((trace) => bytes.includes(trace.group))
    const physicalByte = bytes.includes(bus.group) ? bus.group : byte?.group
    const phase = physicalByte ? phaseNameByGroup.get(physicalByte)! : `match_${bus.name}`
    for (const trace of members) tracePhases.set(trace.name, phase)
    busPhases.set(bus.name, phase)
    bytePhases.add(phase)
    if (!physicalByte) matchingPhases.push(phase)
  }
  let phases = [...new Set([
    ...groups.filter((group) => group !== "remaining").map((group) => phaseNameByGroup.get(group)!),
    ...matchingPhases,
    ...(dataOnly ? [] : ["remaining"]),
  ])].filter((phase) => activeTraces.some((trace) => tracePhases.get(trace.name) === phase))
  if (directBuses) {
    const plan = planDirectDdrPhases(activeTraces, directBuses)
    phases = plan.phases
    tracePhases.clear()
    for (const [trace, phase] of plan.tracePhases) tracePhases.set(trace, phase)
    busPhases.clear()
    for (const [bus, phase] of plan.busPhases) busPhases.set(bus, phase)
    bytePhases.clear()
    for (const phase of plan.busRoutingPhases) bytePhases.add(phase)
  }
  const nativeDdrRouter = directBuses
    ? createNativeDdrAutorouter({ buses: directBuses, parts: source.parts, solverConstructor: busLanesSolver })
    : undefined
  const sourceBuses = buses.map(({ group, skewReference, lengthMatchingPaths, ...bus }) => {
    if (!nativeDdrRouter) return bus
    // The existing Core props describe ranges. Mean/reference comparisons and
    // selected branch paths are passed to the built-in solver through its API.
    if ((skewReference && skewReference !== "range") || lengthMatchingPaths?.length) {
      return { name: bus.name, connections: bus.connections }
    }
    return bus
  })
  return (
    <board
      title={source.title}
      width={source.width}
      height={source.height}
      layers={source.layers}
      schematicDisabled
      routingDisabled={geometryOnly}
      routeRemaining={false}
      isViaInPadAllowed={false}
      minTraceWidth={Math.min(...source.rules.widths)}
      minTraceToPadEdgeClearance={source.rules.appliedGlobalClearance}
      minViaEdgeToPadEdgeClearance={source.rules.appliedGlobalClearance}
      minViaPadDiameter={source.rules.viaPad}
      minViaHoleDiameter={source.rules.viaDrill}
    >
      {source.parts.map((part) => (
        <NativePart key={part.name} part={part} />
      ))}
      {phases.map((group, phaseIndex) => (
        <autoroutingphase
          key={group}
          name={group}
          phaseIndex={phaseIndex}
          autorouter={bytePhases.has(group) ? "bus_lanes" : "auto_local"}
          algorithmFn={bytePhases.has(group) ? nativeDdrRouter : undefined}
          connections={activeTraces
            .filter((trace) => tracePhases.get(trace.name) === group)
            .flatMap((trace) => trace.path)}
        />
      ))}
      {source.traces.map((trace) => (
        <net
          key={trace.name}
          name={trace.name}
          connectsTo={trace.path}
          nominalTraceWidth={trace.width}
          routingPhaseIndex={
            activeNames.has(trace.name) && groups.includes(trace.group)
              ? phases.indexOf(tracePhases.get(trace.name)!)
              : undefined
          }
        />
      ))}
      {sourceBuses.map((bus) => (
        <bus
          key={bus.name}
          {...bus}
          routingPhaseIndex={phases.indexOf(busPhases.get(bus.name)!)}
          pcbAllowedLayers={source.signalLayers}
        />
      ))}
      <pcbnotetext
        pcbY={source.height / 2 - 0.8}
        fontSize={0.5}
        text={`${source.title}: ${dataOnly ? activeTraces.filter((trace) => trace.group !== "remaining").length : activeTraces.length} DDR nets requested`}
      />
      <pcbnotetext
        pcbY={-source.height / 2 + 0.8}
        fontSize={0.45}
        text="Native geometry; no via-in-pad. Bus bytes, then remaining signals. Timing unqualified."
      />
    </board>
  )
}

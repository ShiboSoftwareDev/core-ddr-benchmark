import type { ReactElement } from "react"
import type { BoardProps, BusProps } from "@tscircuit/props"
import { NativePart } from "./native-part"
import { getReferenceBusGroups, getReferenceRoutingOptions, getSharedReferenceLengthOptions } from "./reference-routing-options"

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
}: {
  source: DdrSource
  dataOnly?: boolean
  geometryOnly?: boolean
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
  if (source.routeByteGroupsTogether) {
    for (const group of bytes) phaseNameByGroup.set(group, "bytes")
  }
  const groups = dataOnly ? bytes : [...preflight, ...bytes, "remaining"]
  const phases = [...new Set(groups.map((group) => phaseNameByGroup.get(group)!))]
  const bytePhases = new Set(bytes.map((group) => phaseNameByGroup.get(group)!))
  const reference = getReferenceRoutingOptions(source.id)
  const byteGroups = bytes.flatMap((group) => {
    const partitions = getReferenceBusGroups(activeTraces.filter((trace) => trace.group === group).map((trace) => trace.name), reference)
    return partitions.map((partition, index) => ({ ...partition, group,
      name: partitions.length === 1 ? `DDR_BUS_${group}` : `DDR_BUS_${group}_${index}`,
    }))
  })
  const referencedPairs = (reference.pairOptions ?? []).flatMap((pair) => {
    const traces = pair.nets.map((name) => activeTraces.find((trace) => trace.name === name))
    if (traces.some((trace) => !trace || !groups.includes(trace.group))) return []
    const phase = phaseNameByGroup.get(traces[0]!.group)
    if (traces.some((trace) => phaseNameByGroup.get(trace!.group) !== phase)) return []
    return [{ ...pair, traces: traces.map((trace) => trace!), phase: phases.indexOf(phase!),
      options: getSharedReferenceLengthOptions(pair.nets, reference),
    }]
  })
  const pairNets = new Set(referencedPairs.flatMap((pair) => pair.nets))
  const referencedTraces = activeTraces.filter((trace) => groups.includes(trace.group) &&
    !bytes.includes(trace.group) && !pairNets.has(trace.name) && reference.netOptions?.[trace.name])
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
          connections={activeTraces
            .filter((trace) => phaseNameByGroup.get(trace.group) === group)
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
              ? phases.indexOf(phaseNameByGroup.get(trace.group)!)
              : undefined
          }
        />
      ))}
      {byteGroups.map((partition) => (
        <bus
          key={partition.name}
          name={partition.name}
          routingPhaseIndex={phases.indexOf(phaseNameByGroup.get(partition.group)!)}
          connections={activeTraces
            .filter((trace) => partition.nets.includes(trace.name))
            .map((trace) => trace.path[0])}
          pcbAllowedLayers={source.signalLayers}
          {...partition.options}
        />
      ))}
      {referencedTraces.map((trace) => (
        <bus
          key={`reference_${trace.name}`}
          name={`DDR_REFERENCE_${trace.name}`}
          connections={[trace.path[0]]}
          routingPhaseIndex={phases.indexOf(phaseNameByGroup.get(trace.group)!)}
          {...reference.netOptions?.[trace.name]}
        />
      ))}
      {referencedPairs.map((pair) => (
        <bus
          key={`reference_${pair.name}`}
          name={`DDR_REFERENCE_${pair.name}`}
          connections={pair.traces.map((trace) => trace.path[0])}
          routingPhaseIndex={pair.phase}
          maxLengthSkew={pair.maxLengthSkew}
          {...pair.options}
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

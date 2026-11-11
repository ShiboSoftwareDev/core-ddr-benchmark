import type { PCBTrace, SourceTrace } from "circuit-json"

type BusLayerSource = {
  signalLayers: readonly string[]
  traces: readonly {
    name: SourceTrace["name"]
    nativeNet: string
    group: string
  }[]
}

/** Audit the same byte-bus layer policy declared by NativeDdrBoard.
 * Remaining and preflight traces have no bus layer restriction.
 * Through vias may cross excluded wire layers; zero-length vertices add no wire.
 */
export function getBusLayerErrors({
  sources,
  routes,
  source,
}: {
  sources: readonly Pick<SourceTrace, "source_trace_id" | "name">[]
  routes: readonly Pick<PCBTrace, "source_trace_id" | "route">[]
  source: BusLayerSource
}): string[] {
  const constraintsByName = new Map(
    source.traces
      .filter((trace) => trace.group !== "remaining" && trace.group !== "preflight")
      .map((trace) => [trace.name, trace] as const),
  )
  const constraintsBySourceTraceId = new Map(
    sources.flatMap((trace) => {
      const constraint = constraintsByName.get(trace.name)
      return constraint ? [[trace.source_trace_id, constraint] as const] : []
    }),
  )
  const forbiddenLayersByNet = new Map<string, Set<string>>()
  for (const trace of routes) {
    if (trace.source_trace_id === undefined) continue
    const constraint = constraintsBySourceTraceId.get(trace.source_trace_id)
    if (!constraint) continue
    for (let index = 1; index < trace.route.length; index++) {
      const a = trace.route[index - 1]!
      const b = trace.route[index]!
      if (
        a.route_type !== "wire" ||
        b.route_type !== "wire" ||
        a.layer !== b.layer ||
        (a.x === b.x && a.y === b.y) ||
        source.signalLayers.includes(a.layer)
      )
        continue
      let forbiddenLayers = forbiddenLayersByNet.get(constraint.nativeNet)
      if (!forbiddenLayers)
        forbiddenLayersByNet.set(
          constraint.nativeNet,
          (forbiddenLayers = new Set()),
        )
      forbiddenLayers.add(a.layer)
    }
  }
  return [...forbiddenLayersByNet].map(
    ([nativeNet, layers]) =>
      `${nativeNet}: bus wires use disallowed layers ${[...layers].sort().join(", ")}`,
  )
}

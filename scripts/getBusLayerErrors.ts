import type { PCBTrace, SourceTrace } from "circuit-json"

type BusLayerConstraint = {
  name: SourceTrace["name"]
  nativeNet: string
  allowedLayers: readonly string[]
}

/** Check wire segments in board-world mm (+X right, +Y up, +Z above).
 * Through vias may cross excluded wire layers; zero-length vertices add no wire.
 */
export function getBusLayerErrors({
  sources,
  routes,
  constraints,
}: {
  sources: readonly Pick<SourceTrace, "source_trace_id" | "name">[]
  routes: readonly Pick<PCBTrace, "source_trace_id" | "route">[]
  constraints: readonly BusLayerConstraint[]
}): string[] {
  const constraintsByName = new Map(
    constraints.map((constraint) => [constraint.name, constraint]),
  )
  const constraintsBySourceTraceId = new Map(
    sources.flatMap((trace) => {
      const constraint = constraintsByName.get(trace.name)
      return constraint ? [[trace.source_trace_id, constraint] as const] : []
    }),
  )
  const forbiddenLayersByNet = new Map<
    BusLayerConstraint["nativeNet"],
    Set<string>
  >()
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
        constraint.allowedLayers.includes(a.layer)
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

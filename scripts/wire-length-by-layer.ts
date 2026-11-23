import type { PcbTrace } from "circuit-json"

/** Measure planar copper in mm. Vias span the stack and plated pads already supply their own copper. */
export function getWireLengthByLayer(traces: readonly PcbTrace[]): Map<string, number> {
  const lengths = new Map<string, number>()
  for (const trace of traces) {
    for (let i = 1; i < trace.route.length; i++) {
      const previous = trace.route[i - 1]!
      const next = trace.route[i]!
      const start = previous.route_type === "through_pad" ? previous.end : previous
      const end = next.route_type === "through_pad" ? next.start : next
      const length = Math.hypot(end.x - start.x, end.y - start.y)
      if (!length) continue
      const layer = previous.route_type === "through_pad"
        ? previous.end_layer
        : previous.route_type === "via" ? previous.to_layer : previous.layer
      lengths.set(layer, (lengths.get(layer) ?? 0) + length)
    }
  }
  return lengths
}

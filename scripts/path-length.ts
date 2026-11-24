import type { PCBPort, PCBTrace, PCBVia } from "circuit-json"

type SourcePortId = PCBPort["source_port_id"]
type CopperPoint = { x: number; y: number; layer: string }
const toleranceMm = 1e-6

/** Measure shortest connected copper centerlines in board-world mm: +X right,
 * +Y up, +Z above (right handed points). Layer changes have zero planar length;
 * an optional layer-distance callback can add explicit via depth. No stackup,
 * package delay, or propagation velocity is inferred. An explicit wire scale
 * can instead measure delay, provided the via callback uses the same units.
 * Routes, ports,
 * and vias must belong to one electrical net. Branch stubs are not path length.
 */
export function createCopperPathMeasurer(
  routes: PCBTrace[],
  ports: Map<SourcePortId, PCBPort>,
  vias: PCBVia[],
  viaDepthMm: (from: string, to: string) => number = () => 0,
  wireScale: (layer: string) => number = () => 1,
): (from: SourcePortId, to: SourcePortId) => number | null {
  const nodes: CopperPoint[] = []
  const links: Map<number, number>[] = []
  const segments: [number, number][] = []
  const terminals = new Map<SourcePortId, number>()
  function node(point: CopperPoint): number {
    const found = nodes.findIndex((n) => n.layer === point.layer && Math.hypot(n.x - point.x, n.y - point.y) < toleranceMm)
    if (found >= 0) return found
    nodes.push(point)
    links.push(new Map())
    return nodes.length - 1
  }
  function link(a: number, b: number, length = 0): void {
    if (a === b) return
    links[a].set(b, Math.min(links[a].get(b) ?? Infinity, length))
    links[b].set(a, Math.min(links[b].get(a) ?? Infinity, length))
  }
  for (const trace of routes) {
    let previous: number | undefined
    for (const point of trace.route) {
      if (point.route_type === "wire") {
        const current = node(point)
        if (previous !== undefined && nodes[previous].layer === point.layer) segments.push([previous, current])
        previous = current
      } else if (point.route_type === "via") {
        const from = node({ ...point, layer: point.from_layer })
        const to = node({ ...point, layer: point.to_layer })
        // A via cannot bridge a missing lateral wire segment.
        if (previous !== undefined && nodes[previous].layer === point.from_layer && Math.hypot(nodes[previous].x - point.x, nodes[previous].y - point.y) < toleranceMm) link(previous, from)
        link(from, to, viaDepthMm(point.from_layer, point.to_layer))
        previous = to
      }
    }
  }
  const routeIds = new Set(routes.map((trace) => trace.pcb_trace_id))
  for (const via of vias) {
    if (!via.pcb_trace_id || !routeIds.has(via.pcb_trace_id)) continue
    const viaNodes = via.layers.map((layer) => node({ x: via.x, y: via.y, layer }))
    for (const current of viaNodes) link(viaNodes[0], current, viaDepthMm(nodes[viaNodes[0]].layer, nodes[current].layer))
  }
  for (const [sourcePortId, port] of ports) {
    const portNodes = port.layers.map((layer) => node({ ...port, layer }))
    if (!portNodes.length) continue
    for (const current of portNodes) link(portNodes[0], current)
    terminals.set(sourcePortId, portNodes[0])
  }
  // Split wires at actual vertices, via locations, and pad centers. Joining a
  // T junction to a segment endpoint with a zero-cost edge would shorten it.
  for (const [a, b] of segments) {
    const start = nodes[a], end = nodes[b]
    const dx = end.x - start.x, dy = end.y - start.y
    const squaredLength = dx * dx + dy * dy
    if (!squaredLength) continue
    const onSegment: { node: number; position: number }[] = []
    for (let i = 0; i < nodes.length; i++) {
      const point = nodes[i]
      if (point.layer !== start.layer) continue
      const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / squaredLength))
      if (Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy) < toleranceMm) onSegment.push({ node: i, position: t })
    }
    onSegment.sort((left, right) => left.position - right.position)
    for (let i = 1; i < onSegment.length; i++) link(onSegment[i - 1].node, onSegment[i].node, (onSegment[i].position - onSegment[i - 1].position) * Math.sqrt(squaredLength) * wireScale(start.layer))
  }
  return (from, to) => {
    const start = terminals.get(from), end = terminals.get(to)
    if (start === undefined || end === undefined || !routes.length) return null
    const distances = nodes.map(() => Infinity)
    const visited = new Set<number>()
    distances[start] = 0
    while (true) {
      let current = -1
      for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && Number.isFinite(distances[i]) && (current < 0 || distances[i] < distances[current])) current = i
      if (current < 0) return null
      if (current === end) return distances[current]
      visited.add(current)
      for (const [next, length] of links[current]) distances[next] = Math.min(distances[next], distances[current] + length)
    }
  }
}

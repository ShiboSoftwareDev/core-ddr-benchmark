import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import type { PCBTrace } from "circuit-json"
import { getBusLayerErrors } from "../scripts/getBusLayerErrors"

test("the native ButterStick bus rejects a real forbidden-layer segment", () => {
  const source = JSON.parse(
    gunzipSync(
      readFileSync(new URL("../circuits/butterstick.json.gz", import.meta.url)),
    ).toString(),
  )
  const nativeTrace = source.traces.find(
    (trace: { name: string }) => trace.name === "DDR_043",
  )
  const sources = [
    { source_trace_id: "source_trace_43", name: nativeTrace.name },
  ]
  // Exact points from the full-board output that previously passed assessment.
  // Board-world mm, +X right, +Y up, +Z above; right-handed points.
  const route: Pick<PCBTrace, "source_trace_id" | "route"> = {
    source_trace_id: "source_trace_43",
    route: [
      {
        route_type: "wire",
        x: -7.571821933874125,
        y: 0.7788736796148741,
        layer: "inner4",
        width: 0.12,
      },
      {
        route_type: "wire",
        x: -8.639821933874124,
        y: 0.24487367961487405,
        layer: "inner4",
        width: 0.12,
      },
    ],
  }
  const check = (routes: (typeof route)[]): string[] =>
    getBusLayerErrors({ sources, routes, source })
  expect(check([route])).toEqual([
    `${nativeTrace.nativeNet}: bus wires use disallowed layers inner4`,
  ])
  expect(
    check([
      {
        ...route,
        route: route.route.map((point) => ({ ...point, layer: "inner2" })),
      },
    ]),
  ).toEqual([])
  expect(
    check([
      {
        ...route,
        route: [
          { route_type: "wire", x: 0, y: 0, layer: "top", width: 0.12 },
          {
            route_type: "via",
            x: 0,
            y: 0,
            from_layer: "top",
            to_layer: "bottom",
          },
          { route_type: "wire", x: 0, y: 0, layer: "bottom", width: 0.12 },
          { route_type: "wire", x: 1, y: 0, layer: "bottom", width: 0.12 },
        ],
      },
    ]),
  ).toEqual([])
  expect(
    check([{ ...route, route: [route.route[0]!, route.route[0]!] }]),
  ).toEqual([])
})

test("Glider checks byte-bus wires without inventing restrictions for remaining signals", () => {
  const source = JSON.parse(
    gunzipSync(
      readFileSync(new URL("../circuits/glider.json.gz", import.meta.url)),
    ).toString(),
  )
  expect(source.signalLayers).toEqual(["top", "inner2", "bottom"])
  const byteTrace = source.traces.find(
    (trace: { name: string }) => trace.name === "DDR_023",
  )
  const remainingTrace = source.traces.find(
    (trace: { name: string }) => trace.name === "DDR_000",
  )
  expect(byteTrace.group).toBe("byte0")
  expect(remainingTrace.group).toBe("remaining")
  const sources = [
    { source_trace_id: "byte", name: byteTrace.name },
    { source_trace_id: "remaining", name: remainingTrace.name },
  ]
  // Synthetic copper tests policy against the actual frozen fixture. These
  // segments are not evidence about the user's generated Glider output.
  // Coordinates: board-world mm, +X right, +Y up, +Z above.
  const segment = (
    source_trace_id: string,
    layer: "top" | "inner1" | "inner2" | "bottom",
  ): Pick<PCBTrace, "source_trace_id" | "route"> => ({
    source_trace_id,
    route: [
      { route_type: "wire", x: 0, y: 0, layer, width: 0.15 },
      { route_type: "wire", x: 1, y: 0, layer, width: 0.15 },
    ],
  })
  const check = (routes: ReturnType<typeof segment>[]) =>
    getBusLayerErrors({ source, sources, routes })
  expect(check([segment("byte", "inner1")])).toEqual([
    `${byteTrace.nativeNet}: bus wires use disallowed layers inner1`,
  ])
  for (const layer of ["top", "inner2", "bottom"] as const)
    expect(check([segment("byte", layer)])).toEqual([])
  expect(check([segment("remaining", "inner1")])).toEqual([])
  expect(
    getBusLayerErrors({
      source: {
        ...source,
        traces: [{ ...remainingTrace, group: "preflight" }],
      },
      sources,
      routes: [segment("remaining", "inner1")],
    }),
  ).toEqual([])
  // Multiple route fragments produce one finding for this native net.
  expect(
    check([segment("byte", "inner1"), segment("byte", "inner1")]),
  ).toEqual([
    `${byteTrace.nativeNet}: bus wires use disallowed layers inner1`,
  ])
})

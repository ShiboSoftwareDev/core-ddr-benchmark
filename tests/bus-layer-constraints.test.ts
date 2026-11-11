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
  const constraint = {
    name: nativeTrace.name,
    nativeNet: nativeTrace.nativeNet,
    allowedLayers: source.signalLayers,
  }
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
    getBusLayerErrors({ sources, routes, constraints: [constraint] })
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

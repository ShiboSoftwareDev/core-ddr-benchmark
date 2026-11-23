import { expect, test } from "bun:test"
import { getWireLengthByLayer } from "../scripts/wire-length-by-layer"

test("counts a track that leaves a via on an inner plane and excludes the vertical barrel", () => {
  const lengths = getWireLengthByLayer([{
    type: "pcb_trace",
    pcb_trace_id: "clock",
    route: [
      {route_type: "wire", x: 0, y: 0, layer: "top", width: 0.15},
      {route_type: "via", x: 1, y: 0, from_layer: "top", to_layer: "inner2"},
      {route_type: "wire", x: 1, y: 0, layer: "inner2", width: 0.15},
      {route_type: "wire", x: 1, y: 3, layer: "inner2", width: 0.15},
      {route_type: "via", x: 1, y: 3, from_layer: "inner2", to_layer: "bottom"},
    ],
  }])
  expect([...lengths]).toEqual([["top", 1], ["inner2", 3]])
})

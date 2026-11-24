import { expect, test } from "bun:test"
import type { PCBPort, PCBTrace, PCBVia } from "circuit-json"
import { createCopperPathMeasurer } from "../scripts/path-length"

test("copper length follows meanders, splits junctions, ignores stubs, and preserves layer gaps", () => {
  const wire = (x: number, y = 0, layer = "top") => ({ route_type: "wire", x, y, layer, width: 0.1 })
  const trace = (route: unknown[], id = "route") => ({ pcb_trace_id: id, route } as PCBTrace)
  const port = (source_port_id: string, x: number, y = 0, layers = ["top"]) => ({ source_port_id, x, y, layers } as PCBPort)
  const ports = new Map([
    ["a", port("a", 0)], ["b", port("b", 10)], ["tap", port("tap", 5, 5)],
  ])
  const trunk = trace([wire(0), wire(10)])
  const branch = trace([wire(5), wire(5, 5)], "branch")
  const measure = createCopperPathMeasurer([trunk, branch], ports, [])
  expect(measure("a", "b")).toBe(10)
  expect(measure("a", "tap")).toBe(10)
  expect(measure("b", "tap")).toBe(10)
  expect(createCopperPathMeasurer([branch, trunk], ports, [])("a", "tap")).toBe(10)
  expect(createCopperPathMeasurer([trunk, trunk], ports, [])("a", "b")).toBe(10)
  expect(createCopperPathMeasurer([trace([wire(0), wire(4), wire(3), wire(10)])], ports, [])("a", "b")).toBe(10)
  const meander = trace([wire(0), wire(0, 3), wire(10, 3), wire(10)])
  expect(createCopperPathMeasurer([meander, branch], ports, [])("a", "b")).toBe(16)
  expect(createCopperPathMeasurer([trace([wire(0), wire(4)]), trace([wire(6), wire(10)])], ports, [])("a", "b")).toBeNull()
  expect(createCopperPathMeasurer([trace([wire(0, 0, "bottom"), wire(10, 0, "bottom")])], ports, [])("a", "b")).toBeNull()
  const viaChain = trace([wire(0), wire(5), { route_type: "via", x: 5, y: 0, from_layer: "top", to_layer: "bottom" }, wire(5, 0, "bottom"), wire(10, 0, "bottom")])
  ports.get("b")!.layers = ["bottom"]
  expect(createCopperPathMeasurer([viaChain], ports, [])("a", "b")).toBe(10)
  expect(createCopperPathMeasurer([viaChain], ports, [], () => 1.68)("a", "b")).toBeCloseTo(11.68)
  // Equal geometric lengths on two layers must contribute different delays;
  // the explicit via delay must not be multiplied by the wire scale again.
  expect(createCopperPathMeasurer([viaChain], ports, [], () => 7, (layer) => layer === "top" ? 5 : 6)("a", "b")).toBe(62)
  const throughVia = { pcb_trace_id: "route", x: 5, y: 0, layers: ["top", "inner1", "bottom"] } as PCBVia
  ports.set("inner", port("inner", 5, 0, ["inner1"]))
  expect(createCopperPathMeasurer([trunk], ports, [throughVia])("a", "inner")).toBe(5)
  expect(createCopperPathMeasurer([trunk], ports, [])("a", "inner")).toBeNull()
  expect(createCopperPathMeasurer([trunk], ports, [{ ...throughVia, pcb_trace_id: "other-net" }])("a", "inner")).toBeNull()
  expect(createCopperPathMeasurer([], ports, [])("a", "b")).toBeNull()
  expect(measure("missing", "b")).toBeNull()
})

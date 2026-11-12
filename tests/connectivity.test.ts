import { expect, test } from "bun:test"
import type { PCBPort, PCBTrace, PCBVia, SourceTrace } from "circuit-json"
import { arePortsConnected, areTracePortsConnected } from "../scripts/connectivity"

test("physical connectivity rejects isolated stubs and wrong layers and accepts via chains and T junctions", () => {
  const trace = { source_trace_id:"net",connected_source_port_ids:["a","b"] } as SourceTrace
  const ports = new Map([
    ["a",{ source_port_id:"a",x:0,y:0,layers:["top"] } as PCBPort],
    ["b",{ source_port_id:"b",x:10,y:0,layers:["top"] } as PCBPort],
  ])
  const route = (points: unknown[]): PCBTrace => ({ source_trace_id:"net",pcb_trace_id:"route",route:points } as PCBTrace)
  const wire = (x: number,y=0,layer="top") => ({ route_type:"wire",x,y,layer,width:0.1 })
  expect(areTracePortsConnected(trace,[],ports,[])).toBe(false)
  expect(areTracePortsConnected(trace,[route([wire(0),wire(4)]),route([wire(6),wire(10)])],ports,[])).toBe(false)
  expect(areTracePortsConnected(trace,[route([wire(0),wire(10)])],ports,[])).toBe(true)
  const viaChain = route([wire(0),wire(5),{ route_type:"via",x:5,y:0,from_layer:"top",to_layer:"bottom" },wire(5,0,"bottom"),wire(10,0,"bottom")])
  expect(areTracePortsConnected(trace,[viaChain],ports,[])).toBe(false)
  ports.get("b")!.layers = ["bottom"]
  expect(areTracePortsConnected(trace,[viaChain],ports,[])).toBe(true)
  ports.get("b")!.layers = ["top"]
  ports.set("c",{ source_port_id:"c",x:5,y:5,layers:["top"] } as PCBPort)
  const throughVia = { pcb_trace_id:"route",x:5,y:0,layers:["top","bottom"] } as PCBVia
  ports.set("c",{ source_port_id:"c",x:5,y:0,layers:["bottom"] } as PCBPort)
  const tap = { ...trace,connected_source_port_ids:["a","b","c"] }
  expect(areTracePortsConnected(tap,[route([wire(0),wire(10)])],ports,[throughVia])).toBe(true)
  expect(areTracePortsConnected(tap,[route([wire(0),wire(10)])],ports,[])).toBe(false)
  ports.get("c")!.y = 5
  ports.get("c")!.layers = ["top"]
  const branch = { ...trace,connected_source_port_ids:["a","b","c"] }
  expect(areTracePortsConnected(branch,[route([wire(0),wire(10)]),route([wire(5),wire(5,5)])],ports,[])).toBe(true)
  // A native net can own several one-port traces and shared net-owned copper.
  const netRoutes = [route([wire(0),wire(10)]),{
    ...route([wire(5),wire(5,5)]),source_trace_id:"source_net_0",
  } as PCBTrace]
  expect(arePortsConnected(["a","b","c"],netRoutes,ports,[])).toBe(true)
  expect(arePortsConnected(["a","b","c"],[netRoutes[0]],ports,[])).toBe(false)
})

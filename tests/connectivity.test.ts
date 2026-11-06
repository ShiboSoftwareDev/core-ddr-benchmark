import { expect, test } from "bun:test"
import type { PCBPort, PCBTrace, SourceTrace } from "circuit-json"
import { areTracePortsConnected } from "../scripts/connectivity"

test("physical connectivity rejects isolated stubs and wrong layers and accepts via chains and T junctions", () => {
  const trace = { source_trace_id:"net",connected_source_port_ids:["a","b"] } as SourceTrace
  const ports = new Map([
    ["a",{ source_port_id:"a",x:0,y:0,layers:["top"] } as PCBPort],
    ["b",{ source_port_id:"b",x:10,y:0,layers:["top"] } as PCBPort],
  ])
  const route = (points: unknown[]): PCBTrace => ({ source_trace_id:"net",route:points } as PCBTrace)
  const wire = (x: number,y=0,layer="top") => ({ route_type:"wire",x,y,layer,width:0.1 })
  expect(areTracePortsConnected(trace,[],ports)).toBe(false)
  expect(areTracePortsConnected(trace,[route([wire(0),wire(4)]),route([wire(6),wire(10)])],ports)).toBe(false)
  expect(areTracePortsConnected(trace,[route([wire(0),wire(10)])],ports)).toBe(true)
  const viaChain = route([wire(0),wire(5),{ route_type:"via",x:5,y:0,from_layer:"top",to_layer:"bottom" },wire(5,0,"bottom"),wire(10,0,"bottom")])
  expect(areTracePortsConnected(trace,[viaChain],ports)).toBe(false)
  ports.get("b")!.layers = ["bottom"]
  expect(areTracePortsConnected(trace,[viaChain],ports)).toBe(true)
  ports.get("b")!.layers = ["top"]
  ports.set("c",{ source_port_id:"c",x:5,y:5,layers:["top"] } as PCBPort)
  const branch = { ...trace,connected_source_port_ids:["a","b","c"] }
  expect(areTracePortsConnected(branch,[route([wire(0),wire(10)]),route([wire(5),wire(5,5)])],ports)).toBe(true)
})

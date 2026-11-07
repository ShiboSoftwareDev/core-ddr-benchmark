import { mkdirSync, writeFileSync } from "node:fs"
import type { PCBPort } from "circuit-json"
import { RootCircuit } from "tscircuit"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import * as checks from "@tscircuit/checks"
import { areTracePortsConnected } from "../../scripts/connectivity"
import { H3CompleteBytesBoard } from "./board"

type SourcePortId = PCBPort["source_port_id"]

const output = process.argv[2] ?? import.meta.dir
mkdirSync(output, { recursive: true })
const circuit = new RootCircuit()
const errors: string[] = []
const phases: Array<{ name: string; status: string; connections: number }> = []
circuit.on("autorouting:start", (event) => {
  phases.push({ name: event.phaseName, status: "running", connections: event.simpleRouteJson.connections.length })
})
circuit.on("autorouting:end", () => { phases.at(-1)!.status = "completed" })
circuit.on("autorouting:error", () => { phases.at(-1)!.status = "failed" })
circuit.on("asyncEffect:end", (event) => {
  if (event.error) errors.push(String(event.error))
})
circuit.add(<H3CompleteBytesBoard />)
await circuit.renderUntilSettled()
const circuitJson = circuit.getCircuitJson()
const selected = circuitJson.filter((row) => row.type === "source_trace" && /_SDQ(?:\d|M|S)/.test(row.name ?? ""))
const routes = circuitJson.filter((row) => row.type === "pcb_trace")
const vias = circuitJson.filter((row) => row.type === "pcb_via")
const ports = new Map<SourcePortId, PCBPort>(circuitJson.filter((row) => row.type === "pcb_port").map((port) => [port.source_port_id, port]))
const connected = selected.filter((trace) => areTracePortsConnected(trace, routes, ports, vias)).length
const clearance = { minClearance: 0.0889 }
const findings = {
  overlap: checks.checkEachPcbTraceNonOverlapping(circuitJson, clearance),
  padTrace: checks.checkPadTraceClearance(circuitJson, clearance),
  viaTrace: checks.checkViaTraceClearance(circuitJson, clearance),
  viaPad: checks.checkViaPadClearance(circuitJson, clearance),
  viaSpacing: checks.checkDifferentNetViaSpacing(circuitJson),
  continuity: checks.checkTracesAreContiguous(circuitJson),
  viaInPad: checks.checkViasInPads(circuitJson),
  outOfBoard: checks.checkPcbTracesOutOfBoard(circuitJson),
  selfShorts: checks.checkPcbTraceSelfShorts(circuitJson),
}
const physicalFindings = Object.fromEntries(Object.entries(findings).map(([name, rows]) => [name, rows.filter((row) => row.type.endsWith("_error")).length]))
const completed = connected === 22 && errors.length === 0 && Object.values(physicalFindings).every((count) => count === 0)
const result = { runtime: "tscircuit@0.0.3114", requested: selected.length, connected, completed, nativePads: circuitJson.filter((row) => row.type === "pcb_smtpad").length, physicalFindings, phases, errors }
if (selected.length !== 22 || result.nativePads !== 445) throw new Error("H3 native circuit scope changed")
if (errors.length === 0 && !completed) throw new Error("H3 byte routing did not pass connectivity and physical checks")
const annotated: typeof circuitJson = circuitJson.filter((row) => row.type !== "pcb_note_text")
annotated.push({ type: "pcb_note_text", pcb_note_text_id: "routing_status", pcb_group_id: "routing_status", font: "tscircuit2024", font_size: 0.4, layer: "top", anchor_alignment: "center", anchor_position: { x: 0, y: 10 }, text: `${connected}/22 connected: 16 DQ + 4 DQS + 2 DQM; ${completed ? "physical checks passed" : "FAILED"}` })
writeFileSync(`${output}/board.snap.svg`, convertCircuitJsonToPcbSvg(annotated, { backgroundColor: "white", width: 1400, height: 1000, shouldDrawErrors: false, shouldDrawRatsNest: !completed, showPcbGroups: false, showDebugObjects: false, showErrorsInTextOverlay: false }))
writeFileSync(`${output}/result.json`, JSON.stringify(result, null, 2) + "\n")
writeFileSync(`${output}/circuit.json`, JSON.stringify(circuitJson))
console.log(JSON.stringify(result))

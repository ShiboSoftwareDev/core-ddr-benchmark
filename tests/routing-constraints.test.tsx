import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { NativeDdrBoard } from "../circuits/native-ddr-board"
import { getDdrReference } from "../circuits/ddr-constraints"

// Inspect the emitted JSX options passed to Core; DM/DQS began in the legacy
// remaining group and must join the DQ nets when their source class is tuned.
test("original OrangeCrab classes route every member in the bus's matching phase", () => {
  const source = JSON.parse(gunzipSync(readFileSync(`${import.meta.dir}/../circuits/orangecrab.json.gz`)).toString())
  const board = NativeDdrBoard({ source })
  const children = (board.props as any).children.flat(Infinity)
  const phases = children.filter((child: any) => child.type === "autoroutingphase")
  const buses = children.filter((child: any) => child.type === "bus")
  const nets = children.filter((child: any) => child.type === "net")
  for (const target of getDdrReference("orangecrab").constraints!.filter((target) => target.name.includes("LM1.0"))) {
    const bus = buses.find((bus: any) => bus.props.name === target.name)
    expect(bus.props.maxLengthSkew).toBe(1)
    const phase = phases.find((phase: any) => phase.props.phaseIndex === bus.props.routingPhaseIndex)
    expect(phase.props.autorouter).toBe("bus_lanes")
    for (const nativeNet of target.nets) {
      const trace = source.traces.find((trace: any) => trace.nativeNet === nativeNet)
      const net = nets.find((net: any) => net.props.name === trace.name)
      expect(net.props.routingPhaseIndex).toBe(phase.props.phaseIndex)
      for (const terminal of trace.path) expect(phase.props.connections).toContain(terminal)
    }
  }
})

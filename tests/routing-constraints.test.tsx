import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { NativeDdrBoard } from "../circuits/native-ddr-board"
import { getDdrReference } from "../circuits/ddr-constraints"
import { getDdrSkewGroups } from "../circuits/ddr-signals"

test("the retained-route attempt uses the original H616 byte phases without length constraints", () => {
  const source = JSON.parse(gunzipSync(readFileSync(`${import.meta.dir}/../circuits/h616.json.gz`)).toString())
  const board = NativeDdrBoard({ source, matchLengths: false })
  const children = (board.props as any).children.flat(Infinity)
  const phases = children.filter((child: any) => child.type === "autoroutingphase")
  const buses = children.filter((child: any) => child.type === "bus")
  expect(phases.map((phase: any) => phase.props.name)).toEqual(["byte0", "byte1", "remaining"])
  expect(buses).toHaveLength(2)
  for (const bus of buses) {
    expect(bus.props.maxLengthSkew).toBeUndefined()
    expect(bus.props.minLength).toBeUndefined()
    expect(bus.props.maxLength).toBeUndefined()
  }
})

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
    expect(bus.props.maxLengthSkew).toBeLessThanOrEqual(1)
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

test("H3 mask and strobes join their physical byte's constrained routing phase", () => {
  const source = JSON.parse(gunzipSync(readFileSync(`${import.meta.dir}/../circuits/h3.json.gz`)).toString())
  const board = NativeDdrBoard({ source })
  const children = (board.props as any).children.flat(Infinity)
  const nets = children.filter((child: any) => child.type === "net")
  const buses = children.filter((child: any) => child.type === "bus")
  for (const group of getDdrSkewGroups(source).filter((group) => / byte[01]$/.test(group.name))) {
    const phase = nets.find((net: any) => net.props.name === group.signals[0].sections[0][0]).props.routingPhaseIndex
    for (const signal of group.signals) {
      expect(nets.find((net: any) => net.props.name === signal.sections[0][0]).props.routingPhaseIndex).toBe(phase)
      const bus = buses.find((bus: any) => bus.props.connections.includes(signal.sections[0][1]))
      expect(bus.props.routingPhaseIndex).toBe(phase)
      expect(bus.props.maxLengthSkew).toBeGreaterThanOrEqual(0)
      expect(bus.props.minLength).toBeDefined()
      expect(bus.props.maxLength).toBeUndefined()
    }
  }
})

test("A13 saved RAM-side targets retain their original series-section phase", () => {
  const source = JSON.parse(gunzipSync(readFileSync(`${import.meta.dir}/../circuits/a13.json.gz`)).toString())
  const trace = source.traces.find((trace: any) => trace.nativeNet === "/DDR3 Memory/ddr-d2")
  const board = NativeDdrBoard({ source })
  const children = (board.props as any).children.flat(Infinity)
  const net = children.find((child: any) => child.type === "net" && child.props.name === trace.name)
  const phase = children.find((child: any) => child.type === "autoroutingphase" && child.props.phaseIndex === net.props.routingPhaseIndex)
  expect(phase.props.name).toBe(trace.group)
})

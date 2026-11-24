import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { getDdrRoutingBuses, getDdrReference, measureDdrConstraints } from "../circuits/ddr-constraints"
import { getDdrSkewGroups, measureDdrSkew } from "../scripts/ddr-skew"
import manifest from "../manifest.json"
import { getDdrNetEndpoints } from "../circuits/ddr-signals"

const fixtures = manifest.circuits.map((entry) => JSON.parse(gunzipSync(readFileSync(`${import.meta.dir}/../${entry.file}`)).toString()))
const fixture = (id: string) => fixtures.find((source) => source.id === id)

test("optional reference targets resolve only to their original native nets", () => {
  let count = 0
  for (const source of fixtures) {
    const constraints = getDdrReference(source.id).constraints ?? []
    const buses = getDdrRoutingBuses(source)
    count += constraints.length
    const selectors = buses.flatMap((bus) => bus.connections)
    expect(new Set(selectors).size).toBe(selectors.length)
    for (const constraint of constraints) {
      for (const net of constraint.nets) {
        const trace = source.traces.find((trace: any) => trace.nativeNet === net)
        const endpoints = getDdrNetEndpoints(source, trace, constraint.memoryRef)
        expect(trace.path).toContain(endpoints[0])
        expect(trace.path).toContain(endpoints[1])
        if (constraint.memoryRef) expect(endpoints[1]).toStartWith(`.${constraint.memoryRef} > `)
        if (trace.path.length === 2 && (constraint.severity ?? "error") === "error" && !constraint.assessmentOnly) expect(selectors).toContain(endpoints[0])
      }
      expect(buses.every((bus) => !("routingPhaseIndex" in bus))).toBe(true)
    }
  }
  expect(count).toBe(31)
  expect(getDdrRoutingBuses(fixture("h3")).map((bus) => bus.name)).toEqual(["DDR_BUS_byte0", "DDR_BUS_byte1"])
  const a13 = getDdrReference("a13").constraints![0]
  expect(a13.nets).toEqual(["/DDR3 Memory/ddr-d2"])
  expect(a13.minLength).toBe(24.74)
  expect(a13.maxLength).toBe(24.94)
  const imx6 = fixture("imx6")
  const branch = imx6.traces.find((trace: any) => trace.nativeNet.endsWith("DRAM_DATA8"))
  expect(branch.path[0]).toBe(".TP27 > .pin1")
  expect(getDdrNetEndpoints(imx6, branch)).toEqual([".U7 > .pin274", ".U9 > .pin22"])
  expect(measureDdrConstraints(imx6, () => 40).find((constraint) => constraint.name === "Length DDR BANK 1")!.routerSkippedNets).toContain(branch.nativeNet)
  expect(getDdrRoutingBuses(imx6).every((bus) => bus.minLength === undefined && bus.maxLength === undefined && bus.maxLengthSkew === undefined)).toBe(true)
  expect(getDdrReference("imx6").constraints!.every((constraint) => constraint.severity === "ignore")).toBe(true)
})

test("shared ButterStick nets are measured independently at each RAM endpoint", () => {
  const source = fixture("butterstick")
  const firstDq = getDdrSkewGroups(source)[0].signals[0].name
  const measured = measureDdrConstraints(source, (trace, memoryRef) => memoryRef === "U12" && trace.nativeNet === firstDq ? 12 : 10)
  expect(measured.find((target) => target.name === "U11 byte0 DQ/DM to DQS (§9.2)")!.status).toBe("met")
  const second = measured.find((target) => target.name === "U12 byte0 DQ/DM to DQS (§9.2)")!
  expect(second.actualSkewMm).toBe(2)
  expect(second.status).toBe("exceeded")
  const trace = source.traces.find((trace: any) => trace.nativeNet === firstDq)
  expect(getDdrNetEndpoints(source, trace, "U11")[1]).toStartWith(".U11 > ")
  expect(getDdrNetEndpoints(source, trace, "U12")[1]).toStartWith(".U12 > ")
})

test("ECP5 guidance checks physical DQS associations and relative matching", () => {
  const source = fixture("orangecrab")
  const byte = getDdrSkewGroups(source)[0]
  const constraint = getDdrReference(source.id).constraints!.find((target) => target.name === `${byte.name} DQ/DM to DQS (§9.2)` )!
  expect(constraint.referenceNets).toEqual(byte.signals.slice(-2).map((signal) => signal.name))
  expect(constraint.referenceNets!.join(" ")).toContain("UDQS")
  expect(constraint.maxLengthSkew).toBe(1.27)
  expect(constraint.assessmentOnly).toBe(true)
  const pair = getDdrReference(source.id).constraints!.find((target) => target.name === "U4 DQS0 pair (§9.7)")!
  expect(pair.maxLengthSkew).toBe(0.254)
  const physical = measureDdrSkew(source, () => 10)
  expect(physical["U4 byte0"].maxSkewMm).toBe(2.54)
  expect(physical["U4 address/command"].maxSkewMm).toBe(5.08)
  const measured = measureDdrConstraints(source, (trace) => constraint.referenceNets!.includes(trace.nativeNet) ? 10 : 11.3)
    .find((target) => target.name === constraint.name)!
  // A 2.54 mm whole-group range would pass; the 1.27 mm DQ-to-DQS test must fail.
  expect(measured.actualSkewMm).toBeCloseTo(1.3)
  expect(measured.status).toBe("exceeded")
  const missing = measureDdrConstraints(source, (trace) => trace.nativeNet === constraint.referenceNets![0] ? null : 10)
    .find((target) => target.name === constraint.name)!
  expect(missing.status).toBe("incomplete")
  expect(missing.actualSkewMm).toBeNull()
  expect(getDdrReference(source.id).notes!.join(" ")).toContain("LM1.0")
})

test("H616 follows source class priority and checks mean deviation independently of range", () => {
  const source = fixture("h616")
  const low = getDdrReference("h616").constraints!.find((constraint) => constraint.name === "L_BYTE_LANE_LEN")!
  const high = getDdrReference("h616").constraints!.find((constraint) => constraint.name === "H_BYTE_LANE_LEN")!
  expect(low.nets).toHaveLength(7)
  expect(high.nets).toHaveLength(9)
  expect(high.nets).toContain("/DRAM/DQ1")
  expect(low.nets).not.toContain("/DRAM/DQ1")
  expect(getDdrRoutingBuses(source).find((bus) => bus.name === high.name)!.maxLengthSkew).toBe(5.08)
  const measured = measureDdrConstraints(source, (trace) => trace.nativeNet === "/DRAM/DQ1" ? 25.08 : 20)
  const result = measured.find((constraint) => constraint.name === high.name)!
  expect(result.actualMaxMm! - result.actualMinMm!).toBeCloseTo(5.08)
  expect(result.actualSkewMm).toBeCloseTo(5.08 * 8 / 9)
  expect(result.status).toBe("exceeded")
  expect(result.marginMm).toBeLessThan(0)
  expect(measureDdrConstraints(source, () => 20).every((constraint) => constraint.status === "met")).toBe(true)
})

test("reports direct pair limits and only fully specified implied skew windows", () => {
  const imx6 = fixture("imx6")
  const measured = measureDdrSkew(imx6, () => 44.2)
  expect(measured["U9 byte0"].maxSkewMm).toBeCloseTo(0.5)
  expect(measured["U9 byte1"].maxSkewMm).toBeCloseTo(0.5)
  expect(measured["U9 address/command"].maxSkewMm).toBeCloseTo(1)
  const ice = measureDdrSkew(fixture("icepi"), () => 20.5)
  expect(ice["U2 clock"].maxSkewMm).toBe(0.1)
  expect(ice["U2 clock"].limitBasis).toBe("explicit")
  expect(ice["U2 DQS0"].maxSkewMm).toBeCloseTo(0.2)
  expect(ice["U2 byte0"].maxSkewMm).toBeUndefined()
  expect(measureDdrSkew(fixture("a13"), () => 24.84)["U200 byte0"].maxSkewMm).toBeUndefined()
  expect(getDdrSkewGroups(fixture("icepi"))[0].signals).toHaveLength(11)
})

test("length targets distinguish excess from incomplete copper", () => {
  const source = fixture("a13")
  const excessive = measureDdrConstraints(source, () => 25)[0]
  expect(excessive.actualMaxMm).toBe(25)
  expect(excessive.marginMm).toBeCloseTo(-0.06)
  expect(excessive.status).toBe("exceeded")
  expect(measureDdrConstraints(source, () => 24.84)[0].status).toBe("met")
  const missing = measureDdrConstraints(source, () => null)[0]
  expect(missing.marginMm).toBeNull()
  expect(missing.status).toBe("incomplete")
})

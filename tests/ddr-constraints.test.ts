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
  expect(count).toBe(99)
  expect(getDdrRoutingBuses(fixture("h3")).every((bus) => bus.maxLengthSkew !== undefined)).toBe(true)
  const a13 = getDdrReference("a13").constraints![0]
  expect(a13.nets).toEqual(["/DDR3 Memory/ddr-d2"])
  expect(a13.minLength).toBe(24.74)
  expect(a13.maxLength).toBe(24.94)
  const imx6 = fixture("imx6")
  const branch = imx6.traces.find((trace: any) => trace.nativeNet.endsWith("DRAM_DATA8"))
  expect(branch.path[0]).toBe(".TP27 > .pin1")
  expect(getDdrNetEndpoints(imx6, branch)).toEqual([".U7 > .pin274", ".U9 > .pin22"])
  expect(measureDdrConstraints(imx6, () => 40).find((constraint) => constraint.name === "Length DDR BANK 1")!.routerSkippedNets).toContain(branch.nativeNet)
  expect(getDdrRoutingBuses(imx6).some((bus) => bus.maxLengthSkew !== undefined)).toBe(true)
  expect(getDdrReference("imx6").constraints!.filter((constraint) => constraint.minLength !== undefined && !constraint.lengthReference).every((constraint) => constraint.severity === "ignore")).toBe(true)
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
  expect(physical["U4 address/command"].maxSkewMm).toBe(1)
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

test("OrangeCrab's bundled checker defines strict one-millimetre class ranges", () => {
  const source = fixture("orangecrab")
  const targets = getDdrReference(source.id).constraints!.filter((target) => target.name.includes("LM1.0"))
  expect(targets.map((target) => target.nets.length)).toEqual([25, 11, 11])
  expect(targets.every((target) => target.sourcePath.endsWith("length_match.py") && target.maxLengthSkew === 1)).toBe(true)
  // Keep the author's classes literal even where their DQS labels differ
  // from the physical RAM-byte membership used by the separate benchmark.
  expect(targets[1].nets).toContain("RAM_LDQS+")
  expect(targets[1].nets).not.toContain("RAM_UDQS+")
  const measured = measureDdrConstraints(source, (trace) => trace.nativeNet === "RAM_D0" ? 11 : 10)
    .find((target) => target.name === targets[1].name)!
  expect(measured.status).toBe("exceeded")
  expect(measured.actualSkewMm).toBe(1)
})

test("repaired source selectors retain their original expressions and exact scope", () => {
  const h616 = getDdrReference("h616").constraints!.filter((target) => target.appliedCondition)
  expect(h616).toHaveLength(3)
  expect(h616.map((target) => target.maxLengthSkew)).toEqual([4.445, 4.445, 3.175])
  expect(h616.map((target) => target.nets.length)).toEqual([23, 25, 16])
  expect(h616.every((target) => target.sourceCondition!.includes("B.NetClass") && target.appliedCondition!.includes(" || A.NetClass"))).toBe(true)
  expect(h616.every((target) => target.assessmentOnly && target.skewReference === "mean")).toBe(true)
  expect(h616.every((target) => target.severity === "warning" && target.sourceSeverity === "error")).toBe(true)
  const imx = getDdrReference("imx6").constraints!.find((target) => target.name === "Diff Pair Skew")!
  expect(imx.sourceCondition).toBe("A.inDiffPair('DRAM_DQSL')")
  expect(imx.appliedCondition).toBe("A.inDiffPair('/i.MX6ULL MAIN/RAM DDR3/DRAM_DQSL')")
  expect(imx.nets).toHaveLength(2)
  expect(imx.maxLengthSkew).toBe(0.1)
  expect(imx.skewReference).toBeUndefined()
  expect(imx.severity).toBe("warning")
})

test("nonzero saved skew targets keep their signed selected-to-coupled window", () => {
  const source = fixture("imx6")
  const offsets = getDdrReference(source.id).constraints!.filter((target) => target.skewReference === "signed_pair")
  expect(offsets).toHaveLength(3)
  expect(offsets.map((target) => target.targetSignedSkew)).toEqual([43, 33.5, 39.3])
  const clock = offsets[0]
  const measured = measureDdrConstraints(source, (trace) => trace.nativeNet === clock.nets[0] ? 54 : 10)
    .find((target) => target.name === clock.name)!
  expect(measured.actualSkewMm).toBe(44)
  expect(measured.status).toBe("met")
  const reversed = measureDdrConstraints(source, (trace) => trace.nativeNet === clock.nets[0] ? 10 : 54)
    .find((target) => target.name === clock.name)!
  expect(reversed.actualSkewMm).toBe(-44)
  expect(reversed.status).toBe("exceeded")
  expect(clock.maxLengthSkew).toBeUndefined()
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
  expect(ice["U2 DQS0"].maxSkewMm).toBeLessThanOrEqual(0.2)
  expect(ice["U2 byte0"].maxSkewMm).toBe(2.54)
  expect(ice["U2 byte0"].limitOrigin).toBe("original_matching")
  const a13 = measureDdrSkew(fixture("a13"), () => 24.84)["U200 byte0"]
  expect(a13.maxSkewMm).toBe(4.575716)
  expect(a13.limitOrigin).toBe("original_matching")
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

test("Allwinner H3 and iCE/Pi use the controller's physical DQ and pair rules", () => {
  for (const id of ["h3", "icepi"]) {
    const source = fixture(id)
    const byte = getDdrSkewGroups(source)[0]
    const target = getDdrReference(id).constraints!.find((rule) => rule.name === `${byte.name} DQ to DQS (Allwinner)`)!
    expect(target.nets).toHaveLength(10)
    expect(target.nets).not.toContain(byte.signals[8].name)
    expect(target.referenceNets).toEqual(byte.signals.slice(9).map((signal) => signal.name))
    expect(target.maxLengthSkew).toBe(1.27)
    expect(target.sourceSha256).toBe("4fcf5c17d72cf39ed0a46362f1a5ab66b5d7ea4369c25acda480baad970ac50a")
    const measured = measureDdrConstraints(source, (trace) => target.referenceNets!.includes(trace.nativeNet) ? 10 : 11.271)
    expect(measured.find((rule) => rule.name === target.name)!.status).toBe("exceeded")
  }
})

test("A64 branch skew compares the two RAM endpoints of each shared net", () => {
  const source = fixture("a64")
  const branchRules = (measure: Parameters<typeof measureDdrConstraints>[1]) => measureDdrConstraints(source, measure).filter((rule) => rule.skewReference === "memory_endpoints")
  const measured = branchRules((trace, memory) => (trace.nativeNet.includes("SA0") ? 100 : 10) + (memory === "U3" ? 0.5 : 0))
  expect(measured).toHaveLength(2)
  expect(measured.every((rule) => rule.actualSkewMm === 0.5 && rule.status === "met")).toBe(true)
  expect(branchRules((_, memory) => memory === "U3" ? 11.28 : 10).every((rule) => rule.status === "exceeded")).toBe(true)
  expect(branchRules((_, memory) => memory === "U3" ? null : 10).every((rule) => rule.status === "incomplete")).toBe(true)
})

test("A13 original matching sums both resistor sections and cannot pass on RAM-side copper alone", () => {
  const source = fixture("a13")
  const byte = getDdrSkewGroups(source)[0]
  const dq = byte.signals[0]
  expect(dq.sections).toHaveLength(2)
  const name = `${byte.name} DQ/DM to DQS (original matching)`
  const excess = getDdrReference("a13").constraints!.find((rule) => rule.name === name)!.maxLengthSkew! + 1
  const onlyRam = measureDdrConstraints(source, () => 10).find((rule) => rule.name === name)!
  expect(onlyRam.status).toBe("incomplete")
  const complete = measureDdrConstraints(source, () => 10, (section) => section[0] === dq.sections[0][0] ? 10 + excess : 10)
    .find((rule) => rule.name === name)!
  expect(complete.lengthsMm[dq.name]).toBeCloseTo(20 + excess)
  expect(complete.actualSkewMm).toBeCloseTo(excess)
  expect(complete.status).toBe("exceeded")
  const missing = measureDdrConstraints(source, () => 10, (section) => section[0] === dq.sections[0][0] ? null : 10)
    .find((rule) => rule.name === name)!
  expect(missing.status).toBe("incomplete")
})

test("unpublished budgets preserve each board's actual matching without borrowed controller limits", () => {
  for (const id of ["h3", "icepi", "a13", "a64", "h616"]) {
    const source = fixture(id)
    for (const byte of getDdrSkewGroups(source).filter((group) => / byte[01]$/.test(group.name))) {
      const target = getDdrReference(id).constraints!.find((rule) => rule.basis === "original_matching" && rule.name.startsWith(byte.name) && rule.skewReference === "references")!
      expect(target.nets).toContain(byte.signals[8].name)
      expect(target.referenceNets).toEqual(byte.signals.slice(9).map((signal) => signal.name))
      expect(target.sourceSha256).toBe(manifest.circuits.find((c) => c.id === id)!.source.sourceSha256)
      expect(target.derivation).toContain("not a manufacturer maximum")
      expect(target.pathBasis).toBe("full_signal")
    }
  }
})

test("NXP relative windows use the shortest CK and preserve their direction", () => {
  const source = fixture("imx6")
  const measured = measureDdrConstraints(source, (trace) => trace.nativeNet.endsWith("DRAM_CLK_N") ? 12 : trace.nativeNet.endsWith("DRAM_CLK_P") ? 10 : 10.5)
  const byte = measured.find((rule) => rule.name === "U9 byte0 no longer than CK (NXP)")!
  expect(byte.actualMaxMm).toBe(0.5)
  expect(byte.status).toBe("exceeded")
  const command = measured.find((rule) => rule.name === "U9 address/command to shortest CK (NXP)")!
  expect(command.minLength).toBe(-5.08)
  expect(command.maxLength).toBe(0)
  expect(command.status).toBe("exceeded")
  const shorter = measureDdrConstraints(source, (trace) => trace.nativeNet.includes("DRAM_CLK_") && !trace.nativeNet.includes("EN") ? 10 : 4.91)
  expect(shorter.find((rule) => rule.name === command.name)!.status).toBe("exceeded")
})

test("preservation windows never contradict explicit saved targets", () => {
  for (const source of fixtures) for (const bus of getDdrRoutingBuses(source)) {
    if (bus.minLength !== undefined && bus.maxLength !== undefined) expect(bus.minLength).toBeLessThanOrEqual(bus.maxLength)
  }
  const source = fixture("icepi")
  const dqs = getDdrSkewGroups(source)[3].signals[0].sections[0]
  const target = getDdrRoutingBuses(source).find((bus) => bus.connections.includes(dqs[1]))!
  expect(target.minLength).toBeGreaterThanOrEqual(20.4)
  expect(target.maxLength).toBeLessThanOrEqual(20.6)
  expect(target.maxLengthSkew).toBeLessThan(0.01)
  const h3 = fixture("h3")
  const strobe = getDdrSkewGroups(h3)[1].signals[0].sections[0]
  const h3Target = getDdrRoutingBuses(h3).find((bus) => bus.connections.includes(strobe[1]))!
  expect(h3Target.minLength).toBeGreaterThan(21)
  expect(h3Target.maxLengthSkew).toBeLessThan(0.014)
  expect(getDdrRoutingBuses(h3).every((bus) => bus.maxLength === undefined)).toBe(true)
})

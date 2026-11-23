import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { getSkewGroups } from "../scripts/skew"
import manifest from "../manifest.json"

test("all ten native fixtures have explicit byte, pair, and address matching paths", () => {
  expect(manifest.circuits).toHaveLength(10)
  let groupCount = 0
  for (const fixture of manifest.circuits) {
    const source = JSON.parse(gunzipSync(readFileSync(`${import.meta.dir}/../${fixture.file}`)).toString())
    const groups = getSkewGroups(fixture.id)
    groupCount += groups.length
    expect(new Set(groups.map((group) => group.name)).size).toBe(groups.length)
    expect(groups.some((group) => group.kind === "address_command")).toBe(true)
    const measuredNets = new Set<string>()
    for (const group of groups) {
      const signals = Object.values(group.signals)
      if (group.kind === "data_byte") {
        expect(signals).toHaveLength(11)
        const balls = signals.map((sections) => {
          const selector = sections.at(-1)![2]
          const [, ref, pin] = /^\.(\S+) > \.(\S+)$/.exec(selector)!
          const memory = source.parts.find((part: any) => part.name === ref)
          return memory.pads.find((pad: any) => pad.pin === pin).nativePin
        }).sort().join(",")
        // DDR3 x16 FBGA96 lower/upper bytes, including their own mask/strobe.
        // This catches H616's swapped DQS/DM suffixes in the native net names.
        expect([
          ["E3", "F7", "F2", "F8", "H3", "H8", "G2", "H7", "E7", "F3", "G3"].sort().join(","),
          ["D7", "C3", "C8", "C2", "A7", "A2", "B8", "A3", "D3", "B7", "C7"].sort().join(","),
        ]).toContain(balls)
      }
      if (group.kind === "differential_pair") expect(signals).toHaveLength(2)
      for (const sections of signals) {
        expect(sections).toHaveLength(fixture.id === "a13" ? 2 : 1)
        if (fixture.id === "a13") {
          const [, , cpuSide] = sections[0]
          const [, ramSide] = sections[1]
          const cpuPad = /^\.(\S+) > \.pin(\d+)$/.exec(cpuSide)!
          const ramPad = /^\.(\S+) > \.pin(\d+)$/.exec(ramSide)!
          expect(cpuPad[1]).toBe(ramPad[1])
          // Native four-resistor arrays pair 1–8, 2–7, 3–6, 4–5;
          // discrete series resistors pair 1–2.
          expect(Number(cpuPad[2]) + Number(ramPad[2])).toBe(cpuPad[1].startsWith("RN") ? 9 : 3)
        }
        for (const [net, from, to] of sections) {
          const trace = source.traces.find((trace: any) => trace.name === net)
          expect(trace).toBeDefined()
          expect(trace.path).toContain(from)
          expect(trace.path).toContain(to)
          expect(from).not.toBe(to)
          measuredNets.add(net)
        }
      }
    }
    // Reset is asynchronous. Glider CS is tied through R101 rather than driven
    // by the controller. Every other retained native net must be accounted for.
    const excluded = source.traces.filter((trace: any) => /RST|RESET/i.test(trace.nativeNet) || fixture.id === "glider" && trace.nativeNet.endsWith("DRAM_CSB"))
    expect(source.traces.filter((trace: any) => !measuredNets.has(trace.name))).toEqual(excluded)
  }
  expect(groupCount).toBe(78)
})

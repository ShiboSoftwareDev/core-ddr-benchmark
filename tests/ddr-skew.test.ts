import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { getDdrSkewGroups, getDdrSkewGroupNames, measureDdrSkew } from "../scripts/ddr-skew"
import { formatReport } from "../scripts/report"
import type { BenchmarkResult } from "../scripts/types"
import manifest from "../manifest.json"
import references from "../circuits/ddr-skew-reference.json"

const fixtures = manifest.circuits.map((entry) => JSON.parse(gunzipSync(readFileSync(`${import.meta.dir}/../${entry.file}`)).toString()))

test("all original-board comparisons match pinned sources and detect regressions", () => {
  let count = 0
  for (const entry of manifest.circuits) {
    const reference = references[entry.id as keyof typeof references]
    expect(reference.sourceSha256).toBe(entry.source.sourceSha256)
    expect(reference.fixtureSha256).toBe(entry.sha256)
    const groups = reference.groups as Record<string, { minLengthMm: number; maxLengthMm: number }>
    expect(Object.keys(groups)).toEqual(getDdrSkewGroupNames(entry.id))
    count += Object.keys(groups).length
    expect(Object.values(groups).every((group) => group.maxLengthMm >= group.minLengthMm)).toBe(true)
  }
  expect(count).toBe(78)
  const source = fixtures.find((source) => source.id === "orangecrab")
  const group = getDdrSkewGroups(source)[0]
  const original = references.orangecrab.groups["U4 byte0"]
  const net = group.signals[0].sections[0][0]
  const preserved = measureDdrSkew(source, () => 10)[group.name]
  expect(preserved.matchingStatus).toBe("preserved")
  expect(preserved.referenceSkewMm).toBeCloseTo(original.maxLengthMm - original.minLengthMm)
  const regression = measureDdrSkew(source, ([name]) => name === net ? 15 : 10)[group.name]
  expect(regression.matchingStatus).toBe("regressed")
  expect(regression.referenceDeltaMm).toBeGreaterThan(0)
  const incomplete = measureDdrSkew(source, ([name]) => name === net ? null : 10)[group.name]
  expect(incomplete.matchingStatus).toBe("incomplete")
  expect(incomplete.referenceDeltaMm).toBeNull()
})

test("all 10 full fixtures cover physical bytes, pairs and address/command paths", () => {
  expect(fixtures).toHaveLength(10)
  let count = 0
  for (const source of fixtures) {
    const groups = getDdrSkewGroups(source)
    count += groups.length
    const measured = new Set<string>()
    expect(groups.map((group) => group.name)).toEqual(getDdrSkewGroupNames(source.id))
    expect(new Set(groups.map((group) => group.name)).size).toBe(groups.length)
    for (const group of groups) {
      if (group.name.includes("byte")) expect(group.signals).toHaveLength(11)
      else if (group.name.endsWith("address/command")) expect(group.signals.length).toBeGreaterThan(20)
      else expect(group.signals).toHaveLength(2)
      for (const signal of group.signals) {
        expect(signal.sections).toHaveLength(source.id === "a13" || ["a64", "stmp157"].includes(source.id) && group.name.endsWith("clock") ? 2 : 1)
        for (const [net, from, to] of signal.sections) {
          const trace = source.traces.find((trace: any) => trace.name === net)
          expect(trace.path).toContain(from)
          expect(trace.path).toContain(to)
          expect(from).not.toBe(to)
          measured.add(net)
        }
        if (source.id === "a13") {
          const cpu = /^\.(\S+) > \.pin(\d+)$/.exec(signal.sections[0][2])!
          const ram = /^\.(\S+) > \.pin(\d+)$/.exec(signal.sections[1][1])!
          expect(cpu[1]).toBe(ram[1])
          expect(Number(cpu[2]) + Number(ram[2])).toBe(cpu[1].startsWith("RN") ? 9 : 3)
        }
      }
    }
    const excluded = source.traces.filter((trace: any) => /RST|RESET/i.test(trace.nativeNet) || source.id === "glider" && trace.nativeNet.endsWith("DRAM_CSB"))
    expect(source.traces.filter((trace: any) => !measured.has(trace.name))).toEqual(excluded)
  }
  expect(count).toBe(78)
})

test("byte membership follows actual RAM pins despite swapped DQS and mask names", () => {
  const h616 = getDdrSkewGroups(fixtures.find((source) => source.id === "h616"))
  expect(h616[0].signals.map((signal) => signal.name)).toContain("/DRAM/SDQM1")
  expect(h616[2].signals.map((signal) => signal.name)).toContain("/DRAM/SDQM0")
  const orangecrab = getDdrSkewGroups(fixtures.find((source) => source.id === "orangecrab"))
  expect(orangecrab[1].signals.map((signal) => signal.name).join(" ")).toContain("UDQS")
  expect(orangecrab[3].signals.map((signal) => signal.name).join(" ")).toContain("LDQS")
})

test("series sections are summed and a missing member cannot improve skew", () => {
  const source = fixtures.find((source) => source.id === "a13")
  const group = getDdrSkewGroups(source)[0]
  const lastNet = group.signals.at(-1)!.sections[0][0]
  const measured = measureDdrSkew(source, ([net]) => net === lastNet ? 5 : 2)[group.name]
  expect(measured.minLengthMm).toBe(4)
  expect(measured.maxLengthMm).toBe(7)
  expect(measured.skewMm).toBe(3)
  const partial = measureDdrSkew(source, ([net]) => net === lastNet ? null : 2)[group.name]
  expect(partial.skewMm).toBeNull()
  expect(partial.minLengthMm).toBeNull()
  expect(Object.values(partial.lengthsMm).filter((length) => length === null)).toHaveLength(1)
})

test("reports compare complete groups in narrow tables and accept older optional fields", () => {
  const assessment = { requestedNets: 2, connectedNets: 2, unconnectedNets: [], pcbTraces: 2, vias: 0, wireLengthMm: 10, findings: {}, geometryErrors: [], validationMs: 1 }
  const base: BenchmarkResult = { schemaVersion: 1, coreCommit: "base", benchmarkRevision: "same", assessmentRevision: "same", fixtureHashes: {}, bunVersion: "1", platform: "test", cpu: "test", dependencies: {}, timeoutSeconds: 120, geometryOnly: false,
    cases: [{ circuit: "h3", title: "H3", status: "passed", wallMs: 1, peakRssMb: 1, progress: null, assessment: { ...assessment, ddrSkew: { byte: { lengthsMm: { a: 10, b: 12 }, minLengthMm: 10, maxLengthMm: 12, skewMm: 2 } } } }] }
  const head = structuredClone(base)
  head.cases[0].assessment!.ddrSkew!.byte = { lengthsMm: { a: 10, b: 11 }, minLengthMm: 10, maxLengthMm: 11, skewMm: 1 }
  expect(formatReport(head, base)).toContain("| h3 | byte | n/a | 2.000 | 1.000 | -1.000 | n/a |")
  head.cases[0].assessment!.ddrSkew!.byte.referenceSkewMm = 0.1
  head.cases[0].assessment!.ddrSkew!.byte.matchingStatus = "regressed"
  expect(formatReport(head)).toContain("| h3 | byte | 0.100 | 1.000 | Regressed |")
  head.cases[0].assessment!.ddrSkew!.byte.referenceSkewMm = 0
  expect(formatReport(head)).toContain("| h3 | byte | 0.000 | 1.000 | Regressed |")
  head.cases[0].assessment!.ddrSkew!.byte = { lengthsMm: { a: 10, b: null }, minLengthMm: null, maxLengthMm: null, skewMm: null }
  const partial = formatReport(head, base)
  expect(partial).toContain("Mean and worst use 0 matched complete groups")
  expect(partial).toContain("| h3 | byte | n/a | 2.000 | n/a | n/a | n/a |")
  head.cases[0].assessment = null
  expect(formatReport(head, base)).toContain("| h3 | byte | n/a | 2.000 | n/a | n/a | n/a |")
  expect(formatReport(head, base)).toContain("| h3 | DU1 byte0 | n/a | n/a | n/a | n/a | n/a |")
  delete base.cases[0].assessment!.ddrSkew
  expect(() => formatReport(head, base)).not.toThrow()
})

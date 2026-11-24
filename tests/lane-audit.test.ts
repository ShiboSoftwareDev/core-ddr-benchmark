import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import manifest from "../manifest.json"
import { auditDdrLanes } from "../scripts/lane-audit"
import { getDdrReference, getDdrRoutingBuses } from "../circuits/ddr-constraints"
import { getDdrSkewGroups, measureDdrSkew } from "../scripts/ddr-skew"

const fixtures = manifest.circuits.map((c) => JSON.parse(gunzipSync(readFileSync(`${import.meta.dir}/../${c.file}`)).toString()))

test("all physical groups have an explicit applicability decision and complete necessary signal coverage", () => {
  const audits = fixtures.map(auditDdrLanes)
  const lanes = audits.flatMap((audit) => audit.lanes)
  expect(lanes).toHaveLength(78)
  expect(lanes.flatMap((lane) => lane.uncoveredSignals)).toEqual([])
  expect(lanes.filter((lane) => lane.decision === "no_independent_pair_limit")).toHaveLength(6)
  expect(audits.flatMap((audit) => audit.relationships)).toHaveLength(26)
  const excluded = audits.flatMap((audit) => audit.excludedSignals)
  expect(excluded).toHaveLength(12)
  expect(excluded.every((signal) => /RST|RESET|DRAM_CSB/i.test(signal.signal))).toBe(true)
  expect(excluded.filter((signal) => signal.originalChecks.length)).toHaveLength(1)
})

test("controller-specific cross-byte requirements are retained only where their reference calls for them", () => {
  for (const id of ["a13", "a64", "h616", "glider"]) {
    const constraints = getDdrReference(id).constraints!
    expect(constraints.filter((rule) => /DQS to CK|inter-byte DQS/.test(rule.name))).toEqual([])
  }
  for (const id of ["h3", "icepi"]) expect(getDdrReference(id).constraints!.find((rule) => rule.name.includes("DQS to CK"))!.maxLengthSkew).toBe(20.32)
  for (const id of ["orangecrab", "butterstick"]) expect(getDdrReference(id).constraints!.filter((rule) => rule.name.includes("inter-byte DQS")).every((rule) => rule.maxLengthSkew === 2.54)).toBe(true)
  expect(getDdrReference("glider").constraints!.every((rule) => rule.nets.length === 2)).toBe(true)
  expect(fixtures.flatMap((source) => getDdrReference(source.id).constraints!).filter((rule) => rule.basis === "engineering_target")).toEqual([])
})

test("ST's P/N signals never receive independent planar length or skew tuner targets", () => {
  const source = fixtures.find((source) => source.id === "stmp157")
  const buses = getDdrRoutingBuses(source)
  const pairs = getDdrSkewGroups(source).filter((group) => group.signals.length === 2)
  for (const pair of pairs) for (const signal of pair.signals) for (const section of signal.sections) {
    for (const bus of buses.filter((bus) => bus.connections.includes(section[1]))) {
      expect(bus.minLength).toBeUndefined()
      expect(bus.maxLength).toBeUndefined()
      expect(bus.maxLengthSkew).toBeUndefined()
    }
  }
  const measured = measureDdrSkew(source, () => 10)
  expect(pairs.every((pair) => measured[pair.name].preservationComparisonOnly)).toBe(true)
})

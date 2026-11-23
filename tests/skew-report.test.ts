import { expect, test } from "bun:test"
import { formatReport } from "../scripts/report"
import { assertSkewPreserved } from "../scripts/skew-report"
import { getSkewGroups, measureSkewGroups } from "../scripts/skew"
import type { BenchmarkResult } from "../scripts/types"

test("length matching reports and gates expose individual regressions and missing coverage", () => {
  const skewGroups = measureSkewGroups(getSkewGroups("h3"), () => 10)
  const base: BenchmarkResult = {
    schemaVersion: 1, coreCommit: "base", benchmarkRevision: "runner", assessmentRevision: "runner",
    fixtureHashes: { h3: "hash" }, bunVersion: "1", platform: "linux", cpu: "cpu", dependencies: {}, timeoutSeconds: 120, geometryOnly: false,
    cases: [{ circuit: "h3", title: "H3", status: "passed", wallMs: 1, peakRssMb: 1,
      progress: { renderCompleted: true, renderMs: 1, phases: [], errors: [], solverEvents: [] },
      assessment: { connectedNets: 53, requestedNets: 53, unconnectedNets: [], pcbTraces: 53, vias: 0, wireLengthMm: 530, findings: {}, geometryErrors: [], validationMs: 1, skewGroups },
    }],
  }
  expect(() => assertSkewPreserved(base, base)).not.toThrow()
  const head = structuredClone(base)
  head.cases[0].assessment!.skewGroups![0].skewMm = 0.25
  const report = formatReport(head, base)
  expect(report).toContain("**1 regressed**")
  expect(report).toContain("0.250000 | Regressed")
  expect(report).toContain("Data byte (2 matched groups)")
  expect(() => assertSkewPreserved(head, base)).toThrow("Regressed")
  head.cases[0].assessment!.skewGroups![0].skewMm = null
  expect(formatReport(head, base)).toContain("**1 lost coverage**")
  expect(() => assertSkewPreserved(head, base)).toThrow("Lost coverage")
  const legacy = structuredClone(base)
  delete legacy.cases[0].assessment!.skewGroups
  expect(formatReport(legacy)).toContain("Length matching unavailable")
  expect(() => assertSkewPreserved(legacy, base)).toThrow("Lost coverage")
  expect(() => assertSkewPreserved(legacy, legacy)).toThrow("Unavailable")
  expect(() => assertSkewPreserved(base, legacy)).toThrow("Unavailable")
  expect(() => assertSkewPreserved({ ...base, geometryOnly: true }, base)).toThrow("requires routed")
})

import { expect, test } from "bun:test"
import { formatReport } from "../scripts/report"
import { getSkewGroups, measureSkewGroups } from "../scripts/skew"
import { getSourceSkewAudit } from "../scripts/source-skew"
import type { BenchmarkResult } from "../scripts/types"

test("length matching reports tolerate optional fields and expose regressions and missing coverage", () => {
  const skewGroups = measureSkewGroups(getSkewGroups("h3"), () => 10)
  const base: BenchmarkResult = {
    schemaVersion: 2, sourceSkew: { h3: getSourceSkewAudit("h3") }, coreCommit: "base", benchmarkRevision: "runner", assessmentRevision: "runner",
    fixtureHashes: { h3: "hash" }, bunVersion: "1", platform: "linux", cpu: "cpu", dependencies: {}, timeoutSeconds: 120, geometryOnly: false,
    cases: [{ circuit: "h3", title: "H3", status: "passed", wallMs: 1, peakRssMb: 1,
      progress: { renderCompleted: true, renderMs: 1, phases: [], errors: [], solverEvents: [] },
      assessment: { connectedNets: 53, requestedNets: 53, unconnectedNets: [], pcbTraces: 53, vias: 0, wireLengthMm: 530, findings: {}, geometryErrors: [], validationMs: 1, skewGroups },
    }],
  }
  const head = structuredClone(base)
  head.cases[0].assessment!.skewGroups![0].skewMm = 0.25
  const report = formatReport(head, base)
  expect(report).toContain("**1 regressed**")
  expect(report).toContain("0.250000 | Regressed")
  expect(report).toContain("Data byte (2 matched groups)")
  head.cases[0].assessment!.skewGroups![0].skewMm = null
  expect(formatReport(head, base)).toContain("**1 lost coverage**")
  const legacy = JSON.parse(JSON.stringify(base))
  delete legacy.cases[0].assessment!.skewGroups
  expect(formatReport(legacy)).toContain("Length matching: 0/6 groups")
  expect(formatReport(base, legacy)).toContain("New coverage")
  delete legacy.sourceSkew
  legacy.schemaVersion = 1
  expect(formatReport(legacy)).toContain("Source length/skew options unavailable")
  expect(() => formatReport({ ...base, sourceSkew: {} })).not.toThrow()
  const missingGroup = structuredClone(base)
  missingGroup.cases[0].assessment!.skewGroups!.pop()
  expect(formatReport(missingGroup)).toContain("Length matching: 5/6 groups")
  const crashed = structuredClone(base)
  crashed.cases[0].assessment = null
  crashed.cases[0].status = "crashed"
  expect(formatReport(crashed)).toContain("Length matching: 0/6 groups")
  expect(formatReport(crashed)).toContain("DU1 byte0 | 0/11 | n/a | n/a")
  expect(formatReport(base)).toContain("Source length/skew constraint audit")
})

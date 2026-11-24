import { expect, test } from "bun:test"
import { formatReport } from "../scripts/report"
import { skewCheckCounts } from "../scripts/report-skew"
import type { DdrConstraintResult } from "../circuits/ddr-constraints"
import type { BenchmarkResult } from "../scripts/types"

test("skew summary excludes length-only and comparison checks and keeps tables narrow", () => {
  const rule: DdrConstraintResult = {
    name: "U2 byte0 DQ/DM to DQS (Allwinner)", nets: ["DQ", "DQS"], sourcePath: "board.kicad_pcb",
    maxLengthSkew: 1.27, lengthsMm: { DQ: 10, DQS: 10.5 }, actualMinMm: 10, actualMaxMm: 10.5,
    actualSkewMm: 0.5, marginMm: 0.77, status: "met",
  }
  const run: BenchmarkResult = {
    schemaVersion: 1, coreCommit: "core", benchmarkRevision: "same", assessmentRevision: "same", fixtureHashes: {},
    bunVersion: "1", platform: "test", cpu: "test", dependencies: {}, timeoutSeconds: 120, geometryOnly: false,
    cases: [{ circuit: "h3", title: "H3", status: "failed", wallMs: 100, peakRssMb: 1, progress: null,
      assessment: { requestedNets: 2, connectedNets: 1, unconnectedNets: ["DQ"], pcbTraces: 1, vias: 0, wireLengthMm: 10, findings: {}, geometryErrors: [], validationMs: 1,
        ddrConstraints: [rule,
          { ...rule, name: "Comparison", severity: "warning", status: "exceeded" },
          { ...rule, name: "Saved length", maxLengthSkew: undefined, maxLength: 20 },
          { ...rule, name: "Unrouted skew", actualSkewMm: null, status: "incomplete" }],
      } }],
  }
  expect(skewCheckCounts(run)).toEqual({ passed: 1, failed: 0, incomplete: 1, uncertain: 0 })
  const report = formatReport(run, run)
  expect(report).toContain("| Core DDR | Skew checks passed | 1 | 1 | 0 |")
  expect(report).toContain("| h3 | U2 byte0 DQ/DM to DQS | ≤1.270 mm | 0.500 | 0.500 | +0.000 | Pass |")
  expect(report).toContain("Info: Fail")
  expect(report).toContain("| Circuit | Check | Target | Base | PR | Delta | Status |")
  expect(report).not.toContain("Applied selector:")
  for (const line of report.split("\n").filter((line) => line.startsWith("|"))) expect(line.split("|").length - 2).toBeLessThanOrEqual(7)
  delete run.cases[0].assessment!.ddrConstraints
  expect(skewCheckCounts(run)).toBeNull()
})

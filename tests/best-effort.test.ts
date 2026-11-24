import { expect, test } from "bun:test"
import { formatReport } from "../scripts/report"
import { isRoutingPass, preferRoute } from "../scripts/route-quality"
import type { BenchmarkResult, CaseResult } from "../scripts/types"

function completed(skew: number): CaseResult {
  return {
    circuit: "h3", title: "H3", status: "passed", wallMs: 1000, peakRssMb: 100,
    progress: { renderCompleted: true, renderMs: 1000, phases: [], errors: [], solverEvents: [] },
    assessment: {
      requestedNets: 2, connectedNets: 2, unconnectedNets: [], pcbTraces: 2, vias: 0, wireLengthMm: 20,
      geometryErrors: [], validationMs: 1, findings: { trace_overlap: 0, ddr_constraints: 1 },
      ddrConstraints: [{ name: "Byte matching", nets: ["D0", "D1"], sourcePath: "test", maxLengthSkew: 0.1,
        lengthsMm: { D0: 10, D1: 10 + skew }, actualMinMm: 10, actualMaxMm: 10 + skew,
        actualSkewMm: skew, marginMm: 0.1 - skew, status: "exceeded" }],
    },
  }
}

test("an unsuccessful matching attempt cannot discard complete clean copper", () => {
  const retained = completed(0.8)
  const partial = completed(0.2)
  partial.status = "failed"
  partial.assessment!.connectedNets = 1
  partial.progress!.errors = ["Length tuning failed"]
  expect(isRoutingPass(retained)).toBe(true)
  expect(preferRoute(partial, retained)).toBe(false)
  partial.status = "timeout"
  expect(preferRoute(partial, retained)).toBe(false)

  const improved = completed(0.2)
  expect(preferRoute(improved, retained)).toBe(true)
  expect(preferRoute(retained, improved)).toBe(false)
  improved.assessment!.findings.trace_overlap = 1
  expect(preferRoute(improved, retained)).toBe(false)
})

test("a complete route passes physical checks while a missed skew target stays visible", () => {
  const report: BenchmarkResult = {
    schemaVersion: 1, coreCommit: "core", benchmarkRevision: "benchmark", assessmentRevision: "benchmark",
    fixtureHashes: { h3: "hash" }, bunVersion: "test", platform: "test", cpu: "test", dependencies: {},
    timeoutSeconds: 120, geometryOnly: false, cases: [completed(0.2)],
  }
  const text = formatReport(report)
  expect(text).toContain("| Core DDR | Completion | 100.0% (1/1) |")
  expect(text).toContain("| Core DDR | DRC pass | 100.0% (1/1) |")
  expect(text).toContain("| Core DDR | Skew checks failed | 1 |")
  expect(text).toContain("| h3 | Byte matching | ≤0.100 mm | 0.200 | Fail |")
  report.cases[0].assessment!.findings.trace_overlap = 1
  expect(isRoutingPass(report.cases[0])).toBe(false)
})

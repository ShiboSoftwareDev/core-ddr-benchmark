import { test, expect } from "bun:test"
import { formatReport } from "../scripts/report"
import type { BenchmarkResult } from "../scripts/types"

test("comparison reports reject unmatched suites and budgets and preserve failed outcomes", () => {
  const run: BenchmarkResult = {
    schemaVersion:1,coreCommit:"core",benchmarkRevision:"fixture-runner",assessmentRevision:"fixture-runner",
    fixtureHashes:{h3:"hash"},bunVersion:"1.4.3",platform:"linux arm64",cpu:"runner",
    dependencies:{"@tscircuit/checks":"1"},timeoutSeconds:120,geometryOnly:false,
    cases:[{ circuit:"h3",title:"H3",status:"timeout",wallMs:120000,peakRssMb:200,progress:null,assessment:null }],
  }
  expect(formatReport(run,run)).toContain("timeout | unavailable")
  expect(() => formatReport(run,{ ...run,timeoutSeconds:60 })).toThrow()
  expect(() => formatReport(run,{ ...run,fixtureHashes:{h3:"changed"} })).toThrow()
  expect(() => formatReport(run,{ ...run,cases:[] })).toThrow()
})

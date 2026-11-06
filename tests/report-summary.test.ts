import { test, expect } from "bun:test"
import type { BenchmarkResult, CaseResult } from "../scripts/types"
import { formatReport } from "../scripts/report"

test("summary uses timeout penalties, measured memory percentiles and matched completed circuits", () => {
  const circuit = (name: string, status: "passed" | "failed" | "timeout", wallMs: number, vias: number, peakRssMb: number): CaseResult => ({
    circuit:name,title:name,status,wallMs,peakRssMb,
    progress:{renderCompleted:status === "passed",renderMs:wallMs,errors:status === "failed" ? ["Routing failed"] : [],solverEvents:[],phases:[{
      phase:"byte0",stage:0,solver:"BusLanesPipelineSolver",status:status === "passed" ? "completed" : status === "failed" ? "failed" : "running",
      startedMs:0,durationMs:status === "timeout" ? null : wallMs,connections:1,cacheStatus:"disabled",
    }]},
    assessment:{requestedNets:1,connectedNets:status === "passed" ? 1 : 0,unconnectedNets:[],pcbTraces:1,vias,wireLengthMm:vias*10,findings:{trace_overlap:0},geometryErrors:[],validationMs:1},
  })
  const base: BenchmarkResult = {
    schemaVersion:1,coreCommit:"base",benchmarkRevision:"runner",assessmentRevision:"runner",fixtureHashes:{a:"a",b:"b",c:"c"},
    bunVersion:"1.4.3",platform:"linux arm64",cpu:"runner",dependencies:{},timeoutSeconds:120,geometryOnly:false,
    cases:[circuit("A","passed",10000,2,100),circuit("B","failed",100,0,200),circuit("C","timeout",120000,0,300)],
  }
  const head: BenchmarkResult = { ...base,coreCommit:"head",cases:[circuit("A","passed",8000,4,100),circuit("B","passed",20000,100,400),circuit("C","timeout",120000,0,500)] }
  const report = formatReport(head,base)
  expect(report).toContain("| Core DDR | Completion | 33.3% (1/3) | 66.7% (2/3) | +33.3 pp |")
  expect(report).toContain("| Core DDR | P50 time | 120.0s | 20.0s | -83.3% |")
  expect(report).toContain("| Core DDR | Memory P80 | 260.0 MiB | 460.0 MiB | +76.9% |")
  expect(report).toContain("| Core DDR | Average vias | 2.00 | 4.00 | +100.0% |")
  expect(report).toContain("Outcome changes: **1 improved**, **0 regressed**.")
  expect(report).toContain("<summary>Base pipeline stage timings</summary>")
  expect(report).toContain("<summary>PR pipeline stage timings</summary>")
  expect(report).toContain("<summary>Changed outcomes (1)</summary>")
  expect(report).toContain("| Core DDR | B | Failed | DRC passed | 100ms | 20.0s | Improved |")
  expect(report.split("<details>")[0]).not.toContain("| A |")
  const local = formatReport(head)
  expect(local).toContain("| Solver | Metric | Local |")
  expect(local).not.toContain("| Delta |")
})

export type PhaseResult = {
  phase: string
  stage: number
  solver: string | null
  status: "running" | "completed" | "failed"
  startedMs: number
  durationMs: number | null
  connections: number
  cacheStatus: string | null
}

export type Progress = {
  renderCompleted: boolean
  renderMs: number | null
  phases: PhaseResult[]
  errors: string[]
  solverEvents: unknown[]
}

export type Assessment = {
  requestedNets: number
  connectedNets: number
  unconnectedNets: string[]
  pcbTraces: number
  vias: number
  wireLengthMm: number
  findings: Record<string, number>
  geometryErrors: string[]
  validationMs: number
}

export type CaseResult = {
  circuit: string
  title: string
  status: "passed" | "failed" | "timeout" | "crashed" | "geometry_only"
  wallMs: number
  peakRssMb: number
  progress: Progress | null
  assessment: Assessment | null
}

export type BenchmarkResult = {
  schemaVersion: 1
  coreCommit: string
  benchmarkRevision: string
  assessmentRevision: string
  fixtureHashes: Record<string, string>
  bunVersion: string
  platform: string
  cpu: string
  dependencies: Record<string, string>
  timeoutSeconds: number
  geometryOnly: boolean
  cases: CaseResult[]
}

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
  skewGroups: SkewGroupResult[]
  findings: Record<string, number>
  geometryErrors: string[]
  validationMs: number
}

export type SkewGroupResult = {
  name: string
  kind: "data_byte" | "differential_pair" | "address_command"
  signals: { name: string; lengthMm: number | null }[]
  minLengthMm: number | null
  maxLengthMm: number | null
  skewMm: number | null
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
  schemaVersion: 2
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
  sourceSkew: Record<string, SourceSkewAudit>
  cases: CaseResult[]
}

export type SourceSkewAudit = {
  repo: string
  commit: string
  files: { path: string; sha256: string }[]
  status: "custom_rules" | "pattern_targets" | "no_numeric_targets"
  useHeightForLengthCalcs: boolean | null
  boardFileVersion: string | null
  generatorVersion: string | null
  ruleSeverities: Record<string, string | null>
  constraints: {
    name: string
    kind: "length" | "skew"
    condition: string
    bounds: { min?: string; opt?: string; max?: string }
    status: "declared" | "invalid_condition"
    sourcePath: string
  }[]
  tuningPatterns: { net: string; sourcePath: string; fields: Record<string, string> }[]
  notes: string[]
}

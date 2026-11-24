import type { Assessment, CaseResult } from "./types"

const timingFindings = new Set(["ddr_constraints", "ddr_matching", "ddr_package_matching", "ddr_delay_matching"])

export function physicalDrcIssues(assessment: Assessment): number {
  return Object.entries(assessment.findings)
    .filter(([name]) => !timingFindings.has(name) && !["missing_traces", "disconnected_ports"].includes(name))
    .reduce((sum, [, count]) => sum + count, 0)
}

export function isCompleted(row: CaseResult): boolean {
  return !["timeout", "crashed", "geometry_only"].includes(row.status) &&
    row.progress?.renderCompleted === true && row.progress.errors.length === 0 &&
    row.progress.phases.every((phase) => phase.status === "completed") &&
    row.assessment !== null && row.assessment.connectedNets === row.assessment.requestedNets
}

export function isRoutingPass(row: CaseResult): boolean {
  return isCompleted(row) && row.assessment!.geometryErrors.length === 0 && physicalDrcIssues(row.assessment!) === 0
}

// Compare target overruns in their own units before summing. A saved board's
// matching target is still measured even when the router cannot enforce it.
function matchingPenalty(assessment: Assessment): number {
  const overrun = (margin: number | null, tolerance: number) => margin === null ? 1 : Math.max(0, -margin) / Math.max(0.000001, tolerance)
  return (assessment.ddrConstraints ?? []).filter((check) => (check.severity ?? "error") === "error")
    .reduce((sum, check) => sum + overrun(check.marginMm, check.maxLengthSkew ?? (check.maxLength ?? 1) - (check.minLength ?? 0)), 0) +
    (assessment.ddrPackageMatching?.constraints ?? []).reduce((sum, check) => sum + overrun(check.marginMinMm, check.maxMm - (check.minMm ?? 0)), 0) +
    (assessment.ddrDelayMatching?.constraints ?? []).reduce((sum, check) => sum + overrun(check.marginMinPs, check.maxSkewPs), 0) +
    Object.values(assessment.ddrSkew ?? {}).filter((group) => !group.preservationComparisonOnly)
      .reduce((sum, group) => sum + overrun(group.referenceDeltaMm == null ? null : -group.referenceDeltaMm, group.referenceSkewMm ?? 1), 0)
}

/** Never replace a complete clean route with a partial or physically invalid
 * matching attempt. Among equally complete routes retain the smaller measured
 * target overrun, then the smaller total group skew. */
export function preferRoute(candidate: CaseResult, retained: CaseResult): boolean {
  const rank = (row: CaseResult) => [
    Number(isRoutingPass(row)), Number(isCompleted(row)), row.assessment?.connectedNets ?? -1,
    -(row.assessment ? physicalDrcIssues(row.assessment) + row.assessment.geometryErrors.length : Infinity),
    -(row.assessment ? matchingPenalty(row.assessment) : Infinity),
    -Object.values(row.assessment?.ddrSkew ?? {}).reduce((sum, group) => sum + (group.skewMm ?? 0), 0),
  ]
  const before = rank(retained), after = rank(candidate)
  const changed = after.findIndex((value, index) => value !== before[index])
  return changed !== -1 && after[changed] > before[changed]
}

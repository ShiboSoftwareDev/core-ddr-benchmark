import groupsByCircuit from "../circuits/skew-groups.json"
import type { BenchmarkResult, SkewGroupResult } from "./types"

/** A section names an existing fixture net and two native pad selectors. */
export type SkewSection = [net: string, from: string, to: string]
export type SkewGroup = {
  name: string
  kind: "data_byte" | "differential_pair" | "address_command"
  signals: Record<string, SkewSection[]>
}

export function getSkewGroups(circuit: string): SkewGroup[] {
  // JSON imports widen tuples and discriminants; fixture tests validate these
  // committed definitions against every native net and endpoint selector.
  const groups = (groupsByCircuit as unknown as Record<string, SkewGroup[]>)[circuit]
  if (!groups) throw new Error(`Missing skew groups for circuit ${circuit}`)
  return groups
}

export function assertSkewBenchmarked(report: BenchmarkResult): void {
  if (report.schemaVersion !== 2 || !report.sourceSkew) throw new Error("Skew benchmarking is required. Reassess older saved results with this benchmark revision.")
  if (!report.cases.length) throw new Error("Skew benchmarking requires at least one circuit")
  for (const row of report.cases) {
    if (!report.sourceSkew[row.circuit]) throw new Error(`Missing source constraint audit for ${row.title}`)
    // A crashed/timed-out render may have no copper to assess. The report still
    // enumerates every configured group as unavailable for that case.
    if (!row.assessment) continue
    const measured = row.assessment.skewGroups
    const expected = getSkewGroups(row.circuit)
    if (!Array.isArray(measured) || measured.length !== expected.length) throw new Error(`Required skew assessment missing or incomplete for ${row.title}; reassess saved copper`)
    for (const group of expected) {
      const result = measured.find((candidate) => candidate.name === group.name)
      if (!result || result.kind !== group.kind || JSON.stringify(result.signals.map((signal) => signal.name).sort()) !== JSON.stringify(Object.keys(group.signals).sort())) throw new Error(`Skew assessment does not match configured signals: ${row.title}, ${group.name}`)
    }
  }
}

export function measureSkewGroups(
  groups: SkewGroup[],
  measureSection: (section: SkewSection) => number | null,
): SkewGroupResult[] {
  return groups.map((group) => {
    const signals = Object.entries(group.signals).map(([name, sections]) => {
      const lengths = sections.map(measureSection)
      return { name, lengthMm: lengths.every((length) => length !== null) ? lengths.reduce<number>((sum, length) => sum + length!, 0) : null }
    })
    const complete = signals.length >= 2 && signals.every((signal) => signal.lengthMm !== null)
    const lengths = signals.map((signal) => signal.lengthMm!)
    const minLengthMm = complete ? Math.min(...lengths) : null
    const maxLengthMm = complete ? Math.max(...lengths) : null
    return { name: group.name, kind: group.kind, signals, minLengthMm, maxLengthMm, skewMm: complete ? maxLengthMm! - minLengthMm! : null }
  })
}

export const skewComparisonToleranceMm = 1e-6

export function compareSkewGroups(head: SkewGroupResult, base?: SkewGroupResult): string {
  if (!base) return "Unavailable"
  if (head.kind !== base.kind || JSON.stringify(head.signals.map((signal) => signal.name).sort()) !== JSON.stringify(base.signals.map((signal) => signal.name).sort())) throw new Error(`Cannot compare different skew group members: ${head.name}`)
  if (head.skewMm === null) return base.skewMm === null ? "Unavailable" : "Lost coverage"
  if (base.skewMm === null) return "New coverage"
  const delta = head.skewMm - base.skewMm
  return delta > skewComparisonToleranceMm ? "Regressed" : delta < -skewComparisonToleranceMm ? "Improved" : "Preserved"
}

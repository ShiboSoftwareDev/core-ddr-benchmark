import groupsByCircuit from "../circuits/skew-groups.json"
import type { SkewGroupResult } from "./types"

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

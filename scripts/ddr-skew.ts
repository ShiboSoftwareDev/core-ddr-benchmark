import { getDdrGroupLimit } from "../circuits/ddr-constraints"
import { getDdrSkewGroups } from "../circuits/ddr-signals"
import references from "../circuits/ddr-skew-reference.json"
export { getDdrSkewGroups, getDdrSkewGroupNames } from "../circuits/ddr-signals"

export type DdrSkew = { lengthsMm: Record<string, number | null>; minLengthMm: number | null; maxLengthMm: number | null; skewMm: number | null; maxSkewMm?: number; limitBasis?: "explicit" | "length_window"; limitOrigin?: "reference" | "engineering_target" | "original_matching"; limitSeverity?: "error" | "warning" | "ignore"; referenceSkewMm?: number; referenceDeltaMm?: number | null; matchingStatus?: "preserved" | "regressed" | "incomplete" | "no_reference"; preservationComparisonOnly?: boolean }

// One nanometre in source data becomes 0.000001 mm when stored. This is only
// measurement rounding tolerance, not an electrical skew allowance.
export const referenceRoundingMm = 0.000001

export function measureDdrSkew(source: Parameters<typeof getDdrSkewGroups>[0], measure: (section: [net: string, from: string, to: string]) => number | null): Record<string, DdrSkew> {
  return Object.fromEntries(getDdrSkewGroups(source).map((group) => {
    const lengthsMm = Object.fromEntries(group.signals.map(({ name, sections }) => {
      const lengths = sections.map(measure)
      return [name, lengths.length && lengths.every((length) => length !== null) ? lengths.reduce<number>((sum, length) => sum + length!, 0) : null]
    }))
    const values = Object.values(lengthsMm)
    const complete = values.length >= 2 && values.every((length) => length !== null)
    const minLengthMm = complete ? Math.min(...values as number[]) : null
    const maxLengthMm = complete ? Math.max(...values as number[]) : null
    const skewMm = complete ? maxLengthMm! - minLengthMm! : null
    const reference = (references as Record<string, { groups: Record<string, { minLengthMm: number | null; maxLengthMm: number | null }> }>)[source.id]?.groups[group.name]
    const referenceSkewMm = reference?.minLengthMm != null && reference.maxLengthMm != null ? reference.maxLengthMm - reference.minLengthMm : undefined
    const referenceDeltaMm = skewMm !== null && referenceSkewMm !== undefined ? skewMm - referenceSkewMm : null
    const matchingStatus = referenceSkewMm === undefined ? "no_reference" : referenceDeltaMm === null ? "incomplete" : referenceDeltaMm > referenceRoundingMm ? "regressed" : "preserved"
    const preservationComparisonOnly = source.id === "stmp157" && group.signals.length === 2
    return [group.name, { lengthsMm, minLengthMm, maxLengthMm, skewMm, ...getDdrGroupLimit(source.id, group.signals), referenceSkewMm, referenceDeltaMm, matchingStatus, ...(preservationComparisonOnly ? { preservationComparisonOnly } : {}) }]
  }))
}

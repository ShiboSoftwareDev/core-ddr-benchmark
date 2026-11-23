import { getDdrGroupLimit } from "../circuits/ddr-constraints"
import { getDdrSkewGroups } from "../circuits/ddr-signals"
export { getDdrSkewGroups, getDdrSkewGroupNames } from "../circuits/ddr-signals"

export type DdrSkew = { lengthsMm: Record<string, number | null>; minLengthMm: number | null; maxLengthMm: number | null; skewMm: number | null; maxSkewMm?: number; limitBasis?: "explicit" | "length_window"; limitSeverity?: "error" | "warning" | "ignore" }

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
    return [group.name, { lengthsMm, minLengthMm, maxLengthMm, skewMm: complete ? maxLengthMm! - minLengthMm! : null, ...getDdrGroupLimit(source.id, group.signals) }]
  }))
}

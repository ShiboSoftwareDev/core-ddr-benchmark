import data from "./ddr-constraints.json"
import { getDdrNetEndpoints } from "./ddr-signals"

type Net = { name: string; nativeNet: string; path: string[]; group: string }
type Source = { id: string; traces: Net[] }
export type DdrConstraint = {
  name: string
  nets: string[]
  sourcePath: string
  sourceUrl?: string
  memoryRef?: string
  sourceCondition?: string
  appliedCondition?: string
  skewComparison?: "lt"
  minLength?: number
  maxLength?: number
  maxLengthSkew?: number
  skewReference?: "mean" | "references" | "signed_pair"
  minSignedSkew?: number
  targetSignedSkew?: number
  maxSignedSkew?: number
  referenceNets?: string[]
  assessmentOnly?: boolean
  severity?: "error" | "warning" | "ignore"
}
export type DdrConstraintResult = DdrConstraint & {
  lengthsMm: Record<string, number | null>
  actualMinMm: number | null
  actualMaxMm: number | null
  actualSkewMm: number | null
  marginMm: number | null
  routerSkippedNets?: string[]
  status: "met" | "exceeded" | "incomplete"
}
type DdrSkewLimit = { maxSkewMm: number; limitBasis: "explicit" | "length_window"; limitSeverity?: DdrConstraint["severity"] }
type Reference = { constraints?: DdrConstraint[]; notes?: string[] }
export const getDdrReference = (circuit: string): Reference => (data as Record<string, Reference>)[circuit] ?? {}

/** Build non-overlapping buses by byte group and source targets. Matched native
 * classes stay together; independent windows can split a byte bus. Limits refer
 * to planar pad-center paths in board-world
 * XY mm (+X right, +Y up, +Z above; right-handed points).
 */
export function getDdrRoutingBuses(source: Source) {
  const constraints = (getDdrReference(source.id).constraints ?? []).filter((constraint) => (constraint.severity ?? "error") === "error" && !constraint.assessmentOnly)
  const buses = new Map<string, { name: string; group: string; connections: string[]; minLength?: number; maxLength?: number; maxLengthSkew?: number }>()
  for (const trace of source.traces) {
    const targets = constraints.filter((constraint) => constraint.nets.includes(trace.nativeNet))
    const skew = targets.find((constraint) => constraint.maxLengthSkew !== undefined)
    if (!targets.length && ["remaining", "preflight"].includes(trace.group)) continue
    // Core's current bus-lanes solver rejects length constraints on branched
    // nets. Keep their requirements in assessment without misrouting a stub
    // as the controller-to-RAM path or aborting the entire byte phase.
    const supportsLength = trace.path.length === 2
    const supportsSkew = skew?.nets.every((net) => source.traces.find((member) => member.nativeNet === net)!.path.length === 2)
    const lower = targets.flatMap((constraint) => !supportsLength || constraint.minLength === undefined ? [] : [constraint.minLength])
    const upper = targets.flatMap((constraint) => !supportsLength || constraint.maxLength === undefined ? [] : [constraint.maxLength])
    const options = {
      minLength: lower.length ? Math.max(...lower) : undefined,
      maxLength: upper.length ? Math.min(...upper) : undefined,
      // A mean-deviation limit M implies range <= 2M. Assessment checks the
      // exact mean condition, so this necessary solver bound cannot mask it.
      maxLengthSkew: !supportsSkew || skew?.maxLengthSkew === undefined ? undefined : skew.maxLengthSkew * (skew.skewReference === "mean" ? 2 : 1),
    }
    const hasOptions = Object.values(options).some((value) => value !== undefined)
    if (!hasOptions && ["remaining", "preflight"].includes(trace.group)) continue
    const key = JSON.stringify([skew?.name ?? trace.group, options])
    const name = skew?.name ?? `DDR_BUS_${trace.group}`
    if (!buses.has(key)) buses.set(key, { name: [...buses.values()].some((bus) => bus.name === name) ? `${name}_${buses.size}` : name, group: trace.group, connections: [], ...options })
    buses.get(key)!.connections.push(hasOptions ? getDdrNetEndpoints(source, trace)[0] : trace.path[0])
  }
  return [...buses.values()]
}

/** Return an explicit pair limit or a range implied by every member's length
 * window. A partial window or a RAM-side resistor section is not a bound on
 * an entire end-to-end byte. Missing limits remain unset.
 */
export function getDdrGroupLimit(circuit: string, signals: { name: string; sections: unknown[] }[]) {
  const constraints = getDdrReference(circuit).constraints ?? []
  const names = signals.map((signal) => signal.name)
  const limits: DdrSkewLimit[] = constraints.filter((constraint) => constraint.maxLengthSkew !== undefined && !constraint.skewReference && constraint.nets.length === names.length && names.every((name) => constraint.nets.includes(name)))
    .map((constraint) => ({ maxSkewMm: constraint.maxLengthSkew!, limitBasis: "explicit" as const, limitSeverity: constraint.severity }))
  // If every member is within M of the same reference conductors, every
  // pair is at most 2M apart. This displayed range is a necessary bound;
  // assessment still checks the stricter reference-net condition itself.
  for (const constraint of constraints) {
    if (constraint.skewReference === "references" && constraint.maxLengthSkew !== undefined && names.every((name) => constraint.nets.includes(name))) {
      limits.push({ maxSkewMm: 2 * constraint.maxLengthSkew, limitBasis: "length_window", limitSeverity: constraint.severity })
    }
  }
  const windows = names.map((name) => constraints.filter((constraint) => constraint.nets.includes(name)))
  if (signals.every((signal) => signal.sections.length === 1) && windows.every((members) => members.some((constraint) => constraint.minLength !== undefined) && members.some((constraint) => constraint.maxLength !== undefined))) {
    const low = Math.min(...windows.map((members) => Math.max(...members.map((constraint) => constraint.minLength ?? -Infinity))))
    const high = Math.max(...windows.map((members) => Math.min(...members.map((constraint) => constraint.maxLength ?? Infinity))))
    const severities = windows.flat().map((constraint) => constraint.severity ?? "error")
    limits.push({ maxSkewMm: high - low, limitBasis: "length_window", limitSeverity: severities.includes("ignore") ? "ignore" : severities.includes("warning") ? "warning" : "error" })
  }
  return limits.sort((a, b) => a.maxSkewMm - b.maxSkewMm)[0]
}

export function measureDdrConstraints(source: Source, measureNet: (trace: Net, memoryRef?: string) => number | null): DdrConstraintResult[] {
  return (getDdrReference(source.id).constraints ?? []).map((constraint) => {
    const lengthsMm = Object.fromEntries(constraint.nets.map((net) => [net, measureNet(source.traces.find((trace) => trace.nativeNet === net)!, constraint.memoryRef)]))
    const lengths = Object.values(lengthsMm)
    const complete = lengths.every((length) => length !== null)
    const measured = lengths.filter((length) => length !== null) as number[]
    const actualMinMm = measured.length ? Math.min(...measured) : null
    const actualMaxMm = measured.length ? Math.max(...measured) : null
    const mean = complete ? (lengths as number[]).reduce((sum, length) => sum + length, 0) / lengths.length : 0
    const actualSkewMm = !complete ? null : constraint.skewReference === "signed_pair" ? lengths[0]! - lengths[1]! : constraint.skewReference === "references"
      ? Math.max(...constraint.nets.filter((net) => !constraint.referenceNets!.includes(net)).flatMap((net) => constraint.referenceNets!.map((reference) => Math.abs(lengthsMm[net]! - lengthsMm[reference]!))))
      : constraint.skewReference === "mean" ? Math.max(...(lengths as number[]).map((length) => Math.abs(length - mean))) : actualMaxMm! - actualMinMm!
    const lengthMargin = !measured.length ? null : Math.min(
      constraint.minLength === undefined ? Infinity : actualMinMm! - constraint.minLength,
      constraint.maxLength === undefined ? Infinity : constraint.maxLength - actualMaxMm!,
    )
    const marginMm = complete ? Math.min(lengthMargin!, constraint.maxLengthSkew === undefined ? Infinity : constraint.maxLengthSkew - actualSkewMm!, constraint.minSignedSkew === undefined ? Infinity : actualSkewMm! - constraint.minSignedSkew, constraint.maxSignedSkew === undefined ? Infinity : constraint.maxSignedSkew - actualSkewMm!)
      : constraint.maxLengthSkew === undefined && lengthMargin !== null && lengthMargin < 0 ? lengthMargin : null
    const routerSkippedNets = constraint.nets.filter((net) => source.traces.find((trace) => trace.nativeNet === net)!.path.length > 2)
    return { ...constraint, lengthsMm, actualMinMm, actualMaxMm, actualSkewMm, marginMm, routerSkippedNets,
      status: marginMm !== null && (marginMm < -1e-7 || constraint.skewComparison === "lt" && marginMm <= 0) ? "exceeded" : !complete ? "incomplete" : "met" }
  })
}

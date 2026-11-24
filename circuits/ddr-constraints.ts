import data from "./ddr-constraints.json"
import { getDdrNetEndpoints, getDdrSkewGroups } from "./ddr-signals"
import originalBoards from "./ddr-skew-reference.json"

type Net = { name: string; nativeNet: string; path: string[]; group: string }
type Source = Omit<Parameters<typeof getDdrSkewGroups>[0], "traces"> & { traces: Net[] }
export type DdrConstraint = {
  name: string
  nets: string[]
  sourcePath: string
  sourceUrl?: string
  sourceSha256?: string
  basis?: "reference" | "engineering_target" | "original_matching"
  derivation?: string
  pathBasis?: "full_signal"
  memoryRef?: string
  memoryRefs?: string[]
  sourceCondition?: string
  appliedCondition?: string
  skewComparison?: "lt"
  minLength?: number
  maxLength?: number
  maxLengthSkew?: number
  skewReference?: "mean" | "references" | "signed_pair" | "memory_endpoints"
  lengthReference?: "shortest"
  minSignedSkew?: number
  targetSignedSkew?: number
  maxSignedSkew?: number
  referenceNets?: string[]
  assessmentOnly?: boolean
  severity?: "error" | "warning" | "ignore"
  sourceSeverity?: "error" | "warning" | "ignore"
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
type DdrSkewLimit = { maxSkewMm: number; limitBasis: "explicit" | "length_window"; limitSeverity?: DdrConstraint["severity"]; limitOrigin?: DdrConstraint["basis"] }
type Reference = { constraints?: DdrConstraint[]; notes?: string[] }
export const getDdrReference = (circuit: string): Reference => (data as Record<string, Reference>)[circuit] ?? {}

/** Build non-overlapping buses by byte group and source targets. Matched native
 * classes stay together; independent windows can split a byte bus. Limits refer
 * to planar pad-center paths in board-world
 * XY mm (+X right, +Y up, +Z above; right-handed points).
 */
export function getDdrRoutingBuses(source: Source) {
  const constraints = (getDdrReference(source.id).constraints ?? []).filter((constraint) => (constraint.severity ?? "error") === "error" && !constraint.assessmentOnly)
  const physicalGroups = getDdrSkewGroups(source)
  const original = (originalBoards as Record<string, { groups: Record<string, { minLengthMm: number | null; maxLengthMm: number | null }> }>)[source.id]?.groups ?? {}
  // Original achieved skew and a common minimum are preservation goals.
  // An original achieved length is never an invented maximum length.
  // Restrict them to single-section point-to-point paths: a full series path
  // cannot be imposed on just one resistor-side section or on a branch stub.
  const preservation = physicalGroups.flatMap((group) => {
    // AN5122 §5.2 forbids intra-pair length equalization. Do not give the
    // independent planar tuner a target for either P/N conductor.
    if (source.id === "stmp157" && group.signals.length === 2) return []
    const signals = source.id === "stmp157" && / byte[01]$/.test(group.name) ? group.signals.slice(0, 9) : group.signals
    const window = original[group.name]
    if (window?.minLengthMm == null || window.maxLengthMm == null || !signals.every((signal) => signal.sections.length === 1)) return []
    // A DQS pair may lengthen together to meet its data. Its own original
    // absolute length is not a requirement. Anchor at the byte's longest
    // original path while retaining the pair's original spread.
    const parent = original[group.name.replace(/ DQS([01])$/, " byte$1")]
    const anchor = parent?.maxLengthMm ?? window.maxLengthMm
    const spread = window.maxLengthMm - window.minLengthMm
    return [{ name: `DDR_original_${group.name.replace(/\W/g, "_")}`, nets: signals.map((signal) => signal.name), minLength: anchor - spread - 0.000001, maxLength: anchor + 0.000001, maxLengthSkew: spread + 0.000001 }]
  }).sort((a, b) => a.nets.length - b.nets.length)
  const physicalByte = new Map<string, string>()
  for (const group of physicalGroups.filter((group) => / byte[01]$/.test(group.name))) {
    if (!group.signals.every((signal) => signal.sections.length === 1)) continue
    const legacyGroup = source.traces.find((trace) => group.signals.some((signal) => signal.sections.some(([net]) => net === trace.name)) && !["remaining", "preflight"].includes(trace.group))?.group
    if (legacyGroup) for (const signal of group.signals) for (const [net] of signal.sections) physicalByte.set(net, legacyGroup)
  }
  const absoluteWindow = (net: string) => {
    const trace = source.traces.find((trace) => trace.nativeNet === net)!
    if (trace.path.length !== 2) return undefined
    const targets = constraints.filter((target) => target.nets.includes(net))
    if (targets.some((target) => target.maxLengthSkew !== undefined && target.nets.length > 2 && target.nets.every((net) => source.traces.find((trace) => trace.nativeNet === net)!.path.length === 2))) return undefined
    const originals = preservation.filter((target) => target.nets.includes(net))
    const sourceMin = Math.max(...targets.map((target) => target.minLength ?? -Infinity))
    const sourceMax = Math.min(...targets.map((target) => target.maxLength ?? Infinity))
    const floor = Math.max(...originals.map((target) => target.maxLength))
    const window = [Math.max(sourceMin, floor <= sourceMax ? floor : -Infinity), sourceMax]
    return window.every(Number.isFinite) ? window : undefined
  }
  const buses = new Map<string, { name: string; group: string; connections: string[]; minLength?: number; maxLength?: number; maxLengthSkew?: number }>()
  for (const trace of source.traces) {
    const targets = constraints.filter((constraint) => constraint.nets.includes(trace.nativeNet))
    const skew = targets.find((constraint) => constraint.maxLengthSkew !== undefined)
    const originals = preservation.filter((target) => target.nets.includes(trace.nativeNet))
    const originalSkew = originals[0]
    // Core's current bus-lanes solver rejects length constraints on branched
    // nets. Keep their requirements in assessment without misrouting a stub
    // as the controller-to-RAM path or aborting the entire byte phase.
    const supportsLength = trace.path.length === 2
    const supportsSkew = skew?.nets.every((net) => source.traces.find((member) => member.nativeNet === net)!.path.length === 2)
    // Keep an original multi-net class intact: different per-byte windows must
    // not split OrangeCrab's literal classes or KiCad's original mean groups.
    const windows = supportsSkew && skew!.nets.length > 2 ? [] : originals
    const lower = targets.flatMap((constraint) => !supportsLength || constraint.minLength === undefined ? [] : [constraint.minLength])
    const upper = targets.flatMap((constraint) => !supportsLength || constraint.maxLength === undefined ? [] : [constraint.maxLength])
    // When both strobes have finite enforced windows, project a vendor's
    // relative DQ/DM requirement into a sufficient absolute routing window.
    // The final assessment still checks the actual DQS/CK paths directly.
    if (supportsLength) for (const relative of getDdrReference(source.id).constraints ?? []) {
      if ((relative.severity ?? "error") !== "error" || relative.skewReference !== "references" || !relative.nets.includes(trace.nativeNet) || relative.referenceNets!.includes(trace.nativeNet)) continue
      const anchors = relative.referenceNets!.map(absoluteWindow)
      if (anchors.some((window) => !window)) continue
      lower.push(Math.max(...anchors.map((window) => window![1] - relative.maxLengthSkew!)))
      upper.push(Math.min(...anchors.map((window) => window![0] + relative.maxLengthSkew!)))
    }
    const minimum = Math.max(...lower), maximum = Math.min(...upper)
    const preserveMin = Math.max(minimum, ...windows.map((window) => window.maxLength))
    const keepMinimum = supportsLength && preserveMin <= maximum
    const sameSkewGroup = originalSkew && skew && originalSkew.nets.length === skew.nets.length && originalSkew.nets.every((net) => skew.nets.includes(net))
    const options = {
      minLength: Number.isFinite(keepMinimum ? preserveMin : minimum) ? keepMinimum ? preserveMin : minimum : undefined,
      maxLength: Number.isFinite(maximum) ? maximum : undefined,
      // A mean-deviation limit M implies range <= 2M. Assessment checks the
      // exact mean condition, so this necessary solver bound cannot mask it.
      maxLengthSkew: supportsSkew ? Math.min(skew!.maxLengthSkew! * (skew!.skewReference === "mean" ? 2 : 1), sameSkewGroup ? originalSkew!.maxLengthSkew : Infinity) : supportsLength ? originalSkew?.maxLengthSkew : undefined,
    }
    const hasOptions = Object.values(options).some((value) => value !== undefined)
    if (!hasOptions && ["remaining", "preflight"].includes(trace.group) && !(source.id === "stmp157" && physicalByte.has(trace.name))) continue
    const group = physicalByte.get(trace.name) ?? trace.group
    const name = (supportsSkew ? skew!.name : undefined) ?? originalSkew?.name ?? `DDR_BUS_${group}`
    const key = JSON.stringify([name, options])
    if (!buses.has(key)) buses.set(key, { name: [...buses.values()].some((bus) => bus.name === name) ? `${name}_${buses.size}` : name, group, connections: [], ...options })
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
    .map((constraint) => ({ maxSkewMm: constraint.maxLengthSkew!, limitBasis: "explicit" as const, limitSeverity: constraint.severity, limitOrigin: constraint.basis ?? "reference" }))
  // If every member is within M of the same reference conductors, every
  // pair is at most 2M apart. This displayed range is a necessary bound;
  // assessment still checks the stricter reference-net condition itself.
  for (const constraint of constraints) {
    if (constraint.skewReference === "references" && constraint.maxLengthSkew !== undefined && names.every((name) => constraint.nets.includes(name))) {
      limits.push({ maxSkewMm: 2 * constraint.maxLengthSkew, limitBasis: "length_window", limitSeverity: constraint.severity, limitOrigin: constraint.basis ?? "reference" })
    }
  }
  // Separate DQ and DM rules can share the same DQS reference. Combine their
  // per-signal windows without claiming the derived range is a vendor limit.
  const relativeGroups = new Map<string, DdrConstraint[]>()
  for (const target of constraints.filter((target) => target.skewReference === "references" && target.maxLengthSkew !== undefined && (target.severity ?? "error") === "error")) {
    const key = [...target.referenceNets!].sort().join("\0")
    relativeGroups.set(key, [...relativeGroups.get(key) ?? [], target])
  }
  for (const targets of relativeGroups.values()) {
    const refs = targets[0].referenceNets!
    const subjects = names.filter((name) => !refs.includes(name))
    if (!subjects.length || !refs.every((name) => names.includes(name))) continue
    const budgets = subjects.map((name) => targets.filter((target) => target.nets.includes(name)))
    if (budgets.some((matches) => !matches.length)) continue
    const cap = Math.max(...budgets.map((matches) => Math.min(...matches.map((target) => target.maxLengthSkew!))))
    limits.push({ maxSkewMm: 2 * cap, limitBasis: "length_window", limitSeverity: "error", limitOrigin: targets.some((target) => target.basis === "engineering_target") ? "engineering_target" : targets.some((target) => target.basis === "original_matching") ? "original_matching" : "reference" })
  }
  const windows = names.map((name) => constraints.filter((constraint) => !constraint.lengthReference && constraint.nets.includes(name)))
  if (signals.every((signal) => signal.sections.length === 1) && windows.every((members) => members.some((constraint) => constraint.minLength !== undefined) && members.some((constraint) => constraint.maxLength !== undefined))) {
    const low = Math.min(...windows.map((members) => Math.max(...members.map((constraint) => constraint.minLength ?? -Infinity))))
    const high = Math.max(...windows.map((members) => Math.min(...members.map((constraint) => constraint.maxLength ?? Infinity))))
    const severities = windows.flat().map((constraint) => constraint.severity ?? "error")
    limits.push({ maxSkewMm: high - low, limitBasis: "length_window", limitSeverity: severities.includes("ignore") ? "ignore" : severities.includes("warning") ? "warning" : "error" })
  }
  return limits.sort((a, b) => a.maxSkewMm - b.maxSkewMm)[0]
}

export function measureDdrConstraints(source: Source, measureNet: (trace: Net, memoryRef?: string) => number | null, measureSection?: (section: [string, string, string]) => number | null): DdrConstraintResult[] {
  const groups = getDdrSkewGroups(source)
  return (getDdrReference(source.id).constraints ?? []).map((constraint) => {
    const measure = (net: string, memory?: string) => {
      const trace = source.traces.find((trace) => trace.nativeNet === net)!
      if (constraint.pathBasis !== "full_signal") return measureNet(trace, memory)
      const signal = groups.filter((group) => !memory || group.name.startsWith(memory + " ")).flatMap((group) => group.signals).find((signal) => signal.name === net)
      if (!signal?.sections.length) return null
      if (!measureSection) return signal.sections.length === 1 ? measureNet(trace, memory) : null
      const lengths = signal.sections.map(measureSection)
      return lengths.some((length) => length === null) ? null : lengths.reduce<number>((sum, length) => sum + length!, 0)
    }
    const lengthsMm = Object.fromEntries(constraint.nets.flatMap((net) => (constraint.memoryRefs ?? [constraint.memoryRef]).map((memory) => [constraint.memoryRefs ? `${memory}:${net}` : net, measure(net, memory)])))
    const lengths = Object.values(lengthsMm)
    const complete = lengths.every((length) => length !== null)
    const reference = constraint.lengthReference && constraint.referenceNets!.every((net) => lengthsMm[net] !== null) ? Math.min(...constraint.referenceNets!.map((net) => lengthsMm[net]!)) : null
    const measured = Object.entries(lengthsMm).filter(([net, length]) => length !== null && (!constraint.lengthReference || !constraint.referenceNets!.includes(net) && reference !== null)).map(([, length]) => length! - (reference ?? 0))
    const actualMinMm = measured.length ? Math.min(...measured) : null
    const actualMaxMm = measured.length ? Math.max(...measured) : null
    const mean = complete ? (lengths as number[]).reduce((sum, length) => sum + length, 0) / lengths.length : 0
    const actualSkewMm = !complete ? null : constraint.skewReference === "memory_endpoints" ? Math.max(...constraint.nets.map((net) => Math.abs(lengthsMm[`${constraint.memoryRefs![0]}:${net}`]! - lengthsMm[`${constraint.memoryRefs![1]}:${net}`]!))) : constraint.skewReference === "signed_pair" ? lengths[0]! - lengths[1]! : constraint.skewReference === "references"
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

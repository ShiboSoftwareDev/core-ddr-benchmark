import { getDdrReference } from "../circuits/ddr-constraints"
import { getDdrSkewGroups } from "../circuits/ddr-signals"
import { measureGliderDelay } from "./glider-delay"
import { measureStm32Matching } from "./stm32-matching"

/** Audit actual RAM-ball groups and full signal sections, not net-name suffixes.
 * Source numeric requirements and original-copper benchmark targets retain
 * distinct origins. No optional input field becomes mandatory here.
 */
export function auditDdrLanes(source: Parameters<typeof getDdrSkewGroups>[0]) {
  const groups = getDdrSkewGroups(source)
  const constraints = getDdrReference(source.id).constraints ?? []
  const packageRules = measureStm32Matching(source, () => null)?.constraints ?? []
  const delayRules = measureGliderDelay(source, () => null)?.constraints ?? []
  const lanes = groups.map((group, index) => {
    const memory = group.name.split(" ")[0]
    const kind = index % 6
    const byte = kind === 0 || kind === 2
    const pair = kind === 1 || kind === 3 || kind === 4
    const refs = byte ? group.signals.slice(9).map((signal) => signal.name)
      : kind === 5 ? groups[index - 1].signals.map((signal) => signal.name) : []
    const subjects = byte ? group.signals.slice(0, 9).map((signal) => signal.name) : group.signals.map((signal) => signal.name)
    const applies = constraints.filter((rule) => (!rule.memoryRef || rule.memoryRef === memory) && rule.nets.some((net) => subjects.includes(net)))
    const active = applies.filter((rule) => (rule.severity ?? "error") === "error")
    const external = source.id === "stmp157" ? packageRules.filter((rule) => rule.name.startsWith(group.name + " "))
      : source.id === "glider" ? delayRules.filter((rule) => rule.name.startsWith(group.name + " ")) : []
    const covered = (net: string) => active.some((rule) => {
      if (!rule.nets.includes(net)) return false
      if (pair) return rule.maxLengthSkew !== undefined && !rule.skewReference && subjects.every((name) => rule.nets.includes(name))
      if (rule.skewReference === "references" || rule.lengthReference) return refs.every((name) => rule.referenceNets?.includes(name))
      return byte && !rule.skewReference && rule.maxLengthSkew !== undefined && group.signals.every((signal) => rule.nets.includes(signal.name))
    })
    const coupledStPair = source.id === "stmp157" && pair
    return {
      group: group.name,
      signals: group.signals.map((signal) => signal.name),
      requirement: coupledStPair ? "Coupled P/N routing; use mean pair length; no independent P/N tuning"
        : byte ? "DQ and DM to their own byte's DQS" : pair ? "Differential P/N matching" : "Address/control to associated CK",
      decision: coupledStPair ? "no_independent_pair_limit" : "matching_required",
      checks: [...applies.map((rule) => ({ name: rule.name, basis: rule.basis ?? "reference", severity: rule.severity ?? "error", maxSkew: rule.maxLengthSkew, minLength: rule.minLength, maxLength: rule.maxLength, unit: "mm" })),
        ...external.map((rule) => "maxSkewPs" in rule
          ? { name: rule.name, basis: "reference", severity: "error", maxSkew: rule.maxSkewPs, unit: "ps" }
          : { name: rule.name, basis: "reference", severity: "error", minLength: rule.minMm, maxLength: rule.maxMm, unit: "mm (package + PCB)" })],
      uncoveredSignals: external.length || coupledStPair ? [] : subjects.filter((net) => !covered(net)),
    }
  })
  const relationships = groups.filter((_, index) => index % 6 === 0).flatMap((group) => {
    const memory = group.name.split(" ")[0]
    let strobes = "No additional cross-byte equalization target; bytes retain their independent matching goals."
    let clock = "No separate DQS-to-CK cap added: the reference does not publish one."
    if (["h3", "icepi"].includes(source.id)) clock = "Apply the H3 reference's DQS-to-CK 20.32 mm limit."
    if (["orangecrab", "butterstick"].includes(source.id)) strobes = "Apply ECP5 §9.9 inter-byte DQS matching, 2.54 mm."
    if (source.id === "stmp157") {
      strobes = "Do not equalize all bytes across the fly-by chain; retain AN5122's 33.02 mm inter-memory allowance."
      clock = "Apply AN5122's signed mean-DQS minus mean-CK window [-14.986, 0] mm, including package and via lengths."
    }
    if (source.id === "glider") {
      strobes = "Not required by WP479 p11; removed the older UG388 cross-byte limit."
      clock = "Not required for DDR3 by WP479 p3; removed the older UG388 DQS-to-CK limit."
    }
    if (source.id === "imx6") clock = "NXP byte-group strategy: each byte, including DQS, must not exceed shortest CK; no symmetric DQS-to-CK cap."
    return [{ memory, relationship: "Between byte strobes", decision: strobes }, { memory, relationship: "DQS to clock", decision: clock }]
  })
  const measuredNets = new Set(groups.flatMap((group) => group.signals.flatMap((signal) => signal.sections.map(([net]) => net))))
  const excludedSignals = source.traces.filter((trace) => !measuredNets.has(trace.name)).map((trace) => ({
    signal: trace.nativeNet,
    decision: source.id === "glider" && trace.nativeNet.endsWith("DRAM_CSB")
      ? "Static CS# pull-down through R101 to GND; no controller-clocked path or skew limit"
      : "Asynchronous RESET: no new lane-skew limit; retain only any explicit original-project rule",
    originalChecks: constraints.filter((rule) => rule.nets.includes(trace.nativeNet)).map((rule) => rule.name),
  }))
  return { lanes, relationships, excludedSignals }
}

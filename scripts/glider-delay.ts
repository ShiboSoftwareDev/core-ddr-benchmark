import references from "../circuits/ddr-constraints.json"
import { getDdrSkewGroups } from "../circuits/ddr-signals"

const model = references.glider.delayModel
export const gliderDelayModel = model

/** First-order TI AN905 delay in ps per board-world mm. Top/bottom are
 * microstrip; inner copper is stripline. These approximations exclude coupled
 * meanders, soldermask, via loading and material/process variation. */
export const gliderWireDelayPsPerMm = (layer: string) => 3.336 * Math.sqrt(
  layer.startsWith("inner") ? model.epsilonR : 0.475 * model.epsilonR + 0.67,
)

/** Physical via flight time only. Scalar depth below top copper, mm, in the
 * source board's right-handed world (+X right, +Y up, +Z above). */
export function gliderViaDelayPs(from: string, to: string): number {
  const depths = model.layerDepthMm as Record<string, number>
  return Math.abs(depths[from] - depths[to]) * 3.336 * Math.sqrt(model.epsilonR)
}

export type DelayConstraintResult = {
  name: string
  maxSkewPs: number
  pcbSkewPs: number | null
  actualMinPs: number | null
  actualMaxPs: number | null
  marginMinPs: number | null
  marginMaxPs: number | null
  status: "met" | "exceeded" | "indeterminate" | "incomplete"
}

/** WP479 endpoint matching. DS162 bounds the difference between any two FPGA
 * package paths by 71 ps for the MIG-selected LX16-FTG256. It supplies no sign
 * or per-ball value: never substitute zero package skew or count uncertainty
 * as a pass. The resulting intervals are conditional on the PCB delay model,
 * not rigorous SI bounds. Preferred TL/stub segment matching is not assessed.
 */
export function measureGliderDelay(source: Parameters<typeof getDdrSkewGroups>[0], measure: (section: [string, string, string]) => number | null) {
  if (source.id !== "glider") return undefined
  const groups = getDdrSkewGroups(source)
  const pcbDelayPs: Record<string, number | null> = {}
  for (const group of groups) for (const signal of group.signals) {
    const sections = signal.sections.map(measure)
    pcbDelayPs[signal.name] = !sections.length || sections.some((length) => length === null)
      ? null : sections.reduce<number>((sum, length) => sum + length!, 0)
  }
  const constraints: DelayConstraintResult[] = []
  const [byte0, dqs0, byte1, dqs1, clock, address] = groups
  for (const [group, reference, maxSkewPs, pair] of [[byte0, dqs0, 5, false], [byte1, dqs1, 5, false], [address, clock, 25, false], [dqs0, dqs0, 2, true], [dqs1, dqs1, 2, true]] as const) {
    const subjects = pair ? group.signals.slice(0, 1) : group.signals.filter((signal) => !reference.signals.some((ref) => ref.name === signal.name))
    const references = pair ? reference.signals.slice(1) : reference.signals
    const differences = subjects.flatMap((signal) => references.map((ref) => {
      const a = pcbDelayPs[signal.name], b = pcbDelayPs[ref.name]
      return a === null || b === null ? null : a - b
    }))
    const name = pair ? `${group.name} P/N pair (WP479)` : `${group.name} to ${reference.name} (WP479 endpoint)`
    if (differences.some((delay) => delay === null)) {
      constraints.push({ name, maxSkewPs, pcbSkewPs: null, actualMinPs: null, actualMaxPs: null, marginMinPs: null, marginMaxPs: null, status: "incomplete" })
      continue
    }
    const measured = differences as number[]
    const pcbSkewPs = Math.max(...measured.map(Math.abs))
    const actualMinPs = Math.min(...measured) - model.packageSkewPs
    const actualMaxPs = Math.max(...measured) + model.packageSkewPs
    const marginMinPs = maxSkewPs - Math.max(Math.abs(actualMinPs), Math.abs(actualMaxPs))
    const marginMaxPs = maxSkewPs - Math.max(0, pcbSkewPs - model.packageSkewPs)
    constraints.push({ name, maxSkewPs, pcbSkewPs, actualMinPs, actualMaxPs, marginMinPs, marginMaxPs,
      status: marginMaxPs < -1e-7 ? "exceeded" : marginMinPs >= -1e-7 ? "met" : "indeterminate" })
  }
  return { ...model, pcbDelayPs, constraints }
}

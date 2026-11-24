import model from "../circuits/stm32-package-lengths.json"
import { getDdrSkewGroups } from "../circuits/ddr-signals"

export type LengthBounds = [minMm: number, maxMm: number]
export type PackageConstraintResult = {
  name: string
  minMm: number | null
  maxMm: number
  actualMinMm: number | null
  actualMaxMm: number | null
  marginMinMm: number | null
  marginMaxMm: number | null
  status: "met" | "exceeded" | "indeterminate" | "incomplete"
}

/** Bound via depth using only the source's declared outer-layer planes in mm.
 * Board-world: +X right, +Y up, +Z above. Depth is a nonnegative scalar.
 * The original eight-layer board supplies no inner-layer stackup. Such a
 * transition is bounded by [0, board thickness], never guessed as evenly spaced.
 */
export function stm32ViaDepthBounds(from: string, to: string): LengthBounds {
  if (from === to) return [0, 0]
  const depths = model.layerDepthMm as Record<string, number | undefined>
  if (depths[from] !== undefined && depths[to] !== undefined) {
    const length = Math.abs(depths[from]! - depths[to]!)
    return [length, length]
  }
  return [0, model.boardThicknessMm]
}

export function checkLengthWindow(name: string, lengths: (LengthBounds | null)[], minMm: number | null, maxMm: number): PackageConstraintResult {
  if (!lengths.length || lengths.some((length) => length === null)) return {
    name, minMm, maxMm, actualMinMm: null, actualMaxMm: null, marginMinMm: null, marginMaxMm: null, status: "incomplete",
  }
  const measured = lengths as LengthBounds[]
  const low = minMm ?? -Infinity
  const actualMinMm = Math.min(...measured.map(([min]) => min))
  const actualMaxMm = Math.max(...measured.map(([, max]) => max))
  const marginMinMm = Math.min(actualMinMm - low, maxMm - actualMaxMm)
  const marginMaxMm = Math.min(...measured.map(([min, max]) => {
    const best = low === -Infinity ? min : Math.max(min, Math.min(max, (low + maxMm) / 2))
    return Math.min(best - low, maxMm - best)
  }))
  return { name, minMm, maxMm, actualMinMm, actualMaxMm, marginMinMm, marginMaxMm,
    status: marginMaxMm < -1e-7 ? "exceeded" : marginMinMm >= -1e-7 ? "met" : "indeterminate" }
}

const mean = (lengths: (LengthBounds | null)[]): LengthBounds | null => lengths.some((length) => length === null) ? null : [
  lengths.reduce((sum, length) => sum + length![0], 0) / lengths.length,
  lengths.reduce((sum, length) => sum + length![1], 0) / lengths.length,
]
const subtract = (a: LengthBounds | null, b: LengthBounds | null): LengthBounds | null => a && b ? [a[0] - b[1], a[1] - b[0]] : null

/** AN5122 Rev 3 §§6.1/6.3 and ST's AA workbook. Sum complete copper paths
 * (including series sections and bounded via depth), then add the package
 * length selected by the original controller BALL, not a potentially swapped
 * net label. DQS and CK references are arithmetic means of their P/N lengths.
 */
export function measureStm32Matching(source: Parameters<typeof getDdrSkewGroups>[0], measure: (section: [string, string, string]) => LengthBounds | null) {
  if (source.id !== "stmp157") return undefined
  const lengthsMm: Record<string, LengthBounds | null> = {}
  const pins = model.pins as Record<string, { signal: string; mm: number; cell: string }>
  const cpuPads = source.parts.find((part) => part.name === "U1")!.pads
  const groups = getDdrSkewGroups(source)
  for (const group of groups) for (const signal of group.signals) {
    const memory = group.name.split(" ")[0]
    const key = `${memory}:${signal.name}`
    if (key in lengthsMm) continue
    const sections = signal.sections.map(measure)
    const selector = signal.sections[0]?.[1]
    const pad = cpuPads.find((pad) => `.U1 > .${pad.pin}` === selector)
    const pkg = pad?.nativePin ? pins[pad.nativePin] : undefined
    lengthsMm[key] = !pkg || !sections.length || sections.some((length) => length === null) ? null : [
      pkg.mm + sections.reduce((sum, length) => sum + length![0], 0),
      pkg.mm + sections.reduce((sum, length) => sum + length![1], 0),
    ]
  }
  const constraints: PackageConstraintResult[] = []
  const dataByMemory: (LengthBounds | null)[][] = []
  const controlByMemory: (LengthBounds | null)[][] = []
  for (let offset = 0; offset < groups.length; offset += 6) {
    const [byte0, dqs0, byte1, dqs1, clock, address] = groups.slice(offset, offset + 6)
    const memory = clock.name.split(" ")[0]
    const lengths = (group: typeof clock) => group.signals.map((signal) => lengthsMm[`${memory}:${signal.name}`])
    const ck = mean(lengths(clock))
    for (const [byte, dqs] of [[byte0, dqs0], [byte1, dqs1]]) {
      const strobe = mean(lengths(dqs))
      const data = lengths(byte).slice(0, 9)
      constraints.push(checkLengthWindow(`${byte.name} DQ/DM − mean DQS`, data.map((length) => subtract(length, strobe)), -1.016, 1.016))
      constraints.push(checkLengthWindow(`${dqs.name} mean DQS − mean CK`, [subtract(strobe, ck)], -14.986, 0))
    }
    constraints.push(checkLengthWindow(`${address.name} − mean CK`, lengths(address).map((length) => subtract(length, ck)), -1.016, 0))
    constraints.push(checkLengthWindow(`${clock.name} mean length`, [ck], null, 120))
    dataByMemory.push([...lengths(byte0).slice(0, 9), mean(lengths(dqs0)), ...lengths(byte1).slice(0, 9), mean(lengths(dqs1))])
    controlByMemory.push([...lengths(address), ck])
  }
  if (dataByMemory.length === 2) {
    constraints.push(checkLengthWindow("Inter-memory data length difference", dataByMemory[1].flatMap((a) => dataByMemory[0].map((b) => subtract(a, b))), -33.02, 33.02))
    constraints.push(checkLengthWindow("Inter-memory address/clock length difference", controlByMemory[1].map((a, index) => subtract(a, controlByMemory[0][index])), -33.02, 33.02))
  }
  return { sourceUrl: "https://www.st.com/resource/en/application_note/an5122-stm32mp1-series-ddrmemory-routing-guidelines-stmicroelectronics.pdf#page=24",
    packageSourceUrl: model.mirrorUrl, packageSha256: model.workbookSha256,
    boardThicknessMm: model.boardThicknessMm, lengthsMm, constraints }
}

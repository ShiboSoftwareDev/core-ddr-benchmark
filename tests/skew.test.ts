import { expect, test } from "bun:test"
import { compareSkewGroups, measureSkewGroups, type SkewGroup } from "../scripts/skew"

test("skew sums series copper sections and refuses partial or missing groups", () => {
  const groups: SkewGroup[] = [{ name: "byte0", kind: "data_byte", signals: {
    DQ0: [["cpu0", "cpu", "r1"], ["ram0", "r2", "ram"]],
    DQS: [["strobe", "cpu", "ram"]],
  } }]
  const [base] = measureSkewGroups(groups, ([net]) => ({ cpu0: 3, ram0: 4, strobe: 9 })[net] ?? null)
  expect(base.signals.map((signal) => signal.lengthMm)).toEqual([7, 9])
  expect(base.minLengthMm).toBe(7)
  expect(base.maxLengthMm).toBe(9)
  expect(base.skewMm).toBe(2)
  const [partial] = measureSkewGroups(groups, ([net]) => net === "ram0" ? null : 3)
  expect(partial.signals[0].lengthMm).toBeNull()
  expect(partial.skewMm).toBeNull()
  expect(partial.minLengthMm).toBeNull()
  const [zero] = measureSkewGroups(groups, () => 0)
  expect(zero.skewMm).toBe(0)
  expect(compareSkewGroups(base, zero)).toBe("Regressed")
  expect(compareSkewGroups(zero, base)).toBe("Improved")
  expect(compareSkewGroups(base, base)).toBe("Preserved")
  expect(compareSkewGroups({ ...base, skewMm: base.skewMm! + 0.0000001 }, base)).toBe("Preserved")
  expect(compareSkewGroups(partial, base)).toBe("Lost coverage")
  expect(compareSkewGroups(base, partial)).toBe("New coverage")
  expect(compareSkewGroups(partial, partial)).toBe("Unavailable")
  expect(compareSkewGroups({ ...base, signals: base.signals.slice(1) }, base)).toBe("Unavailable")
})

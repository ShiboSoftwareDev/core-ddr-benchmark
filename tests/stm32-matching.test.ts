import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { checkLengthWindow, measureStm32Matching, stm32ViaDepthBounds } from "../scripts/stm32-matching"

test("ST package offsets reproduce the original workbook's zero-PCB calculations", () => {
  const source = JSON.parse(gunzipSync(readFileSync(`${import.meta.dir}/../circuits/stmp157.json.gz`)).toString())
  const assessed = measureStm32Matching(source, () => [0, 0])!
  expect(assessed.constraints).toHaveLength(14)
  expect(assessed.lengthsMm["U2:/S0SDQ0"]).toEqual([6.69, 6.69])
  // ST workbook Data!G12 is mean(E12:E13) - mean(Address_Command!D24:D25).
  expect(assessed.constraints.find((rule) => rule.name === "U2 DQS0 mean DQS − mean CK")!.actualMinMm).toBeCloseTo(0.725)
  const copper = measureStm32Matching(source, () => [1, 1])!
  // The clock has TWO series copper sections; each data path has one.
  expect(copper.constraints.find((rule) => rule.name === "U2 DQS0 mean DQS − mean CK")!.actualMinMm).toBeCloseTo(-0.275)
  expect(measureStm32Matching(source, () => null)!.constraints.every((rule) => rule.status === "incomplete")).toBe(true)
})

test("unknown inner-layer depths remain bounded and never become an exact pass", () => {
  expect(stm32ViaDepthBounds("top", "bottom")).toEqual([1.68, 1.68])
  expect(stm32ViaDepthBounds("top", "inner2")).toEqual([0, 1.68])
  expect(stm32ViaDepthBounds("inner2", "inner2")).toEqual([0, 0])
  expect(checkLengthWindow("met", [[-0.9, -0.1]], -1.016, 0).status).toBe("met")
  const uncertain = checkLengthWindow("unknown", [[-1.2, -0.1]], -1.016, 0)
  expect(uncertain.status).toBe("indeterminate")
  expect(uncertain.marginMinMm).toBeLessThan(0)
  expect(uncertain.marginMaxMm).toBeGreaterThan(0)
  expect(checkLengthWindow("exceeded", [[-2, -1.2]], -1.016, 0).status).toBe("exceeded")
  expect(checkLengthWindow("missing", [null], -1.016, 0).actualMinMm).toBeNull()
})

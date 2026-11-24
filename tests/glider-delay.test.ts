import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { gliderDelayModel, gliderViaDelayPs, gliderWireDelayPsPerMm, measureGliderDelay } from "../scripts/glider-delay"
import { getDdrSkewGroups } from "../circuits/ddr-signals"

const source = JSON.parse(gunzipSync(readFileSync(`${import.meta.dir}/../circuits/glider.json.gz`)).toString())

test("Glider uses the original stackup and distinguishes layer propagation", () => {
  expect(gliderDelayModel.boardSha256).toBe("aea9094b681b96d6548beff89ca7a6c10484c7a95a29a6819fa34010b17513d3")
  expect(gliderDelayModel.layerDepthMm).toEqual({ top: 0, inner1: 0.1521, inner2: 0.7673, bottom: 0.9194 })
  expect(gliderWireDelayPsPerMm("top")).toBeCloseTo(5.446, 2)
  expect(gliderWireDelayPsPerMm("inner2")).toBeCloseTo(6.837, 2)
  expect(gliderViaDelayPs("top", "bottom")).toBeCloseTo(6.286, 2)
  expect(gliderViaDelayPs("bottom", "inner2")).toBeCloseTo(gliderViaDelayPs("inner2", "bottom"))
})

test("zero PCB mismatch cannot hide package uncertainty or missing paths", () => {
  const equal = measureGliderDelay(source, () => 100)!
  expect(equal.constraints).toHaveLength(5)
  expect(equal.constraints.every((rule) => rule.pcbSkewPs === 0 && rule.status === "indeterminate")).toBe(true)
  expect(equal.constraints[0].actualMinPs).toBe(-71)
  expect(equal.constraints[0].actualMaxPs).toBe(71)
  const dq = getDdrSkewGroups(source)[0].signals[0].sections[0][0]
  const exceeded = measureGliderDelay(source, ([net]) => net === dq ? 177 : 100)!.constraints[0]
  expect(exceeded.status).toBe("exceeded")
  expect(exceeded.marginMaxPs).toBe(-1)
  expect(measureGliderDelay(source, ([net]) => net === dq ? null : 100)!.constraints[0].status).toBe("incomplete")
})

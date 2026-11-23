import { expect, test } from "bun:test"
import { Children, type ReactElement } from "react"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { NativeDdrBoard } from "../circuits/native-ddr-board"
import { getReferenceRoutingOptions, getSharedReferenceLengthOptions } from "../circuits/reference-routing-options"

test("native boards use the reference's optional length windows and scoped pair skew", () => {
  const buses = (circuit: string) => {
    const source = JSON.parse(gunzipSync(readFileSync(`${import.meta.dir}/../circuits/${circuit}.json.gz`)).toString())
    const board = NativeDdrBoard({ source, geometryOnly: true })
    return Children.toArray((board.props as { children: ReactElement[] }).children)
      .filter((element: any) => element.type === "bus")
      .map((element: any) => element.props)
  }
  const imx6 = buses("imx6")
  expect(imx6.find((bus) => bus.name === "DDR_BUS_byte0")).toMatchObject({ minLength: 44, maxLength: 44.5 })
  expect(imx6.find((bus) => bus.name === "DDR_BUS_byte1")).toMatchObject({ minLength: 36.5, maxLength: 37 })
  expect(imx6.find((bus) => bus.name === "DDR_REFERENCE_DDR_046")).toMatchObject({ minLength: 44, maxLength: 44.5 })
  expect(imx6.find((bus) => bus.name === "DDR_REFERENCE_DDR_021")).toMatchObject({ minLength: 45, maxLength: 46 })
  expect(imx6.every((bus) => bus.maxLengthSkew === undefined)).toBe(true)
  const a13 = buses("a13")
  const seriesSection = a13.find((bus) => bus.minLength === 24.74)
  expect(seriesSection).toMatchObject({ minLength: 24.74, maxLength: 24.94 })
  expect(seriesSection.routingPhaseIndex).toBe(a13.find((bus) => bus.name.startsWith("DDR_BUS_ram_byte0")).routingPhaseIndex)
  const icepi = buses("icepi")
  expect(icepi.filter((bus) => bus.maxLengthSkew !== undefined)).toHaveLength(1)
  expect(icepi.find((bus) => bus.maxLengthSkew !== undefined)).toMatchObject({ name: "DDR_REFERENCE_U2 clock", maxLengthSkew: 0.1 })
  for (const circuit of ["a13", "imx6", "icepi"]) {
    const connections = buses(circuit).flatMap((bus) => bus.connections)
    expect(new Set(connections).size).toBe(connections.length)
  }
  for (const circuit of ["h3", "a64", "stmp157", "orangecrab", "butterstick", "glider", "h616"]) {
    expect(buses(circuit).every((bus) => bus.minLength === undefined && bus.maxLength === undefined && bus.maxLengthSkew === undefined)).toBe(true)
  }
  expect(getReferenceRoutingOptions("missing_reference")).toEqual({})
  expect(getSharedReferenceLengthOptions(["present", "absent"], { netOptions: { present: { minLength: 0, maxLength: 5 } } })).toEqual({})
  expect(getSharedReferenceLengthOptions(["present"], { netOptions: { present: { minLength: 0 } } })).toEqual({ minLength: 0 })
})

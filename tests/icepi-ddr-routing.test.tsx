import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { Children, isValidElement, type ReactNode } from "react"
import { IcePiDdrRouting } from "../circuits/icepi-ddr-routing"
import type { DdrSource } from "../circuits/native-ddr-board"
import { getDdrReference } from "../circuits/ddr-constraints"

test("routes 50 named CPU-to-RAM paths, two clock branches and all 18 timing buses together", () => {
  const source: DdrSource = JSON.parse(gunzipSync(readFileSync(new URL("../circuits/icepi.json.gz", import.meta.url))).toString())
  const props = (node: ReactNode) => {
    if (!isValidElement<{children?: ReactNode}>(node)) throw new Error("Expected a routing element")
    return node.props
  }
  const children = Children.toArray(props(IcePiDdrRouting({ source })).children)
  const groups = children.filter(node => isValidElement(node) && typeof node.type === "symbol")
  expect(groups).toHaveLength(50)
  const branchPins: string[] = []
  for (const group of groups) {
    const [net, trace] = Children.toArray(props(group).children)
    if (!isValidElement<{connectsTo:string[]}>(net) || !isValidElement<{path:string[];name:string}>(trace)) throw new Error("Expected a net and its timed trace")
    expect(trace.props.path[0]).toStartWith(".U1 > ")
    expect(trace.props.path[1]).toStartWith(".U2 > ")
    expect(trace.props.path[2]).toStartWith("net.DDR_")
    branchPins.push(...net.props.connectsTo)
  }
  expect(branchPins.sort()).toEqual([".R75 > .pin1", ".R75 > .pin2"])
  const buses = children.filter(node => isValidElement<{name:string}>(node) && node.type === "bus")
  expect(buses).toHaveLength(18)
  const reported = (getDdrReference("icepi").constraints ?? []).map(rule=>rule.name)
  for (const name of reported) expect(buses.some(node=>isValidElement<{name:string}>(node) && node.props.name===name)).toBe(true)
})

import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { getDdrRoutingBuses } from "../circuits/ddr-constraints"
import { getDdrSkewGroups } from "../circuits/ddr-signals"

test("the Glider byte preservation goal reaches every measured signal", (): void => {
  const source = JSON.parse(gunzipSync(readFileSync(
    new URL("../circuits/glider.json.gz", import.meta.url),
  )).toString())
  const byte = getDdrSkewGroups(source).find((group) => group.name === "U12 byte1")!
  const endpoints = byte.signals.map((signal) => signal.sections[0][1])
  const buses = getDdrRoutingBuses(source)
  const wholeByte = buses.find((bus) => endpoints.every((endpoint) => bus.connections.includes(endpoint)))
  expect({
    measuredSignals: endpoints.length,
    signalsInOneRoutingConstraint: wholeByte?.connections.length ?? 0,
  }).toMatchInlineSnapshot(`
    {
      "measuredSignals": 11,
      "signalsInOneRoutingConstraint": 11,
    }
  `)
})

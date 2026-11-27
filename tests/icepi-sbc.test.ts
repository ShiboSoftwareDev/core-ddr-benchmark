import { expect, test } from "bun:test"
import { icePiDdrSource, icePiSbcLayout } from "../circuits/icepi-sbc-source"

test("the full iCE/Pi netlist includes the DDR terminals and the other board nets", () => {
  const { parts, nets, pours } = icePiSbcLayout
  const netByName = new Map(nets.map((net) => [net.name, net]))
  const multiTerminalNets = nets.filter((net) => net.pins.length > 1)

  expect(parts.flatMap((part) => part.pads)).toHaveLength(1428)
  expect(multiTerminalNets).toHaveLength(230)
  expect(pours).toHaveLength(36)
  expect(parts.flatMap((part) => part.noConnect)).toHaveLength(219)
  expect(parts.find((part) => part.name === "U2")?.noConnect).toContain("pin61")
  expect(netByName.has("unconnected-(U2-NC-PadL1)")).toBe(false)
  expect(netByName.get("/GPIO/GPIO17")?.pins).toEqual([".J9 > .pin17"])
  for (const trace of icePiDdrSource.traces) {
    expect(
      netByName.get(trace.nativeNet)?.pins.toSorted(),
      trace.nativeNet,
    ).toEqual(trace.path.toSorted())
  }
  expect(netByName.get("Net-(U22-CLK)")?.pins.toSorted()).toEqual([
    ".R54 > .pin2",
    ".U22 > .pin117",
  ])
})

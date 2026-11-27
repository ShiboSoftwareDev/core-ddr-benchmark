import { writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { IcePiSbcPart } from "../circuits/icepi-sbc-part"
import { icePiSbcLayout } from "../circuits/icepi-sbc-source"

const parts = icePiSbcLayout.parts.filter((part) =>
  ["J11", "R73", "R74"].includes(part.name),
)
const nets = icePiSbcLayout.nets.filter((net) =>
  ["Net-(J11-Pad3)", "Net-(J11-Pad4)"].includes(net.name),
)

export default function IcePiConnectorLands() {
  return (
    <board width="85mm" height="56mm" routeRemaining schematicDisabled>
      {parts.map((part) => <IcePiSbcPart key={part.name} part={part} />)}
      {nets.map((net) => <net key={net.name} name={net.selectorName} connectsTo={net.pins} />)}
    </board>
  )
}

// bun repros/icepi-connector-lands.tsx <directory containing the installed tscircuit SDK>
if (import.meta.main) {
  const [runtime] = process.argv.slice(2)
  if (!runtime) throw new Error("Expected the tscircuit runtime directory")
  const load = createRequire(resolve(runtime, "package.json"))
  const { RootCircuit } = await import(load.resolve("tscircuit"))
  const { convertCircuitJsonToPcbSvg } = await import(load.resolve("circuit-to-svg"))
  const circuit = new RootCircuit()
  circuit.add(<IcePiConnectorLands />)
  await circuit.renderUntilSettled()
  const svg = convertCircuitJsonToPcbSvg(circuit.getCircuitJson(), {
    viewport: { minX: 24.4, maxX: 36, minY: -8.1, maxY: 3 },
    width: 680,
    height: 640,
    backgroundColor: "white",
    includeVersion: false,
  })
  writeFileSync(new URL("./__snapshots__/icepi-connector-lands.snap.svg", import.meta.url), svg)
}

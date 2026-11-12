import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { gunzipSync } from "node:zlib"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { NativeDdrBoard } from "../circuits/native-ddr-board"

const source = JSON.parse(
  gunzipSync(readFileSync(new URL("../circuits/h616.json.gz", import.meta.url))).toString(),
) as Parameters<typeof NativeDdrBoard>[0]["source"]

/** The focused view keeps the native pads and rules, requesting only SCKN. */
export default function H616NativeNetMembership({ focused = false }: { focused?: boolean }) {
  return <NativeDdrBoard source={focused ? {
    ...source,
    title: "H616 SCKN: four unordered native net members",
    traces: source.traces.filter((trace) => trace.nativeNet === "/DRAM/SCKN"),
  } : source} />
}

// bun repros/h616-native-net-membership.tsx <Core/runtime directory> [focused]
if (import.meta.main) {
  const [runtime, mode = "full"] = process.argv.slice(2)
  if (!runtime || !["full", "focused"].includes(mode)) throw new Error("Expected runtime directory and optional focused mode")
  const { RootCircuit } = await import(resolve(runtime, "index.ts"))
  const circuit = new RootCircuit()
  circuit.add(<H616NativeNetMembership focused={mode === "focused"} />)
  await circuit.renderUntilSettled()
  const json = circuit.getCircuitJson()
  const points = json.flatMap((element: any) => element.type === "pcb_trace" ? element.route
    : mode === "full" && ["pcb_smtpad", "pcb_plated_hole"].includes(element.type) ? [element] : [])
  const viewport = points.length ? {
    minX: Math.min(...points.map((point: any) => point.x)) - 1,
    maxX: Math.max(...points.map((point: any) => point.x)) + 1,
    minY: Math.min(...points.map((point: any) => point.y)) - 1,
    maxY: Math.max(...points.map((point: any) => point.y)) + 1,
  } : undefined
  const snapshots = new URL("./__snapshots__/", import.meta.url)
  mkdirSync(snapshots, { recursive: true })
  writeFileSync(new URL(`h616-native-net-${mode}.snap.svg`, snapshots), convertCircuitJsonToPcbSvg(json, {
    width: 1200, height: 1000, backgroundColor: "white", viewport, includeVersion: false,
  }))
}

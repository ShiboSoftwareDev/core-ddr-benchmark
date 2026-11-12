import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
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

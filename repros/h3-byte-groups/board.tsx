import type { ReactElement } from "react"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { NativeDdrBoard } from "../../circuits/native-ddr-board"

const source: Parameters<typeof NativeDdrBoard>[0]["source"] = JSON.parse(
  gunzipSync(readFileSync(new URL("../../circuits/h3.json.gz", import.meta.url)))
    .toString("utf8"),
)
const strobeGroups: Record<string, string> = {
  N042_SDQM0: "byte0",
  N044_SDQS0N: "byte0",
  N045_SDQS0P: "byte0",
  N043_SDQM1: "byte1",
  N046_SDQS1N: "byte1",
  N047_SDQS1P: "byte1",
}
const traces = source.traces.map((trace) => ({
  ...trace,
  group: strobeGroups[trace.name] ?? trace.group,
}))
const byteSource = {
  ...source,
  traces,
  requestedNames: traces
    .filter((trace) => trace.group === "byte0" || trace.group === "byte1")
    .map((trace) => trace.name),
  routeByteGroupsTogether: true,
}

export function H3CompleteBytesBoard(): ReactElement {
  return <NativeDdrBoard source={byteSource} dataOnly />
}

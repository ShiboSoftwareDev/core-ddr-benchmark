import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { NativeDdrBoard } from "./native-ddr-board"

const source = JSON.parse(
  gunzipSync(readFileSync(new URL("./h616.json.gz", import.meta.url))).toString(),
)

/** The complete native H616 board used by the DDR benchmark, unchanged. */
export default function H616DdrBoard() {
  return <NativeDdrBoard source={source} />
}

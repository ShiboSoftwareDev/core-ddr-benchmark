import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import type { ReactElement } from "react"
import { NativeFullBoard, type NativeFullBoardSource } from "./native-full-board"

const source: NativeFullBoardSource = JSON.parse(
  gunzipSync(readFileSync(new URL("./h616.json.gz", import.meta.url))).toString(),
)

export default function H616FullBoard(): ReactElement {
  return <NativeFullBoard source={source} />
}

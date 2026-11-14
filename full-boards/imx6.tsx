import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import type { ReactElement } from "react"
import { NativeFullBoard, type NativeFullBoardSource } from "./native-full-board"
import { createPeripheralLayout } from "./peripheral-layout"

const source: NativeFullBoardSource = JSON.parse(
  gunzipSync(readFileSync(new URL("./imx6.json.gz", import.meta.url))).toString(),
)

export default function Imx6FullBoard(): ReactElement {
  return <NativeFullBoard source={createPeripheralLayout(source)} />
}

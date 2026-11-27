import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import type { DdrSource } from "./native-ddr-board"

type BoardPoint = { x: number; y: number }
type BoardSide = "top" | "bottom"
type PadSize = { width: number; height: number }
type PadPosition = BoardPoint &
  PadSize & {
    ccwRotationDegrees: number
    pin: string | null
    hasPaste: boolean
    hasMaskOpening: boolean
  }
export type IcePiPad = PadPosition &
  (
    | { kind: "paste_only" }
    | { kind: "np_thru_hole"; holeWidth: number }
    | {
        kind: "smd"
        shape: "rect" | "roundrect" | "circle" | "oval"
        roundRadius?: number
      }
    | {
        kind: "thru_hole"
        shape: "rect" | "roundrect" | "circle" | "oval"
        holeWidth: number
        holeHeight: number
        roundRadius?: number
      }
  )

export type IcePiFootprint = BoardPoint & {
  name: string
  allowOffBoard: boolean
  value: string
  footprint: string
  layer: BoardSide
  pads: IcePiPad[]
  pinLabels: Record<string, string[]>
  noConnect: string[]
  courtyards: BoardPoint[][]
}

type IcePiLayout = {
  outline: BoardPoint[]
  parts: IcePiFootprint[]
  nets: { name: string; selectorName: string; pins: string[]; width: number }[]
  pours: {
    selectorName: string
    layer: BoardSide | "inner1" | "inner2"
    outline: BoardPoint[]
    clearance: number
  }[]
  silkscreens: (BoardPoint & PadSize & { layer: BoardSide; svg: string })[]
  rules: {
    min_track_width: number
    min_clearance: number
    min_via_diameter: number
    min_through_hole_diameter: number
    min_copper_edge_clearance: number
    min_hole_clearance: number
    min_hole_to_hole: number
  }
}

function readSource<T>(file: string): T {
  return JSON.parse(gunzipSync(readFileSync(require.resolve(file))).toString())
}

export const icePiSbcLayout = readSource<IcePiLayout>("./icepi-sbc.json.gz")
export const icePiDdrSource = readSource<DdrSource>("./icepi.json.gz")

import type { ReactElement } from "react"
import type { BoardProps, BusProps } from "@tscircuit/props"

type NativePad = {
  name: string
  pin: string | null
  nativePin: string
  kind: "hole" | "plated" | "smd"
  shape: string
  x: number
  y: number
  worldX: number
  worldY: number
  width: number
  height: number
  rotation: number
  layers: string[]
  drillWidth?: number
  drillHeight?: number
  cornerRadius?: number
  points?: { x: number; y: number }[]
}

type NativePart = {
  name: string
  value: string
  x: number
  y: number
  layer: "top" | "bottom"
  pinLabels: Record<string, string[]>
  pads: NativePad[]
}

export type NativeFullBoardSource = {
  id: string
  title: string
  width: number
  height: number
  outline: { x: number; y: number }[]
  layers: BoardProps["layers"]
  signalLayers: BusProps["pcbAllowedLayers"]
  rules: { minTraceWidth: number; appliedGlobalClearance: number; viaPad: number; viaDrill: number }
  parts: NativePart[]
  traces: { name: string; nativeNet: string; path: string[]; width: number; group: string }[]
}

/** Native pad centers are footprint-relative world vectors in mm, X right/Y up.
 * The KiCad world rotation is already included in those vectors. originalLayer
 * preserves the source side; parts therefore have zero additional rotation.
 */
function FullBoardPart({ part }: { part: NativePart }): ReactElement {
  return <chip name={part.name} manufacturerPartNumber={part.value}
    pinLabels={part.pinLabels} pcbX={part.x} pcbY={part.y} layer={part.layer}
    noSchematicRepresentation footprint={
      <footprint originalLayer={part.layer}>
        {part.pads.map((pad) => {
          const place = { name: pad.name, pcbX: pad.x, pcbY: pad.y,
            portHints: pad.pin ? [pad.pin] : [] }
          if (pad.kind === "hole") {
            if (pad.drillWidth === undefined || pad.drillHeight === undefined) throw new Error(`Missing native drill for ${part.name}.${pad.name}`)
            if (pad.drillWidth === pad.drillHeight) return <hole key={pad.name} {...place} shape="circle" diameter={pad.drillWidth} />
            return <hole key={pad.name} {...place} shape="pill"
              width={pad.drillWidth} height={pad.drillHeight}
              pcbRotation={pad.rotation} />
          }
          if (pad.kind === "plated") {
            if (pad.drillWidth === undefined || pad.drillHeight === undefined) throw new Error(`Missing native drill for ${part.name}.${pad.name}`)
            if (pad.shape === "circle") return <platedhole key={pad.name} {...place} shape="circle"
              outerDiameter={pad.width} holeDiameter={pad.drillWidth} />
            if (pad.shape === "oval") return <platedhole key={pad.name} {...place} shape="pill"
              outerWidth={pad.width} outerHeight={pad.height} holeWidth={pad.drillWidth}
              holeHeight={pad.drillHeight} pcbRotation={pad.rotation} />
            if (pad.drillWidth === pad.drillHeight) return <platedhole key={pad.name} {...place}
              shape="circular_hole_with_rect_pad" rectPadWidth={pad.width} rectPadHeight={pad.height}
              holeDiameter={pad.drillWidth} rectBorderRadius={pad.cornerRadius} pcbRotation={pad.rotation} />
            return <platedhole key={pad.name} {...place} shape="pill_hole_with_rect_pad"
              rectPadWidth={pad.width} rectPadHeight={pad.height} holeWidth={pad.drillWidth}
              holeHeight={pad.drillHeight} rectBorderRadius={pad.cornerRadius} pcbRotation={pad.rotation} />
          }
          const layer = pad.layers[0]
          if (layer !== "top" && layer !== "bottom") throw new Error(`Unsupported native SMT layer for ${part.name}.${pad.name}`)
          if (pad.shape === "circle") return <smtpad key={pad.name} {...place} layer={layer} shape="circle" radius={pad.width / 2} />
          if (pad.shape === "custom") {
            if (!pad.points) throw new Error(`Missing native polygon for ${part.name}.${pad.name}`)
            return <smtpad key={pad.name} {...place} layer={layer} shape="polygon" points={pad.points} />
          }
          if (pad.shape === "oval") return <smtpad key={pad.name} {...place} layer={layer} shape="rotated_pill"
            width={pad.width} height={pad.height} radius={Math.min(pad.width, pad.height) / 2} ccwRotation={pad.rotation} />
          return <smtpad key={pad.name} {...place} layer={layer} shape="rotated_rect" width={pad.width}
            height={pad.height} cornerRadius={pad.cornerRadius} ccwRotation={pad.rotation} />
        })}
      </footprint>
    } />
}

/** Native world points in mm, X right/Y up, Z above, right-handed. */
export function NativeFullBoard({ source, geometryOnly = false }: { source: NativeFullBoardSource; geometryOnly?: boolean }): ReactElement {
  const groups = ["byte0", "byte1", "remaining", "other_signals", "power"]
  return <board title={source.title} width={source.width} height={source.height}
    outline={source.outline} layers={source.layers} schematicDisabled
    routingDisabled={geometryOnly} routeRemaining={false} isViaInPadAllowed={false}
    minTraceWidth={source.rules.minTraceWidth}
    minTraceToPadEdgeClearance={source.rules.appliedGlobalClearance}
    minViaEdgeToPadEdgeClearance={source.rules.appliedGlobalClearance}
    minPadEdgeToPadEdgeClearance={source.rules.appliedGlobalClearance}
    minViaPadDiameter={source.rules.viaPad} minViaHoleDiameter={source.rules.viaDrill}
    autorouter={{ local: true, serverCacheEnabled: false }}>
    {source.parts.map((part) => <FullBoardPart key={part.name} part={part} />)}
    {groups.map((group, phaseIndex) => <autoroutingphase key={group} name={group} phaseIndex={phaseIndex}
      autorouter={group.startsWith("byte") ? "bus_lanes" : "auto_local"}
      connections={source.traces.filter((trace) => trace.group === group).flatMap((trace) => trace.path)} />)}
    {source.traces.filter((trace) => trace.path.length > 1).map((trace) => <net key={trace.name} name={trace.name}
      connectsTo={trace.path} nominalTraceWidth={trace.width}
      routingPhaseIndex={groups.includes(trace.group) ? groups.indexOf(trace.group) : undefined} />)}
    {["byte0", "byte1"].map((group, phaseIndex) => <bus key={group} name={`DDR_BUS_${group}`}
      routingPhaseIndex={phaseIndex} pcbAllowedLayers={source.signalLayers}
      connections={source.traces.filter((trace) => trace.group === group).map((trace) => trace.path[0])} />)}
  </board>
}

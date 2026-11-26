import { IcePiDdrRouting } from "./icepi-ddr-routing"
import { IcePiSbcPart } from "./icepi-sbc-part"
import { icePiDdrSource, icePiSbcLayout } from "./icepi-sbc-source"

const ddrNetNames = new Set(
  icePiDdrSource.traces.map((trace) => trace.nativeNet),
)
const { parts, nets, pours, outline, rules, silkscreens } = icePiSbcLayout

/** The complete four-layer CM0 PCB, placed in board-world mm, +X right, +Y up.
 * DDR routes first. Core routes the remaining nets and fills the original power planes.
 */
export function IcePiSbc() {
  return (
    <board
      title="iCE/Pi CM0 SBC"
      layers={4}
      fabricatorPreset="jlcpcb_standard"
      thickness="1.6mm"
      width={85}
      height={56}
      outline={outline}
      minTraceWidth={rules.min_track_width}
      minViaPadDiameter={rules.min_via_diameter}
      minViaHoleDiameter={rules.min_through_hole_diameter}
      minTraceToPadEdgeClearance={rules.min_clearance}
      minViaEdgeToPadEdgeClearance={rules.min_clearance}
      minBoardEdgeClearance={rules.min_copper_edge_clearance}
      minTraceToHoleEdgeClearance={rules.min_hole_clearance}
      minViaHoleEdgeToViaHoleEdgeClearance={rules.min_hole_to_hole}
      minPlatedHoleDrillEdgeToDrillEdgeClearance={rules.min_hole_to_hole}
      routeRemaining
      isViaInPadAllowed={false}
      schematicDisabled
    >
      {parts.map((part) => (
        <IcePiSbcPart key={part.name} part={part} />
      ))}
      <IcePiDdrRouting source={icePiDdrSource} />
      {nets
        .filter((net) => !ddrNetNames.has(net.name))
        .map((net) => (
          <net
            key={net.name}
            name={net.selectorName}
            connectsTo={net.pins}
            nominalTraceWidth={net.width}
            isGroundNet={net.name === "GND" || net.name === "/H3/AGND"}
            isPowerNet={net.name.startsWith("+")}
          />
        ))}
      {pours.map((pour, index) => (
        <copperpour
          key={index}
          layer={pour.layer}
          connectsTo={`net.${pour.selectorName}`}
          outline={pour.outline}
          clearance={pour.clearance}
          boardEdgeMargin={rules.min_copper_edge_clearance}
        />
      ))}
      {silkscreens.map((silkscreen, index) => (
        <silkscreengraphic
          key={index}
          layer={silkscreen.layer}
          pcbX={silkscreen.x}
          pcbY={silkscreen.y}
          width={silkscreen.width}
          height={silkscreen.height}
          imageUrl={`data:image/svg+xml;base64,${silkscreen.svg}`}
        />
      ))}
    </board>
  )
}

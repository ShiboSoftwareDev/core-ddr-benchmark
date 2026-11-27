import type { AutoroutingPhaseProps } from "@tscircuit/props"
import { IcePiSbc } from "./icepi-sbc"
import { icePiSbcLayout } from "./icepi-sbc-source"

const sdD3 = icePiSbcLayout.nets.find((net) => net.name === "/H3/SD_D3")!
const fixedPins = icePiSbcLayout.nets
  .filter((net) => net !== sdD3 && net.pins.length > 1)
  .flatMap((net) => net.pins)

export function IcePiSbcWithUnroutedSdD3({
  restoreFixedCopper,
}: {
  restoreFixedCopper: NonNullable<AutoroutingPhaseProps["algorithmFn"]>
}) {
  return (
    <IcePiSbc
      routingPhases={
        <>
          <autoroutingphase
            name="Fixed copper"
            phaseIndex={0}
            connections={fixedPins}
            algorithmFn={restoreFixedCopper}
          />
          <autoroutingphase
            name="SD D3"
            phaseIndex={1}
            connections={sdD3.pins}
            autorouter="auto_local"
          />
        </>
      }
    />
  )
}

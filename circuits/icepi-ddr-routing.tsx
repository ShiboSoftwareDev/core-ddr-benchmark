import { Fragment } from "react"
import { getDdrNetEndpoints } from "./ddr-signals"
import { getIcePiDdrBuses, getIcePiTraceName } from "./get-icepi-ddr-buses"
import type { DdrSource } from "./native-ddr-board"

/** The two clock nets also reach R75. Select the CPU and RAM pads explicitly
 * so the clock termination remains connected and outside the timed path. */
export function IcePiDdrRouting({ source }: { source: DdrSource }) {
  return <>
    <autoroutingphase name="DDR" phaseIndex={0} autorouter="auto_local"
      connections={source.traces.flatMap((trace) => trace.path)} />
    {source.traces.map((trace) => {
      const terminals = getDdrNetEndpoints(source, trace)
      const branches = trace.path.filter((pin) => !terminals.includes(pin))
      return <Fragment key={trace.name}>
        <net name={trace.name} connectsTo={branches} nominalTraceWidth={trace.width} routingPhaseIndex={0} />
        <trace name={getIcePiTraceName(trace.name)} path={[...terminals, `net.${trace.name}`]} routingPhaseIndex={0} />
      </Fragment>
    })}
    {getIcePiDdrBuses(source).map((bus) => (
      <bus key={bus.name} {...bus} pcbAllowedLayers={source.signalLayers} routingPhaseIndex={0} />
    ))}
  </>
}

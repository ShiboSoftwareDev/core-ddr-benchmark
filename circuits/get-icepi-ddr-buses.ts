import { getDdrReference } from "./ddr-constraints"
import { getDdrSkewGroups } from "./ddr-signals"
import originalBoards from "./ddr-skew-reference.json"
import type { DdrSource } from "./native-ddr-board"

type NativeNet = DdrSource["traces"][number]["nativeNet"]

export function getIcePiTraceName(netName: string) {
  return `${netName}_CPU_RAM`
}

function getTraceNames(nativeNets: NativeNet[], traceNames: Map<NativeNet, string>) {
  return nativeNets.map((net) => {
    const name = traceNames.get(net)
    if (!name) throw new Error(`Unknown iCE/Pi DDR signal ${net}`)
    return name
  })
}

export function getIcePiDdrBuses(source: DdrSource) {
  const traceNames = new Map(source.traces.map((trace) => [trace.nativeNet, getIcePiTraceName(trace.name)]))
  const constraints = (getDdrReference(source.id).constraints ?? []).filter(
    (rule) => (rule.severity ?? "error") === "error" &&
      (!rule.assessmentOnly || rule.skewReference === "references"),
  )
  const originalGroups: Record<string, { minLengthMm: number; maxLengthMm: number }> = originalBoards.icepi.groups
  return [
    ...constraints.map((rule) => ({
      name: rule.name,
      connections: getTraceNames(rule.nets.filter((net) => !rule.referenceNets?.includes(net)), traceNames),
      lengthMatchTo: rule.referenceNets && getTraceNames(rule.referenceNets, traceNames),
      minLength: rule.minLength,
      maxLength: rule.maxLength,
      maxLengthSkew: rule.maxLengthSkew,
    })),
    ...getDdrSkewGroups(source).map((group) => {
      const reference = originalGroups[group.name]
      if (!reference) throw new Error(`Missing iCE/Pi DDR reference lengths for ${group.name}`)
      return {
        name: `Original ${group.name}`,
        connections: getTraceNames(group.signals.map((signal) => signal.name), traceNames),
        maxLengthSkew: reference.maxLengthMm - reference.minLengthMm,
      }
    }),
  ]
}

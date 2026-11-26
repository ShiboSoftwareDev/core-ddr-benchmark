import { IcePiSbcPad } from "./icepi-sbc-pad"
import type { IcePiFootprint } from "./icepi-sbc-source"

export function IcePiSbcPart({ part }: { part: IcePiFootprint }) {
  const footprint = (
    <footprint originalLayer={part.layer}>
      {part.pads.map((pad, padIndex) => (
        <IcePiSbcPad key={padIndex} pad={pad} />
      ))}
      {part.courtyards.map((outline, index) => (
        <courtyardoutline key={index} layer={part.layer} outline={outline} />
      ))}
    </footprint>
  )
  const placement = {
    name: part.name,
    pcbX: part.x,
    pcbY: part.y,
    layer: part.layer,
    footprint,
  }
  if (part.footprint.startsWith("Resistor_SMD:"))
    return <resistor {...placement} resistance={part.value} />
  if (part.footprint.startsWith("Capacitor_SMD:") && /^\d/.test(part.value)) {
    return <capacitor {...placement} capacitance={part.value} />
  }
  if (part.footprint.startsWith("Inductor_SMD:") && /^\d/.test(part.value)) {
    return <inductor {...placement} inductance={part.value} />
  }
  return (
    <chip
      {...placement}
      allowOffBoard={part.allowOffBoard}
      manufacturerPartNumber={part.value}
      pinLabels={part.pinLabels}
      noSchematicRepresentation
    />
  )
}

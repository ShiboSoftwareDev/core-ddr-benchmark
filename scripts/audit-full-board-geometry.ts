import type { AnyCircuitElement } from "circuit-json"
import type { NativeFullBoardSource } from "../full-boards/native-full-board"

/** Expected pad world points include KiCad rotation and reviewed peripheral translations. */
export function auditFullBoardGeometry(
  source: NativeFullBoardSource,
  circuit: AnyCircuitElement[],
): string[] {
  const errors: string[] = []
  for (const part of source.parts) {
    const component = circuit.find((element) => element.type === "source_component" && element.name === part.name)
    if (component?.type !== "source_component") {
      errors.push(`${part.name}: missing native component`)
      continue
    }
    const pcbComponent = circuit.find((element) => element.type === "pcb_component" && element.source_component_id === component.source_component_id)
    if (pcbComponent?.type !== "pcb_component") {
      errors.push(`${part.name}: missing PCB component`)
      continue
    }
    const pads = circuit.filter((element) =>
      (element.type === "pcb_smtpad" || element.type === "pcb_plated_hole" || element.type === "pcb_hole") &&
      element.pcb_component_id === pcbComponent.pcb_component_id)
    for (const pad of part.pads) {
      const matches = pads.some((element) => {
        if (element.type !== "pcb_smtpad" && element.type !== "pcb_plated_hole" && element.type !== "pcb_hole") return false
        if (pad.kind === "smd" && (element.type !== "pcb_smtpad" || element.layer !== pad.layers[0])) return false
        if (pad.shape === "custom") {
          if (!pad.points) throw new Error(`Missing native polygon for ${part.name}.${pad.nativePin}`)
          if (element.type !== "pcb_smtpad" || element.shape !== "polygon") return false
          return element.points.length === pad.points.length && pad.points.every((point) =>
            element.points.some((emitted) => Math.hypot(emitted.x - pad.worldX - point.x, emitted.y - pad.worldY - point.y) < 1e-5))
        }
        if (element.type === "pcb_smtpad" && element.shape === "polygon") return false
        return Math.hypot(element.x - pad.worldX, element.y - pad.worldY) < 1e-5
      })
      if (!matches) errors.push(`${part.name}.${pad.nativePin}: missing or misplaced pad`)
    }
  }
  return errors
}

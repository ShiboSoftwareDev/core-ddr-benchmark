import type * as Props from "@tscircuit/props"
import type { Attributes } from "react"
interface DdrElements {
  board: Props.BoardProps & Attributes
  autoroutingphase: Props.AutoroutingPhaseProps & Attributes
  trace: Props.TraceProps & Attributes
  bus: Props.BusProps & Attributes
  pcbnotetext: Props.PcbNoteTextProps & Attributes
  footprint: Props.FootprintProps & Attributes
  platedhole: Props.PlatedHoleProps & Attributes
  smtpad: Props.SmtPadProps & Attributes
  resistor: Props.ResistorProps & Attributes
  capacitor: Props.CapacitorProps & Attributes
  chip: Props.ChipProps & Attributes
}
declare module "react" { namespace JSX { interface IntrinsicElements extends DdrElements {} } }
declare module "react/jsx-runtime" { namespace JSX { interface IntrinsicElements extends DdrElements {} } }

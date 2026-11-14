import type { NativeFullBoardSource } from "./native-full-board"

type BoardId = "ecp5" | "h616" | "butterstick" | "glider" | "imx6" | "icepi"
type PartName = NativeFullBoardSource["parts"][number]["name"]
type Edge = "left" | "right" | "top" | "bottom"
type PeripheralGroup = { purpose: string; edge: Edge; parts: PartName[] }
type Bounds = { minX: number; maxX: number; minY: number; maxY: number }
type GroupBounds = PeripheralGroup & { bounds: Bounds }
type Position = { x: number; y: number }

/** Explicitly reviewed movable peripherals. Unlisted parts retain native placement.
 * Series terminations, analog references, oscillators, RF, supply feedback and
 * all DDR/main-chip components and capacitors stay fixed.
 */
export const peripheralLayouts: Record<BoardId, PeripheralGroup[]> = {
  ecp5: [
    { purpose: "GPIO header", edge: "top", parts: ["J1"] },
    { purpose: "GPIO header", edge: "bottom", parts: ["J2"] },
    { purpose: "JTAG header", edge: "top", parts: ["J6"] },
    {
      purpose: "RGB indicator and current limiting",
      edge: "left",
      parts: ["D1", "R22", "R23", "R24"],
    },
    {
      purpose: "Charge indicators and current limiting",
      edge: "left",
      parts: ["D2", "R7", "R8"],
    },
    {
      purpose: "User button and static pull-up",
      edge: "right",
      parts: ["SW1", "R4"],
    },
  ],
  h616: [
    { purpose: "Status indicator", edge: "right", parts: ["D1", "R15"] },
    { purpose: "Status indicator", edge: "right", parts: ["D2", "R16"] },
    {
      purpose: "DC rail test points",
      edge: "left",
      parts: ["TP2", "TP3", "TP4", "TP8", "TP10"],
    },
    {
      purpose: "DC rail test points",
      edge: "right",
      parts: ["TP5", "TP6", "TP7", "TP9"],
    },
    {
      purpose: "GPIO test points",
      edge: "right",
      parts: ["TP11", "TP12", "TP13"],
    },
  ],
  butterstick: [
    { purpose: "JTAG header", edge: "left", parts: ["J6"] },
    {
      purpose: "RGB indicators and anode current limiting",
      edge: "top",
      parts: [
        "D1",
        "D2",
        "D3",
        "D4",
        "D5",
        "D6",
        "D7",
        "R35",
        "R36",
        "R38",
        "R39",
        "R41",
        "R42",
        "R44",
      ],
    },
    { purpose: "User buttons", edge: "bottom", parts: ["SW1", "SW2"] },
    {
      purpose: "DC rail test points",
      edge: "bottom",
      parts: ["TP1", "TP5", "TP6", "TP11"],
    },
    { purpose: "DC rail test points", edge: "right", parts: ["TP7"] },
    { purpose: "DC rail test points", edge: "left", parts: ["TP8", "TP9"] },
    { purpose: "DC rail test point", edge: "top", parts: ["TP10"] },
  ],
  glider: [
    { purpose: "User GPIO header", edge: "left", parts: ["J2"] },
    { purpose: "JTAG/SWD header", edge: "top", parts: ["J5"] },
    {
      purpose: "FPGA indicator and current limiting",
      edge: "left",
      parts: ["D8", "R11"],
    },
    {
      purpose: "MCU indicators and current limiting",
      edge: "right",
      parts: ["D19", "D20", "R42", "R43"],
    },
    { purpose: "User buttons", edge: "right", parts: ["SW1", "SW2", "SW3"] },
  ],
  imx6: [
    { purpose: "JTAG header", edge: "left", parts: ["J5"] },
    { purpose: "Power button", edge: "bottom", parts: ["PB1"] },
    { purpose: "Reset button", edge: "left", parts: ["PB2"] },
    {
      purpose: "UART indicators and current limiting",
      edge: "top",
      parts: ["D20", "D21", "R187", "R188"],
    },
    {
      purpose: "Status LED bank and current limiting",
      edge: "bottom",
      parts: [
        "D30",
        "D31",
        "D32",
        "D33",
        "D34",
        "D35",
        "D36",
        "D37",
        "R203",
        "R204",
        "R205",
        "R206",
        "R207",
        "R208",
        "R209",
        "R210",
      ],
    },
    {
      purpose: "Power/activity indicators and low-speed transistor drivers",
      edge: "left",
      parts: [
        "D24",
        "D25",
        "D26",
        "D27",
        "D28",
        "R191",
        "R192",
        "R193",
        "R194",
        "R195",
        "Q3",
        "Q4",
        "Q5",
        "Q6",
        "R197",
        "R198",
        "R199",
        "R200",
      ],
    },
    {
      purpose: "DC rail test points",
      edge: "right",
      parts: ["TP2", "TP3", "TP4", "TP5", "TP6", "TP7"],
    },
    {
      purpose: "DC rail/ground test points",
      edge: "left",
      parts: ["TP1", "TP15", "TP24", "TP29", "TP30", "TP31"],
    },
    { purpose: "UART test points", edge: "left", parts: ["TP17", "TP18"] },
    {
      purpose: "UART test points",
      edge: "top",
      parts: ["TP33", "TP34", "TP35"],
    },
  ],
  icepi: [
    { purpose: "GPIO header", edge: "top", parts: ["J9"] },
    { purpose: "UART header", edge: "top", parts: ["J10"] },
    {
      purpose: "Power indicator and current limiting",
      edge: "right",
      parts: ["D3", "R67"],
    },
    {
      purpose: "Status indicator and current limiting",
      edge: "bottom",
      parts: ["D4", "R68"],
    },
    {
      purpose: "Indicator and current limiting",
      edge: "bottom",
      parts: ["D5", "R69"],
    },
    {
      purpose: "Static boot-selection test points",
      edge: "right",
      parts: ["TP1", "TP2"],
    },
    {
      purpose: "DC rail test points",
      edge: "left",
      parts: ["TP4", "TP6", "TP9"],
    },
    {
      purpose: "DC rail test points",
      edge: "bottom",
      parts: ["TP5", "TP7", "TP8"],
    },
  ],
}

function getPlacementBounds(parts: NativeFullBoardSource["parts"]): Bounds {
  // The circumradius conservatively encloses rotated pads during placement.
  // Custom polygons use their actual vertices. No copper geometry is changed.
  const points = parts.flatMap((part) =>
    part.pads.flatMap((pad) => {
      if (pad.shape === "custom") {
        if (!pad.points)
          throw new Error(`Missing native polygon for ${part.name}.${pad.name}`)
        return pad.points.map((point) => ({
          x: pad.worldX + point.x,
          y: pad.worldY + point.y,
        }))
      }
      const radius = Math.hypot(pad.width, pad.height) / 2
      return [
        { x: pad.worldX - radius, y: pad.worldY - radius },
        { x: pad.worldX + radius, y: pad.worldY + radius },
      ]
    }),
  )
  if (!points.length)
    throw new Error("Peripheral layout requires native pad geometry")
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  }
}

/** Translate reviewed peripheral groups into separated perimeter lanes.
 * All footprint-local coordinates, sides, rotations and net membership survive.
 */
export function createPeripheralLayout(
  source: NativeFullBoardSource,
): NativeFullBoardSource {
  const plan = Object.entries(peripheralLayouts).find(
    ([id]) => id === source.id,
  )?.[1]
  if (!plan) throw new Error(`No reviewed peripheral layout for ${source.id}`)
  const nativeBounds = getPlacementBounds(source.parts)
  const partsByName = new Map<PartName, NativeFullBoardSource["parts"][number]>(
    source.parts.map((part) => [part.name, part]),
  )
  const ddrParts = new Set(
    source.traces
      .filter(
        (trace) =>
          trace.group.startsWith("byte") || trace.group === "remaining",
      )
      .flatMap((trace) =>
        trace.path.map((selector) => selector.split(" > ")[0].slice(1)),
      ),
  )
  const offsets = new Map<PartName, Position>()
  const groupGapMm = 3
  const outlineMarginMm = 10
  const groups: GroupBounds[] = plan.map((group) => {
    const parts = group.parts.map((ref) => {
      const part = partsByName.get(ref)
      if (!part) throw new Error(`Missing ${source.id} peripheral ${ref}`)
      if (ddrParts.has(ref) || /^(C|L|Y|X)\d/.test(ref))
        throw new Error(
          `Protected component ${source.id}.${ref} cannot be relocated`,
        )
      return part
    })
    return { ...group, bounds: getPlacementBounds(parts) }
  })
  for (const edge of ["left", "right", "top", "bottom"] as const) {
    const horizontal = edge === "top" || edge === "bottom"
    const spanMin = horizontal ? nativeBounds.minX : nativeBounds.minY
    const spanMax = horizontal ? nativeBounds.maxX : nativeBounds.maxY
    let cursor = spanMin
    let laneOffset = groupGapMm
    let laneDepth = 0
    const ordered = groups
      .filter((group) => group.edge === edge)
      .sort((a, b) =>
        horizontal
          ? a.bounds.minX - b.bounds.minX
          : a.bounds.minY - b.bounds.minY,
      )
    for (const group of ordered) {
      const alongMin = horizontal ? group.bounds.minX : group.bounds.minY
      const length = horizontal
        ? group.bounds.maxX - group.bounds.minX
        : group.bounds.maxY - group.bounds.minY
      const depth = horizontal
        ? group.bounds.maxY - group.bounds.minY
        : group.bounds.maxX - group.bounds.minX
      if (length > spanMax - spanMin)
        throw new Error(
          `${source.id} ${group.purpose} exceeds its perimeter span`,
        )
      let start = Math.max(cursor, Math.min(alongMin, spanMax - length))
      if (start + length > spanMax) {
        laneOffset += laneDepth + groupGapMm
        laneDepth = 0
        cursor = spanMin
        start = Math.max(cursor, Math.min(alongMin, spanMax - length))
      }
      const dx = horizontal
        ? start - group.bounds.minX
        : edge === "right"
          ? nativeBounds.maxX + laneOffset - group.bounds.minX
          : nativeBounds.minX - laneOffset - group.bounds.maxX
      const dy = !horizontal
        ? start - group.bounds.minY
        : edge === "top"
          ? nativeBounds.maxY + laneOffset - group.bounds.minY
          : nativeBounds.minY - laneOffset - group.bounds.maxY
      for (const ref of group.parts) {
        if (offsets.has(ref))
          throw new Error(`Duplicate placement for ${source.id}.${ref}`)
        offsets.set(ref, { x: dx, y: dy })
      }
      cursor = start + length + groupGapMm
      laneDepth = Math.max(laneDepth, depth)
    }
  }
  const parts = source.parts.map((part) => {
    const offset = offsets.get(part.name)
    if (!offset) return part
    return {
      ...part,
      x: part.x + offset.x,
      y: part.y + offset.y,
      pads: part.pads.map((pad) => ({
        ...pad,
        worldX: pad.worldX + offset.x,
        worldY: pad.worldY + offset.y,
      })),
    }
  })
  const bounds = getPlacementBounds(parts)
  const minX = Math.min(
    ...source.outline.map((point) => point.x),
    bounds.minX - outlineMarginMm,
  )
  const maxX = Math.max(
    ...source.outline.map((point) => point.x),
    bounds.maxX + outlineMarginMm,
  )
  const minY = Math.min(
    ...source.outline.map((point) => point.y),
    bounds.minY - outlineMarginMm,
  )
  const maxY = Math.max(
    ...source.outline.map((point) => point.y),
    bounds.maxY + outlineMarginMm,
  )
  return {
    ...source,
    parts,
    width: maxX - minX,
    height: maxY - minY,
    outline: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ],
  }
}

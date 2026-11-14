import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import {
  createPeripheralLayout,
  peripheralLayouts,
} from "../full-boards/peripheral-layout"
import type { NativeFullBoardSource } from "../full-boards/native-full-board"

test("peripheral spacing preserves locked chips, sensitive parts and electrical topology", () => {
  const lockedChips = {
    ecp5: ["U3", "U4"],
    h616: ["U1", "U2"],
    butterstick: ["U4", "U11", "U12"],
    glider: ["U1", "U12"],
    imx6: ["U7", "U9"],
    icepi: ["U1", "U2"],
  }
  for (const [id, plan] of Object.entries(peripheralLayouts)) {
    const source: NativeFullBoardSource = JSON.parse(
      gunzipSync(
        readFileSync(new URL(`../full-boards/${id}.json.gz`, import.meta.url)),
      ).toString(),
    )
    const original = structuredClone(source)
    const placed = createPeripheralLayout(source)
    const allowed = new Set(plan.flatMap((group) => group.parts))
    const chips = Object.entries(lockedChips).find(
      ([board]) => board === id,
    )![1]
    const ddrMembers = new Set(
      source.traces
        .filter(
          (trace) =>
            trace.group.startsWith("byte") || trace.group === "remaining",
        )
        .flatMap((trace) =>
          trace.path.map((selector) => selector.split(" > ")[0].slice(1)),
        ),
    )
    expect(source).toEqual(original)
    expect(placed.traces).toEqual(source.traces)
    expect(placed.rules).toEqual(source.rules)
    expect(placed.layers).toEqual(source.layers)
    expect(placed.signalLayers).toEqual(source.signalLayers)
    expect(placed.parts).toHaveLength(source.parts.length)
    let moved = 0
    for (const [index, part] of placed.parts.entries()) {
      const native = source.parts[index]
      if (
        !allowed.has(part.name) ||
        chips.includes(part.name) ||
        ddrMembers.has(part.name) ||
        /^(C|L|Y|X)\d/.test(part.name)
      ) {
        expect(part).toEqual(native)
        continue
      }
      moved++
      expect(Math.hypot(part.x - native.x, part.y - native.y)).toBeGreaterThan(
        0,
      )
      expect(part.pads).toHaveLength(native.pads.length)
      for (const [padIndex, pad] of part.pads.entries()) {
        const originalPad = native.pads[padIndex]
        expect({
          ...pad,
          worldX: originalPad.worldX,
          worldY: originalPad.worldY,
        }).toEqual(originalPad)
        expect(pad.worldX - originalPad.worldX).toBeCloseTo(
          part.x - native.x,
          8,
        )
        expect(pad.worldY - originalPad.worldY).toBeCloseTo(
          part.y - native.y,
          8,
        )
      }
    }
    expect(moved).toBe(allowed.size)
    for (const group of plan) {
      const firstIndex = source.parts.findIndex(
        (part) => part.name === group.parts[0],
      )
      const dx = placed.parts[firstIndex].x - source.parts[firstIndex].x
      const dy = placed.parts[firstIndex].y - source.parts[firstIndex].y
      for (const ref of group.parts) {
        const index = source.parts.findIndex((part) => part.name === ref)
        expect(placed.parts[index].x - source.parts[index].x).toBeCloseTo(dx, 8)
        expect(placed.parts[index].y - source.parts[index].y).toBeCloseTo(dy, 8)
      }
    }
  }
})

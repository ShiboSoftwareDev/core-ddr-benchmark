type Section = [net: string, from: string, to: string]
type Source = {
  id: string
  parts: { name: string; pads: { pin?: string | null; nativePin?: string }[] }[]
  traces: { name: string; nativeNet: string; path: string[] }[]
}

// Controller and memory references are taken from each original PCB/schematic.
const devices: Record<string, [string, string[]]> = {
  h3: ["U1", ["DU1"]], a64: ["U1", ["U2", "U3"]], stmp157: ["U1", ["U2", "U3"]],
  orangecrab: ["U3", ["U4"]], a13: ["U100", ["U200"]], h616: ["U1", ["U2"]],
  butterstick: ["U4", ["U11", "U12"]], glider: ["U1", ["U12"]], imx6: ["U7", ["U9"]], icepi: ["U1", ["U2"]],
}
// DDR3 x16 FBGA96 native balls: DQ[7:0], mask, DQS+, DQS-.
// Use the memory balls, not net suffixes (H616 and OrangeCrab rename lanes).
const lower = "E3 F7 F2 F8 H3 H8 G2 H7 E7 F3 G3".split(" ")
const upper = "D7 C3 C8 C2 A7 A2 B8 A3 D3 C7 B7".split(" ")
const clocks = ["J7", "K7"]
const groupNames = ["byte0", "DQS0", "byte1", "DQS1", "clock", "address/command"]

/** Select controller-to-RAM copper, excluding testpoint/termination branches.
 * A retained RAM-side resistor net starts at its resistor pad.
 */
export function getDdrNetEndpoints(source: Pick<Source, "id">, trace: Source["traces"][number], memoryRef?: string): [string, string] {
  const [controller, memories] = devices[source.id]
  const ram = trace.path.find((selector) => (memoryRef ? [memoryRef] : memories).some((memory) => selector.startsWith(`.${memory} > `)))!
  const from = trace.path.find((selector) => selector.startsWith(`.${controller} > `)) ?? trace.path.find((selector) => selector !== ram)!
  return [from, ram]
}

export function getDdrSkewGroupNames(circuit: string): string[] {
  return (devices[circuit]?.[1] ?? []).flatMap((memory) => groupNames.map((name) => `${memory} ${name}`))
}

export function getDdrSkewGroups(source: Source) {
  const device = devices[source.id]
  if (!device) return []
  const [controller, memories] = device
  return memories.flatMap((memory) => {
    const pads = source.parts.find((part) => part.name === memory)!.pads
    const endpoint = (trace: Source["traces"][number], ref: string) => trace.path.find((selector) => selector.startsWith(`.${ref} > `))
    const byBall = new Map(source.traces.flatMap((trace) => {
      const to = endpoint(trace, memory)
      const ball = pads.find((pad) => to === `.${memory} > .${pad.pin}`)?.nativePin
      return ball ? [[ball, { trace, to: to! }] as const] : []
    }))
    function signal(ball: string): { name: string; sections: Section[] } {
      const member = byBall.get(ball)
      if (!member) return { name: ball, sections: [] }
      const { trace, to } = member
      const from = endpoint(trace, controller)
      if (from) return { name: trace.nativeNet, sections: [[trace.name, from, to]] }
      if (["a13", "a64", "stmp157"].includes(source.id)) for (const resistorPad of trace.path.filter((selector) => selector.startsWith(".R"))) {
        const match = /^\.(R\S+) > \.pin(\d+)$/.exec(resistorPad)
        if (match) {
          const opposite = `.${match[1]} > .pin${(match[1].startsWith("RN") ? 9 : 3) - Number(match[2])}`
          const upstream = source.traces.find((trace) => trace.path.includes(opposite) && endpoint(trace, controller))
          if (upstream) return { name: trace.nativeNet, sections: [[upstream.name, endpoint(upstream, controller)!, opposite], [trace.name, resistorPad, to]] }
        }
      }
      // Older fixtures retain only the RAM side of clock series resistors.
      const clockSource: Record<string, string[]> = { a64: [".R3 > .pin2", ".R4 > .pin2"], stmp157: [".R2 > .pin2", ".R3 > .pin1"] }
      const clockFrom = clockSource[source.id]?.[clocks.indexOf(ball)]
      return { name: trace.nativeNet, sections: clockFrom ? [[trace.name, clockFrom, to]] : [] }
    }
    const group = (name: string, balls: string[]) => ({ name: `${memory} ${name}`, signals: balls.map(signal) })
    const address = [...byBall.keys()].filter((ball) => ![...lower, ...upper, ...clocks, "T2"].includes(ball) && signal(ball).sections.length)
    return [group("byte0", lower), group("DQS0", lower.slice(-2)), group("byte1", upper), group("DQS1", upper.slice(-2)), group("clock", clocks), group("address/command", address)]
  })
}

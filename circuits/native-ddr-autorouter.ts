import { EventEmitter } from "node:events"
import { applyToPoint, compose, translate } from "transformation-matrix"
import type {
  BusLanesPipelineSolver,
  Bus,
  BusLengthMatchingPath,
  ConnectionName,
  SimpleRouteJson,
  Terminal,
} from "@tscircuit/bus-lanes-solver"
import type { DirectDdrBus } from "./direct-ddr-timing"
import {
  getNativePartFootprintTransform,
  type NativeDdrPartData,
} from "./native-part"

type PortSelector = string

/** Connect the existing Core phase hook to the published bus solver. Reference
 * constraints stay in their original rule file; no saved copper is loaded. */
export function createNativeDdrAutorouter({
  buses,
  parts,
  solverConstructor,
}: {
  buses: DirectDdrBus[]
  parts: NativeDdrPartData[]
  solverConstructor?: typeof BusLanesPipelineSolver
}) {
  const connectionBySelector = new Map<PortSelector, ConnectionName>()
  const terminalsByConnection = new Map<ConnectionName, Terminal[]>()
  const endpoint = (selector: PortSelector, name: ConnectionName) => {
    const [partSelector, pinSelector] = selector.split(" > ")
    const part = parts.find((part) => `.${part.name}` === partSelector)!
    const pad = part.pads.find((pad) => `.${pad.pin}` === pinSelector)!
    // Same KiCad-local to Core-local transform as NativePart, then world
    // translation. Right-handed points in mm: +X right, +Y up, +Z above.
    const position = applyToPoint(
      compose(translate(part.x, part.y), getNativePartFootprintTransform(part)),
      pad,
    )
    const terminal = terminalsByConnection
      .get(name)
      ?.find(
        (point) =>
          point.layer === part.layer &&
          Math.hypot(point.x - position.x, point.y - position.y) < 1e-7,
      )
    if (!terminal) throw new Error(`Missing routed endpoint ${selector}`)
    return terminal
  }
  return async (input: SimpleRouteJson) => {
    const constraints: Bus[] = []
    for (const connection of input.connections)
      terminalsByConnection.set(connection.name, connection.pointsToConnect)
    for (const srjBus of input.buses ?? []) {
      const timing = buses.find((bus) => bus.name === srjBus.busId)
      if (!timing) continue
      if (timing.connections.length !== srjBus.connectionNames.length)
        throw new Error(
          `DDR timing cohort ${timing.name} was split across phases`,
        )
      timing.connections.forEach((selector, index) =>
        connectionBySelector.set(selector, srjBus.connectionNames[index]),
      )
    }
    for (const srjBus of input.buses ?? []) {
      const timing = buses.find((bus) => bus.name === srjBus.busId)
      if (!timing) {
        constraints.push(srjBus)
        continue
      }
      const references = timing.lengthMatchTo?.map((selector) => {
        const name = connectionBySelector.get(selector)
        if (!name)
          throw new Error(`DDR length reference ${selector} has not routed`)
        return name
      })
      const paths: BusLengthMatchingPath[] = (
        timing.lengthMatchingPaths ?? []
      ).map(([fromSelector, toSelector]) => {
        const name = connectionBySelector.get(fromSelector)!
        const from = endpoint(fromSelector, name)
        const to = endpoint(toSelector, name)
        return {
          connectionName: name,
          pcbPortIds: [from.pcb_port_id!, to.pcb_port_id!],
          from,
          to,
        }
      })
      constraints.push({
        ...srjBus,
        minLength: timing.minLength,
        maxLength: timing.maxLength,
        maxLengthSkew: timing.maxLengthSkew,
        skewReference: timing.skewReference,
        referenceConnectionNames: references,
        lengthMatchingPaths: paths,
      })
    }
    const Solver =
      solverConstructor ??
      (await import("@tscircuit/bus-lanes-solver")).BusLanesPipelineSolver
    return new NativeDdrAutorouter({ ...input, buses: constraints }, Solver)
  }
}

/** Event adapter only; all search, tuning and acceptance use the built-in solver. */
class NativeDdrAutorouter extends EventEmitter {
  isRouting = false
  private solver: BusLanesPipelineSolver
  constructor(
    public input: SimpleRouteJson,
    Solver: typeof BusLanesPipelineSolver,
  ) {
    super()
    this.solver = new Solver(input)
  }
  start() {
    if (this.isRouting) return
    this.isRouting = true
    setImmediate(() => this.tick())
  }
  stop() {
    this.isRouting = false
  }
  solveSync() {
    this.solver.solve()
    if (!this.solver.solved) throw new Error("Built-in DDR routing failed")
    return this.solver.traces
  }
  private tick() {
    if (!this.isRouting) return
    try {
      for (
        let i = 0;
        i < 200 && !this.solver.solved && !this.solver.failed;
        i++
      )
        this.solver.step()
      if (this.solver.failed) {
        this.isRouting = false
        this.emit("error", {
          type: "error",
          error: new Error("Built-in DDR routing failed"),
        })
        return
      }
      if (this.solver.solved) {
        this.isRouting = false
        this.emit("complete", { type: "complete", traces: this.solver.traces })
        return
      }
      this.emit("progress", {
        type: "progress",
        steps: this.solver.iterations,
        progress: this.solver.progress,
        phase: this.solver.phase,
      })
      setImmediate(() => this.tick())
    } catch (error) {
      this.isRouting = false
      this.emit("error", {
        type: "error",
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }
}

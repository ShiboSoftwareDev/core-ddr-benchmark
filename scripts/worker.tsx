import { readFileSync, writeFileSync, renameSync } from "node:fs"
import { join } from "node:path"
import { gunzipSync } from "node:zlib"
import { NativeDdrBoard } from "../circuits/native-ddr-board"
import type { Progress } from "./types"

const [corePath, circuitId, output, mode] = process.argv.slice(2)
const started = performance.now()
const { RootCircuit } = await import(join(corePath, "index.ts"))
const source = JSON.parse(gunzipSync(readFileSync(join(import.meta.dir, "../circuits", `${circuitId}.json.gz`))).toString())
const circuit = new RootCircuit()
const progress: Progress = { renderCompleted: false, renderMs: null, phases: [], errors: [], solverEvents: [] }

function save(): void {
  writeFileSync(join(output, "progress.tmp"), JSON.stringify(progress, null, 2))
  renameSync(join(output, "progress.tmp"), join(output, "progress.json"))
  writeFileSync(join(output, "circuit.tmp"), JSON.stringify(circuit.getCircuitJson()))
  renameSync(join(output, "circuit.tmp"), join(output, "circuit.json"))
}

for (const eventName of ["autorouting:start", "autorouting:end", "autorouting:error"] as const) {
  circuit.on(eventName, (event: any) => {
    const phase = event.phaseName ?? "default"
    const stage = event._actualRoutingPhaseOrderIndex ?? event.phaseStageIndex ?? 0
    if (eventName === "autorouting:start") {
      progress.phases.push({ phase, stage, solver: event.solverName ?? null, status: "running", startedMs: performance.now() - started, durationMs: null, connections: event.simpleRouteJson.connections.length, cacheStatus: event.cacheStatus ?? null })
    } else {
      const active = progress.phases.findLast((p) => p.phase === phase && p.stage === stage && p.status === "running")
      if (!active) throw new Error(`Routing end without start for ${phase}`)
      active.status = eventName === "autorouting:end" ? "completed" : "failed"
      active.durationMs = performance.now() - started - active.startedMs
      if (eventName === "autorouting:error") progress.errors.push(event.error?.message ?? `Routing failed in ${phase}`)
    }
    if (event.simpleRouteJson) writeFileSync(join(output, `phase-${progress.phases.length}-${eventName.split(":")[1]}.srj.json`), JSON.stringify(event.simpleRouteJson))
    save()
  })
}
for (const eventName of ["solver:started", "solver:ended"] as const) {
  circuit.on(eventName, (event: any) => {
    const { solverParams, solverConstructorArgs, ...metadata } = event
    progress.solverEvents.push({ ...metadata, elapsedMs: performance.now() - started })
  })
}
circuit.on("asyncEffect:end", (event: any) => {
  if (event.error) { progress.errors.push(String(event.error)); save() }
})
circuit.add(<NativeDdrBoard source={source} geometryOnly={mode === "geometry"} />)
save()
try {
  await circuit.renderUntilSettled()
  progress.renderCompleted = true
} catch (error) {
  progress.errors.push(String(error))
}
progress.renderMs = performance.now() - started
save()

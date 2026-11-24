import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { isRoutingPass } from "./route-quality"
import type { Assessment, CaseResult, Progress } from "./types"

export async function runAttempt(corePath: string, fixture: { id: string; title: string }, dir: string, budgetMs: number, mode: "routing" | "matching" | "geometry"): Promise<CaseResult> {
  mkdirSync(dir, { recursive: true })
  const log = openSync(join(dir, "render.log"), "w")
  const started = performance.now()
  const child = Bun.spawn([process.execPath, "--tsconfig-override", join(corePath, "tsconfig.json"), join(import.meta.dir, "worker.tsx"), corePath, fixture.id, dir, mode], { cwd: corePath, stdout: log, stderr: log })
  let timedOut = false, peakRssMb = 0
  const memory = setInterval(() => {
    try {
      const rss = readFileSync(`/proc/${child.pid}/status`, "utf8").match(/VmHWM:\s+(\d+)/)
      if (rss) peakRssMb = Math.max(peakRssMb, Number(rss[1]) / 1024)
    } catch { /* The child may exit between memory samples. */ }
  }, 50)
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL") }, budgetMs)
  const exitCode = await child.exited
  clearTimeout(timer); clearInterval(memory); closeSync(log)
  const wallMs = performance.now() - started
  const progress: Progress | null = existsSync(join(dir, "progress.json")) ? JSON.parse(readFileSync(join(dir, "progress.json"), "utf8")) : null
  let assessment: Assessment | null = null
  if (existsSync(join(dir, "circuit.json"))) {
    const log = openSync(join(dir, "validation.log"), "w")
    const validation = Bun.spawn([process.execPath, join(import.meta.dir, "assess.ts"), corePath, fixture.id, dir], { cwd: corePath, stdout: log, stderr: log })
    const timer = setTimeout(() => validation.kill("SIGKILL"), 120_000)
    const validationExit = await validation.exited
    clearTimeout(timer); closeSync(log)
    if (validationExit === 0) assessment = JSON.parse(readFileSync(join(dir, "assessment.json"), "utf8"))
  }
  const row: CaseResult = {
    circuit: fixture.id, title: fixture.title, wallMs, peakRssMb, progress, assessment,
    status: timedOut ? "timeout" : exitCode !== 0 || !assessment ? "crashed" : mode === "geometry" && progress?.renderCompleted && assessment.geometryErrors.length === 0 ? "geometry_only" : "failed",
  }
  if (isRoutingPass(row)) row.status = "passed"
  return row
}

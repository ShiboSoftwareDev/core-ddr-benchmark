import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { resolve, join } from "node:path"
import { createHash } from "node:crypto"
import { cpus, platform, arch } from "node:os"
import { formatReport } from "./report"
import { fingerprint } from "./fingerprint"
import { runAttempt } from "./run-attempt"
import { isCompleted, preferRoute } from "./route-quality"
import type { BenchmarkResult, CaseResult } from "./types"

const root = resolve(import.meta.dir,"..")
const manifest = JSON.parse(readFileSync(join(root,"manifest.json"),"utf8"))
let corePath = process.cwd(), output = resolve("ddr-benchmark-results"), timeoutSeconds = 120, geometryOnly = false
const selected: string[] = []
for (let i=2;i<process.argv.length;i++) {
  const arg = process.argv[i]
  if (arg === "--core") corePath = resolve(process.argv[++i])
  else if (arg === "--out") output = resolve(process.argv[++i])
  else if (arg === "--circuit") selected.push(process.argv[++i])
  else if (arg === "--timeout") timeoutSeconds = Number(process.argv[++i])
  else if (arg === "--geometry-only") geometryOnly = true
  else throw new Error(`Unknown benchmark option: ${arg}`)
}
if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 3600) throw new Error("--timeout must be an integer from 1 to 3600 seconds")
if (!existsSync(join(corePath,"lib/RootCircuit.ts"))) throw new Error("--core must point to a core source checkout with installed dependencies")
for (const id of selected) if (!manifest.circuits.some((c: any) => c.id === id)) throw new Error(`Unknown circuit: ${id}`)
if (existsSync(join(output,"results.json"))) throw new Error("Output already contains results; choose a new --out directory")
mkdirSync(output,{recursive:true})

function commit(path: string): string {
  const result = Bun.spawnSync(["git","-C",path,"rev-parse","HEAD"])
  if (result.exitCode !== 0) throw new Error(`Cannot identify source revision in ${path}`)
  return result.stdout.toString().trim()
}

const result: BenchmarkResult = {
  schemaVersion: 1, coreCommit: commit(corePath), benchmarkRevision: fingerprint(root), assessmentRevision: fingerprint(root),
  fixtureHashes: {}, bunVersion: Bun.version, platform: `${platform()} ${arch()}`, cpu: cpus()[0].model,
  dependencies: Object.fromEntries(["@tscircuit/bus-lanes-solver","@tscircuit/capacity-autorouter","@tscircuit/fanout-solver","@tscircuit/checks","@tscircuit/props","circuit-json"].map((name) => [name,JSON.parse(readFileSync(join(corePath,"node_modules",name,"package.json"),"utf8")).version])),
  timeoutSeconds, geometryOnly, cases: [],
}
const circuits = manifest.circuits.filter((c: any) => selected.length === 0 || selected.includes(c.id))
for (const fixture of circuits) {
  const hash = createHash("sha256").update(readFileSync(join(root,fixture.file))).digest("hex")
  if (hash !== fixture.sha256) throw new Error(`Fixture hash mismatch: ${fixture.id}`)
  result.fixtureHashes[fixture.id] = hash
}
for (const fixture of circuits) {
  const dir = join(output,fixture.id)
  mkdirSync(dir,{recursive:true})
  let retained: CaseResult | undefined, wallMs = 0, peakRssMb = 0, timedOut = false
  const attempts: NonNullable<CaseResult["attempts"]> = []
  const modes = geometryOnly ? ["geometry"] as const : ["routing", "matching"] as const
  for (const mode of modes) {
    const remaining = timeoutSeconds * 1000 - wallMs
    if (remaining < 1000) break
    const attemptDir = join(dir, "attempts", mode)
    const candidate = await runAttempt(corePath, fixture, attemptDir, remaining, mode)
    wallMs += candidate.wallMs
    peakRssMb = Math.max(peakRssMb, candidate.peakRssMb)
    timedOut ||= candidate.status === "timeout"
    if (candidate.status === "crashed") process.exitCode = 1
    if (mode !== "geometry") attempts.push({ mode, status: candidate.status, wallMs: candidate.wallMs, connectedNets: candidate.assessment?.connectedNets ?? null })
    if (!retained || preferRoute(candidate, retained)) {
      retained = { ...candidate, ...(mode === "geometry" ? {} : { selectedAttempt: mode }) }
      // Root artifacts always describe the retained route. Every attempt,
      // including an interrupted tuning attempt, remains available separately.
      for (const file of readdirSync(dir, { withFileTypes: true })) if (file.isFile()) rmSync(join(dir, file.name))
      for (const file of readdirSync(attemptDir)) cpSync(join(attemptDir, file), join(dir, file))
    }
  }
  const row: CaseResult = { ...retained!, wallMs, peakRssMb, ...(geometryOnly ? {} : { attempts }) }
  if (timedOut && !isCompleted(row) && row.status !== "crashed") row.status = "timeout"
  result.cases.push(row)
  writeFileSync(join(output,"results.json"),JSON.stringify(result,null,2))
  writeFileSync(join(output,"report.md"),formatReport(result))
  console.log(`${row.circuit}: ${row.status}, ${row.assessment?.connectedNets ?? "?"}/${fixture.nets} nets, ${(wallMs/1000).toFixed(2)}s${row.selectedAttempt ? `, kept ${row.selectedAttempt}` : ""}`)
}
// Solver failures are measured outcomes. Only infrastructure/validation crashes
// fail the command; inspect per-case status to evaluate routing quality.
if (result.cases.some((c) => c.status === "crashed")) process.exitCode = 1

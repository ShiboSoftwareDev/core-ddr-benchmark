import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, openSync, closeSync } from "node:fs"
import { resolve, join } from "node:path"
import { createHash } from "node:crypto"
import { cpus, platform, arch } from "node:os"
import { formatReport } from "./report"
import type { Assessment, BenchmarkResult, CaseResult, Progress } from "./types"

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
  schemaVersion: 1, coreCommit: commit(corePath), benchmarkRevision: "",
  fixtureHashes: {}, bunVersion: Bun.version, platform: `${platform()} ${arch()}`, cpu: cpus()[0].model,
  dependencies: Object.fromEntries(["@tscircuit/bus-lanes-solver","@tscircuit/capacity-autorouter","@tscircuit/fanout-solver","@tscircuit/checks","@tscircuit/props","circuit-json"].map((name) => [name,JSON.parse(readFileSync(join(corePath,"node_modules",name,"package.json"),"utf8")).version])),
  timeoutSeconds, geometryOnly, cases: [],
}
const contentHash = createHash("sha256")
for (const file of ["package.json","manifest.json",...readdirSync(join(root,"scripts"),{withFileTypes:true}).filter((f) => f.isFile()).map((f) => `scripts/${f.name}`),...readdirSync(join(root,"circuits"),{withFileTypes:true}).filter((f) => f.isFile()).map((f) => `circuits/${f.name}`)].sort()) {
  contentHash.update(file + "\0").update(readFileSync(join(root,file))).update("\0")
}
result.benchmarkRevision = `sha256:${contentHash.digest("hex")}`
const circuits = manifest.circuits.filter((c: any) => selected.length === 0 || selected.includes(c.id))
for (const fixture of circuits) {
  const hash = createHash("sha256").update(readFileSync(join(root,fixture.file))).digest("hex")
  if (hash !== fixture.sha256) throw new Error(`Fixture hash mismatch: ${fixture.id}`)
  result.fixtureHashes[fixture.id] = hash
}
for (const fixture of circuits) {
  const dir = join(output,fixture.id)
  mkdirSync(dir,{recursive:true})
  const log = openSync(join(dir,"render.log"),"w")
  const started = performance.now()
  const child = Bun.spawn([process.execPath,"--tsconfig-override",join(corePath,"tsconfig.json"),join(import.meta.dir,"worker.tsx"),corePath,fixture.id,dir,geometryOnly ? "geometry" : "full"],{cwd:corePath,stdout:log,stderr:log})
  let timedOut = false, peakRssMb = 0
  const memory = setInterval(() => {
    try {
      const status = readFileSync(`/proc/${child.pid}/status`,"utf8")
      const rss = status.match(/VmHWM:\s+(\d+)/)
      if (rss) peakRssMb = Math.max(peakRssMb,Number(rss[1])/1024)
    } catch { /* The render process may have exited between sampling ticks. */ }
  },50)
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL") },timeoutSeconds*1000)
  const exitCode = await child.exited
  clearTimeout(timer); clearInterval(memory); closeSync(log)
  const wallMs = performance.now()-started
  const progress: Progress | null = existsSync(join(dir,"progress.json")) ? JSON.parse(readFileSync(join(dir,"progress.json"),"utf8")) : null
  let assessment: Assessment | null = null
  if (existsSync(join(dir,"circuit.json"))) {
    const validationLog = openSync(join(dir,"validation.log"),"w")
    const validation = Bun.spawn([process.execPath,join(import.meta.dir,"assess.ts"),corePath,fixture.id,dir],{cwd:corePath,stdout:validationLog,stderr:validationLog})
    const validationTimer = setTimeout(() => validation.kill("SIGKILL"),120_000)
    const validationExit = await validation.exited
    clearTimeout(validationTimer); closeSync(validationLog)
    if (validationExit === 0) assessment = JSON.parse(readFileSync(join(dir,"assessment.json"),"utf8"))
  }
  const passed = assessment && progress?.renderCompleted && progress.errors.length === 0 && progress.phases.every((p) => p.status === "completed") && assessment.connectedNets === assessment.requestedNets && assessment.geometryErrors.length === 0 && Object.values(assessment.findings).every((n) => n === 0)
  const row: CaseResult = { circuit:fixture.id,title:fixture.title,status:timedOut ? "timeout" : exitCode !== 0 || !assessment ? "crashed" : geometryOnly && progress?.renderCompleted && assessment.geometryErrors.length === 0 ? "geometry_only" : passed ? "passed" : "failed",wallMs,peakRssMb,progress,assessment }
  result.cases.push(row)
  writeFileSync(join(output,"results.json"),JSON.stringify(result,null,2))
  writeFileSync(join(output,"report.md"),formatReport(result))
  console.log(`${row.circuit}: ${row.status}, ${assessment?.connectedNets ?? "?"}/${fixture.nets} nets, ${(wallMs/1000).toFixed(2)}s`)
}
// Solver failures are measured outcomes. Only infrastructure/validation crashes
// fail the command; inspect per-case status to evaluate routing quality.
if (result.cases.some((c) => c.status === "crashed")) process.exitCode = 1

import { readFileSync, writeFileSync, openSync, closeSync } from "node:fs"
import { resolve, dirname, join } from "node:path"
import { createHash } from "node:crypto"
import type { BenchmarkResult } from "./types"
import { fingerprint } from "./fingerprint"
import { formatReport } from "./report"

const [resultsFile, coreDirectory] = process.argv.slice(2)
const corePath = resolve(coreDirectory)
const root = resolve(import.meta.dir,"..")
const result: BenchmarkResult = JSON.parse(readFileSync(resultsFile,"utf8"))
for (const name of ["@tscircuit/checks","circuit-json"]) {
  const version = JSON.parse(readFileSync(join(corePath,"node_modules",name,"package.json"),"utf8")).version
  if (version !== result.dependencies[name]) throw new Error(`Validation dependency changed: ${name}`)
}
for (const row of result.cases) {
  if (row.status === "crashed") throw new Error(`Cannot reassess an infrastructure crash: ${row.circuit}`)
  const hash = createHash("sha256").update(readFileSync(join(root,"circuits",`${row.circuit}.json.gz`))).digest("hex")
  if (hash !== result.fixtureHashes[row.circuit]) throw new Error(`Fixture changed: ${row.circuit}`)
  const dir = join(dirname(resolve(resultsFile)),row.circuit)
  const log = openSync(join(dir,"validation.log"),"w")
  const child = Bun.spawn([process.execPath,join(import.meta.dir,"assess.ts"),corePath,row.circuit,dir],{stdout:log,stderr:log})
  const timer = setTimeout(() => child.kill("SIGKILL"),120_000)
  const code = await child.exited
  clearTimeout(timer); closeSync(log)
  if (code !== 0) throw new Error(`Validation failed: ${row.circuit}`)
  row.assessment = JSON.parse(readFileSync(join(dir,"assessment.json"),"utf8"))
  const a = row.assessment!, p = row.progress
  if (row.status !== "timeout") row.status = result.geometryOnly && p?.renderCompleted && a.geometryErrors.length === 0 ? "geometry_only" : p?.renderCompleted && p.errors.length === 0 && p.phases.every((s) => s.status === "completed") && a.connectedNets === a.requestedNets && a.geometryErrors.length === 0 && Object.values(a.findings).every((n) => n === 0) ? "passed" : "failed"
  console.log(`${row.circuit}: ${row.status}, ${a.connectedNets}/${a.requestedNets}`)
}
result.assessmentRevision = fingerprint(root)
writeFileSync(resultsFile,JSON.stringify(result,null,2))
writeFileSync(join(dirname(resolve(resultsFile)),"report.md"),formatReport(result))

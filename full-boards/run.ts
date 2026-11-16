import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const args = process.argv.slice(2)
const output = resolve(args[0] ?? "../results/full-boards")
const ids = args.slice(1).length ? args.slice(1) : ["orangecrab", "h616", "butterstick", "glider", "imx6", "icepi"]
const seconds = Number(process.env.FULL_BOARD_TIMEOUT_SECONDS ?? "600")
const mode = process.env.FULL_BOARD_ROUTE_MODE ?? "phased"
mkdirSync(output, { recursive: true })
const rows: unknown[] = []
const queue = [...ids]
async function worker(): Promise<void> {
  while (queue.length) {
    const id = queue.shift()!
    const folder = join(output, id)
    mkdirSync(folder, { recursive: true })
    const log = openSync(join(folder, "render.log"), "w")
    const child = Bun.spawn([process.execPath, join(import.meta.dir, "render.tsx"), id, folder, mode], { cwd: import.meta.dir, stdout: log, stderr: log })
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL") }, seconds*1000)
    const exitCode = await child.exited
    clearTimeout(timer)
    closeSync(log)
    const row = { id, mode, exitCode, timedOut, limitSeconds: seconds }
    rows.push(row)
    writeFileSync(join(folder, "process.json"), JSON.stringify(row, null, 2))
    writeFileSync(join(output, "processes.json"), JSON.stringify(rows, null, 2))
    console.log(JSON.stringify(row))
  }
}
await Promise.all([worker(), worker()])

import { readFileSync, writeFileSync } from "node:fs"
import { resolve, join } from "node:path"
import type { AnyCircuitElement } from "circuit-json"
import { physicalDrcIssues } from "../scripts/route-quality"
import type { Assessment } from "../scripts/types"

// bun repros/icepi-ddr-timing.ts <runtime> <benchmark results for icepi> <output.svg>
const [runtime, results, output] = process.argv.slice(2)
if (!runtime || !results || !output) throw new Error("Expected runtime, board results directory, and output SVG")
const assessment: Assessment = JSON.parse(readFileSync(join(results, "assessment.json"), "utf8"))
if (assessment.connectedNets !== assessment.requestedNets || physicalDrcIssues(assessment) || assessment.geometryErrors.length)
  throw new Error("The snapshot requires complete connectivity and passing physical DRC")
const circuit: AnyCircuitElement[] = JSON.parse(readFileSync(join(results, "circuit.json"), "utf8"))
// This board-world viewport contains both BGA pad fields and their routed
// approaches. Keeping it fixed makes copper changes line up in a GitHub diff.
const viewport = { minX: 2, maxX: 32, minY: -9, maxY: 23 }
const { convertCircuitJsonToPcbSvg } = await import(resolve(runtime, "node_modules/circuit-to-svg/dist/index.js"))
writeFileSync(output, convertCircuitJsonToPcbSvg(circuit, {width:1200, height:1000, backgroundColor:"white", viewport, includeVersion:false}))

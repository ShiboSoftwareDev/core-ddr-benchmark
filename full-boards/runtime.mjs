// A repro can select a specific source checkout without editing its TSX.
const router = await import(process.env.FULL_BOARD_ROUTER_MODULE ?? new URL(
  "../../tscircuit-autorouter/lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph.ts",
  import.meta.url,
).href)
export const AutoroutingPipelineSolver9_PreloadedTraceGraph = router.AutoroutingPipelineSolver9_PreloadedTraceGraph

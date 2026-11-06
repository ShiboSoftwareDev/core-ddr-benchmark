## Same Machine Benchmark Results

Both revisions ran sequentially on one machine.

Dataset: `core-ddr` · Scenarios: 10
Base: [`c8787a0`](https://github.com/tscircuit/core/commit/c8787a0098dbd3d7520c4d66c35f56aca5bdafa8) · PR: [`ea8feb0`](https://github.com/tscircuit/core/commit/ea8feb0ee0e4480938bd646ed010f8234f5b16a1)

| Solver | Metric | Base | PR | Delta |
| --- | --- | ---: | ---: | ---: |
| Core DDR | Completion | 30.0% (3/10) | 30.0% (3/10) | 0.0 pp |
| Core DDR | DRC pass | 30.0% (3/10) | 30.0% (3/10) | 0.0 pp |
| Core DDR | Connected nets | 152/606 | 152/606 | 0 |
| Core DDR | DRC issues | 0 | 0 | 0 |
| Core DDR | Failed | 4 | 4 | 0 |
| Core DDR | Timeouts | 3 | 3 | 0 |
| Core DDR | Crashes | 0 | 0 | 0 |
| Core DDR | P50 time | 120.0s | 120.0s | 0.0% |
| Core DDR | P60 time | 120.0s | 120.0s | 0.0% |
| Core DDR | P70 time | 120.0s | 120.0s | 0.0% |
| Core DDR | P80 time | 120.0s | 120.0s | 0.0% |
| Core DDR | P90 time | 120.0s | 120.0s | 0.0% |
| Core DDR | P95 time | 120.0s | 120.0s | 0.0% |
| Core DDR | Memory P50 | 2187.2 MiB | 2149.7 MiB | -1.7% |
| Core DDR | Memory P80 | 3403.8 MiB | 3325.3 MiB | -2.3% |
| Core DDR | Memory P90 | 4239.2 MiB | 3835.6 MiB | -9.5% |
| Core DDR | Average vias | 118.33 | 118.33 | 0.0% |
| Core DDR | Average wire length (mm) | 1201.27 | 1201.27 | 0.0% |

Outcome changes: **0 improved**, **0 regressed**.
Completion requires settled rendering, every routing phase completed and every requested net connected. DRC pass additionally requires clean physical checks and a native pad geometry audit. DRC issues are totaled across completed circuits.
Timing percentiles include all circuits, with failed and timed-out circuits counted at their configured 120s timeout; negative timing deltas are faster. Per-circuit details retain actual wall time. Average vias and wire length use 3 matched completed circuits. Memory percentiles use measured render-process peak RSS.

<details>
<summary>Base pipeline stage timings</summary>

**Core DDR**

Recorded timings: 10/10 circuits (7 partial, including failed or timed-out circuits).
Times are summed across circuits; percentages use total recorded phase time. Unfinished phases have no recorded end time and are excluded.

| Stage | Total time | % of stage time |
| --- | ---: | ---: |
| byte0 (BusLanesPipelineSolver) | 35.032s | 7.2% |
| byte1 (BusLanesPipelineSolver) | 45.893s | 9.4% |
| byte2 (BusLanesPipelineSolver) | 43.361s | 8.9% |
| byte3 (BusLanesPipelineSolver) | 4.126s | 0.8% |
| remaining (AutoroutingPipelineSolver9_PreloadedTraceGraph) | 360.772s | 73.7% |
| **Total** | **489.184s** | **100.0%** |

</details>

<details>
<summary>PR pipeline stage timings</summary>

**Core DDR**

Recorded timings: 10/10 circuits (7 partial, including failed or timed-out circuits).
Times are summed across circuits; percentages use total recorded phase time. Unfinished phases have no recorded end time and are excluded.

| Stage | Total time | % of stage time |
| --- | ---: | ---: |
| byte0 (BusLanesPipelineSolver) | 34.852s | 7.1% |
| byte1 (BusLanesPipelineSolver) | 48.047s | 9.7% |
| byte2 (BusLanesPipelineSolver) | 41.203s | 8.4% |
| byte3 (BusLanesPipelineSolver) | 4.305s | 0.9% |
| remaining (AutoroutingPipelineSolver9_PreloadedTraceGraph) | 364.408s | 73.9% |
| **Total** | **492.814s** | **100.0%** |

</details>

<details>
<summary>Per-circuit results (10)</summary>

| Circuit | Metric | Base | PR | Delta |
| --- | --- | ---: | ---: | ---: |
| Allwinner H3 DDR3 16x1 | Outcome | Failed | Failed | — |
| Allwinner H3 DDR3 16x1 | Connected nets | 0/53 | 0/53 | 0 |
| Allwinner H3 DDR3 16x1 | Wall time | 24.5s | 24.5s | -0.4% |
| Allwinner H3 DDR3 16x1 | Peak RSS | 1433.1 MiB | 1374.8 MiB | -4.1% |
| Allwinner H3 DDR3 16x1 | Vias | 0 | 0 | 0 |
| Allwinner H3 DDR3 16x1 | Wire length (mm) | 0.00 | 0.00 | n/a |
| Allwinner H3 DDR3 16x1 | DRC issues | 0 | 0 | 0 |
| Allwinner H3 DDR3 16x1 | Unfinished phase | remaining (AutoroutingPipelineSolver9_PreloadedTraceGraph) | remaining (AutoroutingPipelineSolver9_PreloadedTraceGraph) | — |
| OLIMEX A64-OLinuXino rev H | Outcome | Failed | Failed | — |
| OLIMEX A64-OLinuXino rev H | Connected nets | 0/75 | 0/75 | 0 |
| OLIMEX A64-OLinuXino rev H | Wall time | 111.3s | 108.3s | -2.7% |
| OLIMEX A64-OLinuXino rev H | Peak RSS | 4173.7 MiB | 3777.3 MiB | -9.5% |
| OLIMEX A64-OLinuXino rev H | Vias | 0 | 0 | 0 |
| OLIMEX A64-OLinuXino rev H | Wire length (mm) | 0.00 | 0.00 | n/a |
| OLIMEX A64-OLinuXino rev H | DRC issues | 0 | 0 | 0 |
| OLIMEX A64-OLinuXino rev H | Unfinished phase | remaining (AutoroutingPipelineSolver9_PreloadedTraceGraph) | remaining (AutoroutingPipelineSolver9_PreloadedTraceGraph) | — |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | Outcome | Failed | Failed | — |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | Connected nets | 0/72 | 0/72 | 0 |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | Wall time | 85.1s | 85.9s | +1.0% |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | Peak RSS | 4828.7 MiB | 4360.3 MiB | -9.7% |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | Vias | 0 | 0 | 0 |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | Wire length (mm) | 0.00 | 0.00 | n/a |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | DRC issues | 0 | 0 | 0 |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | Unfinished phase | remaining (AutoroutingPipelineSolver9_PreloadedTraceGraph) | remaining (AutoroutingPipelineSolver9_PreloadedTraceGraph) | — |
| OrangeCrab rev 0.2.1 ECP5 DDR3 | Outcome | DRC passed | DRC passed | — |
| OrangeCrab rev 0.2.1 ECP5 DDR3 | Connected nets | 50/50 | 50/50 | 0 |
| OrangeCrab rev 0.2.1 ECP5 DDR3 | Wall time | 90.7s | 92.0s | +1.4% |
| OrangeCrab rev 0.2.1 ECP5 DDR3 | Peak RSS | 2738.4 MiB | 2540.8 MiB | -7.2% |
| OrangeCrab rev 0.2.1 ECP5 DDR3 | Vias | 107 | 107 | 0 |
| OrangeCrab rev 0.2.1 ECP5 DDR3 | Wire length (mm) | 853.55 | 853.55 | 0.0% |
| OrangeCrab rev 0.2.1 ECP5 DDR3 | DRC issues | 0 | 0 | 0 |
| OrangeCrab rev 0.2.1 ECP5 DDR3 | Unfinished phase | — | — | — |
| Allwinner A13 SBC | Outcome | Timeout | Timeout | — |
| Allwinner A13 SBC | Connected nets | 0/96 | 0/96 | 0 |
| Allwinner A13 SBC | Wall time | 120.0s | 120.0s | +0.0% |
| Allwinner A13 SBC | Peak RSS | 666.7 MiB | 670.9 MiB | +0.6% |
| Allwinner A13 SBC | Vias | 0 | 0 | 0 |
| Allwinner A13 SBC | Wire length (mm) | 0.00 | 0.00 | n/a |
| Allwinner A13 SBC | DRC issues | 0 | 0 | 0 |
| Allwinner A13 SBC | Unfinished phase | byte1 (BusLanesPipelineSolver) | byte1 (BusLanesPipelineSolver) | — |
| Allwinner H616 Devboard DDR3 | Outcome | Failed | Failed | — |
| Allwinner H616 Devboard DDR3 | Connected nets | 0/53 | 0/53 | 0 |
| Allwinner H616 Devboard DDR3 | Wall time | 32.4s | 34.5s | +6.6% |
| Allwinner H616 Devboard DDR3 | Peak RSS | 987.2 MiB | 980.9 MiB | -0.6% |
| Allwinner H616 Devboard DDR3 | Vias | 0 | 0 | 0 |
| Allwinner H616 Devboard DDR3 | Wire length (mm) | 0.00 | 0.00 | n/a |
| Allwinner H616 Devboard DDR3 | DRC issues | 0 | 0 | 0 |
| Allwinner H616 Devboard DDR3 | Unfinished phase | byte1 (BusLanesPipelineSolver) | byte1 (BusLanesPipelineSolver) | — |
| ButterStick r1.0 | Outcome | Timeout | Timeout | — |
| ButterStick r1.0 | Connected nets | 0/55 | 0/55 | 0 |
| ButterStick r1.0 | Wall time | 120.0s | 120.0s | -0.0% |
| ButterStick r1.0 | Peak RSS | 1056.0 MiB | 849.1 MiB | -19.6% |
| ButterStick r1.0 | Vias | 0 | 0 | 0 |
| ButterStick r1.0 | Wire length (mm) | 0.00 | 0.00 | n/a |
| ButterStick r1.0 | DRC issues | 0 | 0 | 0 |
| ButterStick r1.0 | Unfinished phase | byte1 (BusLanesPipelineSolver) | byte1 (BusLanesPipelineSolver) | — |
| Glider mainboard | Outcome | DRC passed | DRC passed | — |
| Glider mainboard | Connected nets | 49/49 | 49/49 | 0 |
| Glider mainboard | Wall time | 30.0s | 30.0s | +0.0% |
| Glider mainboard | Peak RSS | 2177.3 MiB | 2135.9 MiB | -1.9% |
| Glider mainboard | Vias | 115 | 115 | 0 |
| Glider mainboard | Wire length (mm) | 1273.24 | 1273.24 | 0.0% |
| Glider mainboard | DRC issues | 0 | 0 | 0 |
| Glider mainboard | Unfinished phase | — | — | — |
| i.MX6 Demo Board | Outcome | DRC passed | DRC passed | — |
| i.MX6 Demo Board | Connected nets | 53/53 | 53/53 | 0 |
| i.MX6 Demo Board | Wall time | 111.8s | 114.3s | +2.2% |
| i.MX6 Demo Board | Peak RSS | 3211.3 MiB | 3212.4 MiB | +0.0% |
| i.MX6 Demo Board | Vias | 133 | 133 | 0 |
| i.MX6 Demo Board | Wire length (mm) | 1477.02 | 1477.02 | 0.0% |
| i.MX6 Demo Board | DRC issues | 0 | 0 | 0 |
| i.MX6 Demo Board | Unfinished phase | — | — | — |
| iCE/Pi CM0 SBC | Outcome | Timeout | Timeout | — |
| iCE/Pi CM0 SBC | Connected nets | 0/50 | 0/50 | 0 |
| iCE/Pi CM0 SBC | Wall time | 120.1s | 120.1s | +0.0% |
| iCE/Pi CM0 SBC | Peak RSS | 2197.1 MiB | 2163.5 MiB | -1.5% |
| iCE/Pi CM0 SBC | Vias | 0 | 0 | 0 |
| iCE/Pi CM0 SBC | Wire length (mm) | 0.00 | 0.00 | n/a |
| iCE/Pi CM0 SBC | DRC issues | 0 | 0 | 0 |
| iCE/Pi CM0 SBC | Unfinished phase | remaining (AutoroutingPipelineSolver9_PreloadedTraceGraph) | remaining (AutoroutingPipelineSolver9_PreloadedTraceGraph) | — |

</details>

<details>
<summary>Dependency versions</summary>

| Package | Base | PR |
| --- | --- | --- |
| @tscircuit/bus-lanes-solver | 0.0.47 | 0.0.46 |
| @tscircuit/capacity-autorouter | 0.0.1051 | 0.0.1051 |
| @tscircuit/fanout-solver | 0.0.81 | 0.0.81 |
| @tscircuit/checks | 0.0.268 | 0.0.268 |
| @tscircuit/props | 0.0.719 | 0.0.719 |
| circuit-json | 0.0.547 | 0.0.547 |

</details>

<details>
<summary>Runtime, provenance and scope</summary>

Bun 1.4.3 · linux x64 · AMD EPYC 9V74 80-Core Processor · 120s render budget per circuit.
Benchmark render fingerprint: `sha256:6578002a640f41d9714e6a14abea844c547068b7d9a84d74b792d7b0f7d49e4c`.
Assessment fingerprint: `sha256:6578002a640f41d9714e6a14abea844c547068b7d9a84d74b792d7b0f7d49e4c`.

Each circuit runs in a fresh process. Validation runs separately from render timing. Completed stages retain copper in SRJ artifacts; if a later stage fails, Core may emit no final PCB traces. Connected-net counts refer to saved Circuit JSON.

The extracted DDR subsystem retains native component placement, all pads of selected components, source signal layers and routing rules. Existing copper is removed; irregular board edges use a bounding box and unsupported pad shapes use recorded approximations. Results do not establish DDR timing, skew, impedance or hardware qualification.

</details>

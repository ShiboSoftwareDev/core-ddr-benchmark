# Core DDR workflow benchmark

Ten real DDR subsystems rendered from TSX through a selected `@tscircuit/core`
source checkout: H3, A64, STMP157, OrangeCrab, A13, H616, ButterStick, Glider,
i.MX6 and iCE/Pi. This captures Core's full bus-lane and remaining-routing
workflow instead of benchmarking an autorouter from an already extracted SRJ.

[Initial 120-second local baseline](reports/baseline-2026-11-06.md): 3 passes, 4 routing failures, 3 timeouts. Raw results record separate render and assessment fingerprints; saved copper was revalidated with the emitted physical via spans.

Core pins this repository to a full Git commit in its devDependencies.
From an installed core checkout:

```sh
bun run benchmark:ddr
bun run benchmark:ddr --circuit h3 --timeout 60 --out /tmp/ddr-h3
```

From this repository, install its peers with `bun install`, install dependencies
in the target core checkout, then run:

```sh
bun scripts/run.ts --core ../core --out results/baseline
bun scripts/run.ts --core ../core --geometry-only --out results/geometry
bun scripts/report.ts results/head/results.json results/base/results.json comparison.md
```

The default render timeout is 120 seconds per circuit. Cases run serially in
fresh processes with no configured routing cache. The parent enforces the
timeout even if a solver blocks the event loop. Validation has a separate
120-second limit. An output directory containing results is never overwritten.

`results.json` and `report.md` include render wall time, phase/solver times,
sampled peak render RSS, final connected nets, via counts, wire length, geometry
audit, DDR length skew, and check findings. Per-circuit directories retain Circuit JSON, phase
SRJ inputs/outputs, solver events and logs. Core may withhold all final copper
when a later phase fails; completed stage copper remains in its SRJ output and
is not counted as connectivity in the final Circuit JSON. Routing failures and
timeouts are measured results; infrastructure or validator crashes fail the
command. A complete pass requires every requested net connected and no errors.
For comparisons, the report rejects different fixture hashes, benchmark source
fingerprints, Bun versions or render budgets.

The `benchmarkRevision` is a SHA-256 fingerprint of the benchmark's executable
source and fixtures. It works when installed as a Git dependency without a
`.git` directory. `assessmentRevision` identifies the validator source; it normally matches the render fingerprint. To validate saved copper again after a validator change without rerunning routing, use `bun scripts/reassess.ts results/baseline/results.json ../core`. This verifies fixture hashes and check-package versions, preserves render timing and timeout outcomes, and records the new assessment fingerprint separately.

The core revision, fixture hashes, runtime and machine are
recorded with every run. Core's PR workflow runs base and head on one machine
using the same trusted benchmark pin, then posts the result as a PR comment.
No ordinary push or PR CI job executes the benchmark.

PR reports use the auto-router layout: a Solver / Metric / Base / PR / Delta summary, outcome changes, and collapsible stage timings, circuit details and dependency versions. [Paired local PR example](reports/pr-5248-local.md). Timing percentiles count failed and timed-out circuits at their configured timeout; the details retain actual wall times. Vias and wire length compare matched completed circuits.

## DDR skew and preserving length matching

The existing ten full DDR fixtures have 78 explicit matching groups in
`circuits/skew-groups.json`. Skew measurement runs with the normal benchmark;
there is no enable/disable flag. Result fields and reference options are
optional: older or partial records remain readable, and absent data shows as
unavailable. Missing fields do not fail validation. Compatible routing options
come from the original board/project, as described below.
Each receiver has separate groups for:

- Each data byte: eight DQ signals, its mask, and both DQS legs (11 paths).
- Each DQS pair and each clock pair (two paths).
- Address/bank and synchronous command/control signals. Asynchronous reset is
  excluded; Glider's resistor-tied chip select has no controller path.

Byte membership follows the receiver's native FBGA ball assignment, rather
than just net-name suffixes. In H616, DQ0–7 use the lower RAM byte with the
signals named SDQM1/SDQS1; DQ8–15 use SDQM0/SDQS0. Tests check each byte against
the x16 lower/upper pin map ([Samsung package pinout, section 3.1](https://e2e.ti.com/cfs-file/__key/communityserver-discussions-components-files/791/DS_5F00_K4B8G1646D_5F00_MY_5F00_M_5F00_Rev1_5F00_0_2D00_0.pdf)).
OrangeCrab likewise names the lower-byte strobe RAM_UDQS and the upper-byte
strobe RAM_LDQS; its mask names follow the usual lower/upper assignment.

Each group records per-signal lengths, its minimum and maximum length, and
`skewMm = maxLengthMm - minLengthMm`. The report shows group coverage, worst
skew by group kind, and every group's base/PR delta and change. Worst-skew
summaries compare the same fully measured groups on both sides; individual
regressions remain visible even when the worst overall skew improves.

Lengths follow shortest connected wire centerlines between explicitly named
pad centers in final Circuit JSON. Wires are split at junctions and via/pad
locations; shared copper and termination/test-point stubs are not added to a
controller-to-memory path. Every terminal of each constituent electrical net
must be connected before its paths qualify. Missing copper, missing sections,
and incomplete groups produce `null`/`n/a`, never a zero-skew success. Full
groups can still be measured in an otherwise failed case if its saved copper
contains all their paths. Per-signal lengths remain in `assessment.json` and
`results.json`.

A13 sums both copper sections across each series resistor, excluding the
resistor body. A64 and STM32MP157 clock measurements start at the series
resistor's RAM-side pad because their fixtures do not retain upstream clock
copper; the group names identify this scope. Multi-receiver boards measure
each receiver separately. Via transitions connect layers but contribute zero
planar length: stackup, via barrels, passive bodies, package delays and signal
velocity are not available. These geometric length differences in **mm** are
not electrical timing skew in ps and do not establish DDR timing compliance.

Every paired report compares length matching automatically:

```sh
bun scripts/report.ts results/head/results.json results/base/results.json comparison.md
```

Increases above `0.000001 mm` (numerical tolerance) are reported as regressions;
lost or incomplete coverage cannot establish preservation. This tolerance is
not a DDR design budget. A new complete group is reported as new coverage;
it cannot establish preservation without a measured baseline. Missing fields
or groups remain unavailable. Regressions, incomplete
copper and DRC/completion outcomes remain measured results rather than report
infrastructure failures. The normal benchmark always records skew. Geometry
audit mode disables routing and records groups as unavailable; it cannot
establish length matching.

Old results remain readable. Use `reassess.ts` on copies of saved runs to add
length measurements without rerouting, using the
same new assessment revision and each run's original check-package versions.
Existing comparison rules still require matching fixture hashes, render
fingerprints, runtime, machine and budgets.

[Initial baseline for all ten fixtures](reports/skew-baseline-2026-11-23.md)
records measurements before reference routing options were applied.

## Reference routing options

[Reference-option validation and routing outcomes](reports/reference-options-2026-11-23.md).

`circuits/reference-routing-options.json` maps compatible options from each
pinned KiCad PCB/project. It is generated by `scripts/source_routing_options.py`.
Missing settings stay unset; no tolerance is supplied merely because a source
field is absent.

- A13: the RAM-side `ddr-d2` section uses its 24.74–24.94 mm window.
- i.MX6: the original class membership supplies 44–44.5 mm, 36.5–37 mm, or
  45–46 mm windows for 52 native nets, including masks, strobes and clocks.
- iCE/Pi: 42 native nets receive their source tuning windows, and its clock
  pair receives the source's symmetric 0.1 mm skew option.

Byte buses are partitioned only when their reference options differ. Other
referenced nets and pairs retain their own routing phases. Membership is
disjoint so a connection is not duplicated across option buses. The emitted
Core options are `minLength`, `maxLength` and, for the compatible pair setting,
`maxLengthSkew`. Results record the options actually used under optional
`referenceRouting`; reassessment does not assign new routing options to old
copper.

Unsupported source semantics remain explicit in the reference notes. H616's
KiCad 8 mean-relative skew rules are not rewritten as Core's maximum length
difference. Malformed predicates, offset/asymmetric skew targets, and stored
unbounded/saturated tuner targets are retained in the source audit. Core length
options are planar; source via-height settings remain recorded without a 3D
compliance claim. Unsupported multi-terminal length routing is reported as a
solver outcome rather than removing the source net's branches or limits.

Regenerate or verify these mappings with:

```sh
python3 scripts/source_routing_options.py
python3 scripts/source_routing_options.py --check
```

## Original source constraints

[Audited source findings](reports/source-skew-audit-2026-11-23.md).

Not every source provides usable skew constraints. The pinned source audit
in `provenance/source-skew.json` verifies all ten pinned PCBs plus their
project/custom-rule files against SHA-256 hashes. Every run saves that audit
under `sourceSkew` and reports it alongside the measured groups:

| Fixtures | Source declarations |
| --- | --- |
| H3, A64, STM32MP157, OrangeCrab, ButterStick | No numeric length/skew targets in the audited sources |
| A13, Glider, iCE/Pi | Per-pattern tuning targets, not global skew budgets |
| H616 | Six skew rules; three have malformed conditions |
| i.MX6 | Three DDR length ranges, one scoped skew rule, and per-pattern targets |

H616 declares 6.35 mm for its address class and 2.54 mm for each data class.
Its three cross-class rules declare 4.445/4.445/3.175 mm but contain missing
quotes. Its net-class pattern also overlaps a lower-byte net with the upper
class. These are preserved as source problems, not repaired or assigned to
every physical byte/strobe group.

i.MX6 declares 44–44.5 mm for DRAM_BANK0, 36.5–37 mm for DRAM_BANK1, 45–46 mm
for its address/command/control class, and 0.1 mm skew for the exact condition
`A.inDiffPair('DRAM_DQSL')`. The source uses an unqualified pair selector while
the fixture nets have hierarchy prefixes, so that condition is preserved
without assuming it applies to all DQS or clock pairs.

Per-pattern records preserve the net, tuning mode, rule-override state and
length/skew/delay fields. A stored `target_skew` in `single` length mode is not
treated as an active global skew constraint. Very large stored targets also
remain tuning state rather than inferred design budgets.

The benchmark measures geometric max-minus-min skew and compares revisions.
It does **not** claim native source-rule compliance: KiCad's skew definition
depends on version, and native lengths can include via height and different
pad/path semantics. The source writer version, via-height setting, severity,
raw conditions and bounds remain attached so those differences are explicit.
See [KiCad 8 rule semantics](https://docs.kicad.org/8.0/en/pcbnew/pcbnew.html#custom-design-rules)
and [KiCad length tuning](https://docs.kicad.org/8.0/en/pcbnew/pcbnew.html#length-tuning).

Regenerate or verify the audit with:

```sh
python3 scripts/source_skew.py
python3 scripts/source_skew.py --check
```

## Fixture provenance and scope

`manifest.json` records source repositories, immutable PCB commits, native
source hashes, fixture hashes and net/pad counts. `provenance/` records imported
TSX sources and extraction methods. The fixtures retain native component
positions and all copper pads on every selected component, source signal-layer
restrictions, widths, via sizes and clearances. Every render audits emitted pad
centers against the imported geometry. Actual wire segments, layer transitions
and terminals determine connected nets; isolated fanout stubs do not count.

Each circuit routes under one clearance, `rules.appliedGlobalClearance`: the
largest clearance declared for its nets, capped at the tightest clearance the
original board's own DDR copper keeps. `python3 scripts/source_clearance.py`
measures that copper for all ten boards and records it in
`provenance/source-clearance.json`;
[A13's board keeps 0.1249 mm, not its declared 0.2 mm](repros/a13-source-clearance/README.md).

Existing copper is removed. Power, VREF, ZQ and unconnected nets are excluded.
Only the DDR subsystem and touching passives are included. Irregular board
outlines use their bounding boxes. Non-circular pad shapes are represented by
their source rectangles; non-rectangular pad approximations are recorded in
source metadata. No timing, length-matching or impedance constraints are invented, and a
pass does not establish hardware DDR qualification. Source notices and licensing
status remain attached to the derived data; see LICENSE and licenses/.

The five newer fixtures can be regenerated byte-for-byte with:

```sh
python3 scripts/fetch-new-board-sources.py
python3 scripts/extract-new-boards.py
```

STMP157's importer accepts the immutable original PCB, SRJ36 sample003 and
provenance record; the other four original fixtures were imported unchanged
apart from dropping selection filters and normalizing the native net-name key.
See `provenance/imports.json` for exact paths, revisions and source hashes.

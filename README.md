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
audit, and check findings. Per-circuit directories retain Circuit JSON, phase
SRJ inputs/outputs, solver events and logs. Core may withhold all final copper
when a later phase fails; completed stage copper remains in its SRJ output and
is not counted as connectivity in the final Circuit JSON. Routing failures and
timeouts are measured results; infrastructure or validator crashes fail the
command. A complete pass requires every requested net connected and no errors.
For comparisons, the report rejects different fixture hashes, benchmark source
fingerprints, Bun versions or render budgets.

Every normal assessment also measures DDR skew for the existing 10 full fixtures:
78 memory byte, DQS, clock and address/command groups. Reports show complete-group
coverage, mean/worst skew, per-group base/PR deltas, and comparison to the original
routed copper for all 78 groups; raw results retain each
signal's pad-center path length. Incomplete paths report n/a. There is no opt-in
flag and older saved results may omit the field. Increased skew against the
original board fails matching assessment, using only 0.000001 mm rounding
tolerance, except ST P/N pairs whose raw spread is comparison-only because
AN5122 forbids independent intra-pair tuning. Original achieved skew is a preservation target, separate from a
hardware maximum. Regenerate the hash-verified baseline with KiCad's Python
(pcbnew installed): `python3 scripts/source_skew.py [--check]`.

Optional targets are extracted from each pinned original board/project into
`circuits/ddr-constraints.json`. Core receives supported error-severity windows and class
matching targets. Reports show the target, measured value and pass/fail status in narrow tables.
Signed margins and source severity remain in results.json. Error-severity target
violations fail the benchmark; source warning/ignore targets are comparison-only.
H616's KiCad 8 rules use deviation from the original class mean, checked separately
from physical byte skew. Absent optional limits stay unset. Original reference files that declare no numeric
target are distinguished from parser failures. Saturated tuner state is left
unapplied. H616's three malformed class-selector interpretations retain their
original severity but are assessed as comparison warnings, not new hard rules.
i.MX6's qualified differential pair retains its source warning severity. KiCad 9 pair rules use range skew;
saved nonzero tuning offsets are checked as signed windows, not maximum mismatch. These are planar checks, excluding via
height and package delay. Regenerate with `python3 scripts/source_constraints.py`.
ECP5 trace-matching requirements for OrangeCrab and ButterStick come from
[Lattice FPGA-TN-02038-2.1 §9, page 30](https://www.latticesemi.com/api/document/download?id=50482#page=30):
DQ/DM to the associated physical DQS conductors, DQS/clock pair matching,
inter-byte DQS and address/control to clock matching. Relative and overlapping
groups are assessed only. Glider retains UG388's P/N pair guidance and uses the
newer WP479 electrical requirements for data and command matching. Older
inter-byte DQS and DQS-to-CK limits are removed because WP479 says they are not
required for DDR3. STM32MP157's ST AN5122 requirements use the recovered AA/LFBGA448 package
workbook and complete two-section clock paths. Its original board specifies
thickness but no inner-layer stackup. Assessment bounds via depth and reports
met, exceeded, indeterminate or incomplete; uncertainty never becomes a pass.
ST P/N traces receive no independent length/skew tuner target. Pair means are
used consistently, including the inter-memory comparison.
Package data can be regenerated with `python3 scripts/source_stm32_package.py
/path/to/Memory_length_equalization_in_mm_for_STM32MP15XXAA.xls` (requires xlrd). OrangeCrab's bundled `lib/kicad-length-matching-checks/length_match.py` explicitly
defines LM1.0 as a strict 1 mm class length spread between U3 and U4. Its three
original classes are checked with their exact native-net membership. DM and DQS
members join their class's DQ routing phase, and the address/control class receives
a dedicated built-in bus-lanes phase. Physical RAM byte groups remain separate
from those original classes where the source's DQS labels differ.

Branched-net targets are assessed on controller-to-RAM paths; Core's current
bus-lanes solver cannot tune their lengths, and reports mark them assessed only.

Allwinner's H3 DDR3 layout note supplies DQ-to-DQS (50 mil), DQS/CK pair
(10 mil), DQS-to-CK (800 mil) and address/control-to-CK (600 mil) limits for
H3 and the H3-based iCE/Pi fixture. Its table does not name DQM. A64's own
layout guide supplies the 50 mil difference between corresponding RAM branches
of shared clock/address nets. NXP IMX6ULLHDG Table 21 supplies the i.MX6ULL
byte-group strategy, including signed windows relative to the shortest CK.
The generated constraints retain document URLs and PDF hashes where available.

Where a reference supplies no numeric budget for a necessary matching
relationship, the benchmark preserves that same original board's measured
DQ/DM-to-DQS, P/N or address/control-to-CK mismatch. All 78 baseline records
include individual signal lengths so these limits are reproducible. These are
original-matching targets, not manufacturer maxima. No other controller's
budget is borrowed or halved. Unverified DQS-to-CK limits on A13/A64/H616 are
removed. Series-resistor checks sum the complete signal.

Glider additionally checks WP479's endpoint delay targets (±5 ps DQ/DM-to-DQS,
±25 ps address/control-to-CK, ±2 ps DQS P/N). Its original four-layer stackup supplies dielectric
constant and copper depths for first-order TI AN905 propagation estimates.
DS162's 71 ps maximum package skew for the MIG-selected LX16-FTG256 becomes
an uncertainty interval, never a zero package offset. Unknown per-ball compensation
can therefore produce indeterminate results. Via loading, coupled meanders,
material variation, RAM package skew and preferred separate TL/stub matching
require SI analysis; these estimates do not establish timing signoff.

Every result includes a lane applicability audit: all 78 physical groups,
26 cross-byte/clock decisions, and the reset/static signals excluded from new
skew constraints. It lists native signals, applicable source checks, original
matching targets, and the reason no additional limit is imposed. The report
shows audit coverage; the full decisions remain in results.json. No opt-in flag
or separate references Markdown document is added.

Core also receives original-board skew targets and common minimum lengths for supported
point-to-point, single-section paths. These are routing goals, separate from
hardware maxima. DQ, DM and DQS join their physical byte phase; finite enforced
source strobe windows can translate relative DQ/DM limits into sufficient absolute
windows. Strobes can lengthen to the original byte's longest path while
retaining the pair's original skew. Original achieved lengths never become
maximum-length limits. Explicit source windows take priority over conflicting
minimum goals, while original skew preservation still gates assessment.
Results retain the actual windows/skew options sent to Core. Branched and
multi-section resistor paths remain assessment targets where Core cannot tune
the complete path. No optional-field validation is added.

The `benchmarkRevision` is a SHA-256 fingerprint of the benchmark's executable
source and fixtures. It works when installed as a Git dependency without a
`.git` directory. `assessmentRevision` identifies the validator source; it normally matches the render fingerprint. To validate saved copper again after a validator change without rerunning routing, use `bun scripts/reassess.ts results/baseline/results.json ../core`. This verifies fixture hashes and check-package versions, preserves render timing and timeout outcomes, and records the new assessment fingerprint separately.

The core revision, fixture hashes, runtime and machine are
recorded with every run. Core's PR workflow runs base and head on one machine
using the same trusted benchmark pin, then posts the result as a PR comment.
No ordinary push or PR CI job executes the benchmark.

PR reports use the auto-router layout: a Solver / Metric / Base / PR / Delta summary, including separate skew pass/fail/incomplete/uncertain counts. Collapsible lane and requirement tables use at most seven columns. Sources, margins, routing targets and full audit details remain in the JSON artifacts. [Paired local PR example](reports/pr-5248-local.md). Timing percentiles count failed and timed-out circuits at their configured timeout; the details retain actual wall times. Vias and wire length compare matched completed circuits.

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
source metadata. Original-matching targets are explicitly distinguished
from recovered source limits. A pass does not establish hardware DDR qualification. Source notices and licensing
status remain attached to the derived data; see LICENSE and licenses/.

The two OLIMEX fixtures also restore their omitted controller-side clock nets
with `python3 scripts/complete-series-clocks.py`; pad placements are unchanged.
The original-clock baselines sum both sections and omit resistor body length.

The five newer fixtures can be regenerated byte-for-byte with:

```sh
python3 scripts/fetch-new-board-sources.py
python3 scripts/extract-new-boards.py
```

STMP157's importer accepts the immutable original PCB, SRJ36 sample003 and
provenance record; the other four original fixtures were imported unchanged
apart from dropping selection filters and normalizing the native net-name key.
See `provenance/imports.json` for exact paths, revisions and source hashes.

# Reference routing options — 2026-11-23

The benchmark now passes compatible optional settings from the original KiCad boards/projects into Core. Missing result fields and missing reference options are accepted; old schema v1 and partial records report unavailable values rather than raising missing-field validation errors. Skew measurement still runs with the normal benchmark.

| Fixture | Applied length windows | Applied pair-skew settings |
| --- | ---: | ---: |
| h3 | 0 | 0 |
| a64 | 0 | 0 |
| stmp157 | 0 | 0 |
| orangecrab | 0 | 0 |
| a13 | 1 | 0 |
| h616 | 0 | 0 |
| butterstick | 0 | 0 |
| glider | 0 | 0 |
| imx6 | 52 | 0 |
| icepi | 42 | 1 |

A13 applies 24.74–24.94 mm only to the RAM-side ddr-d2 electrical net. i.MX6 uses the original class membership for 44–44.5 mm, 36.5–37 mm, and 45–46 mm windows, including masks, strobes and clocks. iCE/Pi applies its finite per-pattern windows to 42 native nets and its symmetric 0.1 mm clock-pair skew option. Byte groups are partitioned by their reference options; bus memberships are disjoint, and routing phase assignments are retained.

H616 mean-relative skew, malformed conditions, nonzero/asymmetric skew targets, and saturated/unbounded tuner state are retained in the source audit with notes rather than translated to a different Core setting. Source via-height options are recorded; Core bus lengths remain planar. No source-native 3D timing compliance is claimed.

Validation: 10 tests pass, TypeScript typechecking passes, all ten layouts render in geometry-only mode, both source-option generation checks pass, and legacy/partial result CLI reports exit successfully without the optional fields. The emitted source_bus rows preserve the actual configured bounds and pair skew.

| Constrained routing sample | Connected nets | Outcome |
| --- | ---: | --- |
| Allwinner A13 SBC | 24/96 | failed |
| i.MX6 Demo Board | 8/53 | failed |
| iCE/Pi CM0 SBC | 16/50 | failed |

The constrained cases expose routing limitations. A13 completes 24 requested nets before full-path geometry/matching fails. i.MX6 completes its first eight DQ routes at 44.0 mm each, then fails because Core does not support length constraints on multi-terminal buses. iCE/Pi completes 16 data nets, then its remaining routing fails. These are recorded benchmark outcomes, not rejected optional fields. Native branches and the reference limits are retained.

These runs use different routing inputs from the initial unconstrained ten-fixture baseline; they are not a same-input base/head performance comparison.

Core revision: `dfa41f9887804f8fbcf7857d2bd6fbe6e66edb31`.

Constrained render fingerprint: `sha256:2176875a7c2e7b081371495ea482b21782e4e174dc32c249541e14dadc4579e1`.

Reproduce with:

```sh
python3 scripts/source_routing_options.py --check
bun scripts/run.ts --core /path/to/core --circuit a13 --circuit imx6 --circuit icepi --out results/reference-routing
```

# Source length/skew audit — 2026-11-23

The initial skew PR defined physical measurement groups but did not import numeric source constraints. This audit records the constraints that are actually present at the ten pinned source revisions. It does not assert that every sample has a valid global skew budget.

All 24 source files (10 PCBs and 14 project/custom-rule files) were downloaded and checked against their recorded SHA-256 hashes. The PCB hashes match manifest.json. Regeneration: `python3 scripts/source_skew.py --check`. Exact file paths, conditions, bounds, tuning modes and target fields are committed in provenance/source-skew.json and saved with every schema v2 benchmark.

| Fixture | Custom DDR length/skew declarations | DDR tuning patterns | Source writer |
| --- | ---: | ---: | --- |
| [Allwinner H3 DDR3 16x1](https://github.com/hvwyl/allwinner-h3-ddr3-16x1-kicad/blob/02e365b21363a17710e0f96072c0844940495567/project/allwinner-h3.kicad_pcb) | 0 | 0 | legacy PCB format |
| [OLIMEX A64-OLinuXino rev H](https://github.com/OLIMEX/OLINUXINO/blob/85eee9c17ee13af65617d73bdd94de7ec49cfb42/HARDWARE/A64-OLinuXino/1.%20Latest%20hardware%20revision/A64-OLinuXino%20hardware%20revision%20H/A64-OlinuXino_Rev_H.kicad_pcb) | 0 | 0 | legacy PCB format |
| [OLIMEX STMP157-OLinuXino-LIME2 rev B1](https://github.com/OLIMEX/OLINUXINO/blob/85eee9c17ee13af65617d73bdd94de7ec49cfb42/HARDWARE/STMP157-OLinuXino-LIME2/1.%20Latest%20hardware%20revision/STMP157-OLinuXino-LIME2_Rev_B1/STMP157-OLinuXino-LIME2_Rev_B1.kicad_pcb) | 0 | 0 | legacy PCB format |
| [OrangeCrab rev 0.2.1 ECP5 DDR3](https://github.com/orangecrab-fpga/orangecrab-hardware/blob/c511d569fe2af39467041f888bc231020f40c6ac/hardware/orangecrab_r0.2.1/OrangeCrab.kicad_pcb) | 0 | 0 | legacy PCB format |
| [Allwinner A13 SBC](https://github.com/vd-rd/sbc_allwinner_a13/blob/8973c32c64349515da64e268cc03ea8c0789ca2a/hardware/module.kicad_pcb) | 0 | 1 | 10.0 |
| [Allwinner H616 Devboard DDR3](https://github.com/Kononenko-K/Allwinner_H616_Devboard/blob/94fe1071ff3d7c2e6a227a3e4dfccb6acae305c4/Hardware/H616_DDR3/H616_devboard.kicad_pcb) | 6 | 0 | 8.0 |
| [ButterStick r1.0](https://github.com/butterstick-fpga/butterstick-hardware/blob/0694ddfa9824a07f0c6c6981186e45f80187659c/hardware/ButterStick_r1.0/ButterStick.kicad_pcb) | 0 | 0 | legacy PCB format |
| [Glider mainboard](https://github.com/Modos-Labs/Glider/blob/ed94ef7fd95a42cfdcdaf5e5da1dcdd709122763/pcb/mainboard/pcb.kicad_pcb) | 0 | 48 | 8.0 |
| [i.MX6 Demo Board](https://github.com/ts-manuel/iMX6-Demo-Board/blob/f1a40c0f5d6fa711bb6f84a7fa0da9e89bed6def/kicad/iMX6%20Demo%20Board.kicad_pcb) | 4 | 95 | 9.0 |
| [iCE/Pi CM0 SBC](https://github.com/cheyao/icepi-sbc/blob/45037f8522e6b95649ab43772b08fe223cb87f01/hardware/cm0.kicad_pcb) | 0 | 67 | 9.0 |

H3, A64, STM32MP157, OrangeCrab and ButterStick have no numeric length/skew targets in the audited source files. This does not mean that their hardware has no timing requirements. A13, Glider and iCE/Pi have per-pattern targets without global custom length/skew rules; those targets are not generalized into budgets for every data byte.

H616 declares address-class skew of 6.35 mm, two data-class skews of 2.54 mm, and three cross-class skews of 4.445/4.445/3.175 mm. The cross-class conditions contain unterminated single-quoted names. They remain marked invalid. The source net-class expression `/DRAM/DQ[1]|[0-9]` also overlaps DQ1 with its lower-byte assignment; it is not rewritten into an assumed DQ8–15 pattern.

i.MX6 declares DRAM_BANK0 length 44–44.5 mm, DRAM_BANK1 length 36.5–37 mm, address/command/control length 45–46 mm, and 0.1 mm skew for the exact condition `A.inDiffPair('DRAM_DQSL')`. That selector omits the hierarchy prefix present on the retained nets. Its original scope and severity remain recorded; no blanket 0.1 mm limit is applied to other strobe or clock pairs.

A13 has one single-track length target of 24.84 mm (24.74–24.94 mm) on `/DDR3 Memory/ddr-d2`. Its stored ±0.1 mm skew fields are inactive in single-track length mode. Glider has 43 single-track and 5 pair-length patterns. iCE/Pi has 62 single-track, 4 pair-length and 1 pair-skew patterns. i.MX6 has 85 single-track, 6 pair-length and 4 pair-skew patterns. Large stored targets above 2000 mm are preserved as tuning state, not inferred usable design limits.

Native source-rule compliance remains unresolved. KiCad 8 defines skew relative to the mean, while newer versions use different semantics, and source length calculations can include via height and shortcuts through pads. The benchmark reports planar pad-center max-minus-min path lengths. Assigning a source number to a broader or different metric would misrepresent its meaning. See [KiCad 8 custom rules](https://docs.kicad.org/8.0/en/pcbnew/pcbnew.html#custom-design-rules) and [length tuning](https://docs.kicad.org/8.0/en/pcbnew/pcbnew.html#length-tuning).

Skew benchmarking is mandatory in schema v2: every assessed circuit must include all configured measurement groups and signal members, and every circuit must carry its source audit. A missing assessment after a render crash is reported as unavailable for every expected group. Geometry-only mode is a placement audit and cannot establish length matching. Paired reports always classify preserved/improved/regressed skew and missing coverage. Regressions remain measured outcomes rather than infrastructure failures; there is no enable switch.

# Original DDR references

These are the original design files for the exact PCB revisions in
`manifest.json`, not similar boards or generic DDR examples. The manifest pins
each original PCB by commit and SHA-256 and pins the extracted fixture separately.
The links below pin the accompanying project and schematic to the same commit.

| Fixture | Controller → memory references | Original PCB | Original project | DDR schematic |
| --- | --- | --- | --- | --- |
| h3 | U1 → DU1 | [PCB](https://github.com/hvwyl/allwinner-h3-ddr3-16x1-kicad/blob/02e365b21363a17710e0f96072c0844940495567/project/allwinner-h3.kicad_pcb) | [project](https://github.com/hvwyl/allwinner-h3-ddr3-16x1-kicad/blob/02e365b21363a17710e0f96072c0844940495567/project/allwinner-h3.kicad_pro) | [DDR](https://github.com/hvwyl/allwinner-h3-ddr3-16x1-kicad/blob/02e365b21363a17710e0f96072c0844940495567/project/DDR3_16x1.kicad_sch) |
| a64 | U1 → U2, U3 | [PCB](https://github.com/OLIMEX/OLINUXINO/blob/85eee9c17ee13af65617d73bdd94de7ec49cfb42/HARDWARE/A64-OLinuXino/1.%20Latest%20hardware%20revision/A64-OLinuXino%20hardware%20revision%20H/A64-OlinuXino_Rev_H.kicad_pcb) | [project](https://github.com/OLIMEX/OLINUXINO/blob/85eee9c17ee13af65617d73bdd94de7ec49cfb42/HARDWARE/A64-OLinuXino/1.%20Latest%20hardware%20revision/A64-OLinuXino%20hardware%20revision%20H/A64-OlinuXino_Rev_H.pro) | [DDR](https://github.com/OLIMEX/OLINUXINO/blob/85eee9c17ee13af65617d73bdd94de7ec49cfb42/HARDWARE/A64-OLinuXino/1.%20Latest%20hardware%20revision/A64-OLinuXino%20hardware%20revision%20H/A64-OlinuXino_Rev_H.sch) |
| stmp157 | U1 → U2, U3 | [PCB](https://github.com/OLIMEX/OLINUXINO/blob/85eee9c17ee13af65617d73bdd94de7ec49cfb42/HARDWARE/STMP157-OLinuXino-LIME2/1.%20Latest%20hardware%20revision/STMP157-OLinuXino-LIME2_Rev_B1/STMP157-OLinuXino-LIME2_Rev_B1.kicad_pcb) | [project](https://github.com/OLIMEX/OLINUXINO/blob/85eee9c17ee13af65617d73bdd94de7ec49cfb42/HARDWARE/STMP157-OLinuXino-LIME2/1.%20Latest%20hardware%20revision/STMP157-OLinuXino-LIME2_Rev_B1/STMP157-OLinuXino-LIME2_Rev_B1.pro) | [DDR](https://github.com/OLIMEX/OLINUXINO/blob/85eee9c17ee13af65617d73bdd94de7ec49cfb42/HARDWARE/STMP157-OLinuXino-LIME2/1.%20Latest%20hardware%20revision/STMP157-OLinuXino-LIME2_Rev_B1/STMP157-OLinuXino-LIME2_Rev_B1.sch) |
| orangecrab | U3 → U4 | [PCB](https://github.com/orangecrab-fpga/orangecrab-hardware/blob/c511d569fe2af39467041f888bc231020f40c6ac/hardware/orangecrab_r0.2.1/OrangeCrab.kicad_pcb) | [project](https://github.com/orangecrab-fpga/orangecrab-hardware/blob/c511d569fe2af39467041f888bc231020f40c6ac/hardware/orangecrab_r0.2.1/OrangeCrab.pro) | [DDR](https://github.com/orangecrab-fpga/orangecrab-hardware/blob/c511d569fe2af39467041f888bc231020f40c6ac/hardware/orangecrab_r0.2.1/DRAM.sch) |
| a13 | U100 → U200 | [PCB](https://github.com/vd-rd/sbc_allwinner_a13/blob/8973c32c64349515da64e268cc03ea8c0789ca2a/hardware/module.kicad_pcb) | [project](https://github.com/vd-rd/sbc_allwinner_a13/blob/8973c32c64349515da64e268cc03ea8c0789ca2a/hardware/module.kicad_pro) | [DDR](https://github.com/vd-rd/sbc_allwinner_a13/blob/8973c32c64349515da64e268cc03ea8c0789ca2a/hardware/sdram.kicad_sch) |
| h616 | U1 → U2 | [PCB](https://github.com/Kononenko-K/Allwinner_H616_Devboard/blob/94fe1071ff3d7c2e6a227a3e4dfccb6acae305c4/Hardware/H616_DDR3/H616_devboard.kicad_pcb) | [project](https://github.com/Kononenko-K/Allwinner_H616_Devboard/blob/94fe1071ff3d7c2e6a227a3e4dfccb6acae305c4/Hardware/H616_DDR3/H616_devboard.kicad_pro) | [DDR](https://github.com/Kononenko-K/Allwinner_H616_Devboard/blob/94fe1071ff3d7c2e6a227a3e4dfccb6acae305c4/Hardware/H616_DDR3/dram.kicad_sch) |
| butterstick | U4 → U11, U12 | [PCB](https://github.com/butterstick-fpga/butterstick-hardware/blob/0694ddfa9824a07f0c6c6981186e45f80187659c/hardware/ButterStick_r1.0/ButterStick.kicad_pcb) | [project](https://github.com/butterstick-fpga/butterstick-hardware/blob/0694ddfa9824a07f0c6c6981186e45f80187659c/hardware/ButterStick_r1.0/ButterStick.kicad_pro) | [DDR](https://github.com/butterstick-fpga/butterstick-hardware/blob/0694ddfa9824a07f0c6c6981186e45f80187659c/hardware/ButterStick_r1.0/DDR3L.kicad_sch) |
| glider | U1 → U12 | [PCB](https://github.com/Modos-Labs/Glider/blob/ed94ef7fd95a42cfdcdaf5e5da1dcdd709122763/pcb/mainboard/pcb.kicad_pcb) | [project](https://github.com/Modos-Labs/Glider/blob/ed94ef7fd95a42cfdcdaf5e5da1dcdd709122763/pcb/mainboard/pcb.kicad_pro) | [DDR](https://github.com/Modos-Labs/Glider/blob/ed94ef7fd95a42cfdcdaf5e5da1dcdd709122763/pcb/mainboard/fpga_ddr.kicad_sch) |
| imx6 | U7 → U9 | [PCB](https://github.com/ts-manuel/iMX6-Demo-Board/blob/f1a40c0f5d6fa711bb6f84a7fa0da9e89bed6def/kicad/iMX6%20Demo%20Board.kicad_pcb) | [project](https://github.com/ts-manuel/iMX6-Demo-Board/blob/f1a40c0f5d6fa711bb6f84a7fa0da9e89bed6def/kicad/iMX6%20Demo%20Board.kicad_pro) | [DDR](https://github.com/ts-manuel/iMX6-Demo-Board/blob/f1a40c0f5d6fa711bb6f84a7fa0da9e89bed6def/kicad/RAM%20DDR3.kicad_sch) |
| icepi | U1 → U2 | [PCB](https://github.com/cheyao/icepi-sbc/blob/45037f8522e6b95649ab43772b08fe223cb87f01/hardware/cm0.kicad_pcb) | [project](https://github.com/cheyao/icepi-sbc/blob/45037f8522e6b95649ab43772b08fe223cb87f01/hardware/cm0.kicad_pro) | [DDR](https://github.com/cheyao/icepi-sbc/blob/45037f8522e6b95649ab43772b08fe223cb87f01/hardware/ddr3.kicad_sch) |

ButterStick's PCB contains both U11 and U12 on a shared data bus; lengths are
measured separately to each RAM, not by summing the branched net. The linked
DDR3L sheet contains U12; the PCB supplies the definitive U11/U12 pad/net mapping.
Its FPGA-side sheet is [FPGA-DDR3L.kicad_sch](https://github.com/butterstick-fpga/butterstick-hardware/blob/0694ddfa9824a07f0c6c6981186e45f80187659c/hardware/ButterStick_r1.0/FPGA-DDR3L.kicad_sch).
i.MX6's controller sheet is [CPU.kicad_sch](https://github.com/ts-manuel/iMX6-Demo-Board/blob/f1a40c0f5d6fa711bb6f84a7fa0da9e89bed6def/kicad/CPU.kicad_sch);
iCE/Pi's is [cpu.kicad_sch](https://github.com/cheyao/icepi-sbc/blob/45037f8522e6b95649ab43772b08fe223cb87f01/hardware/cpu.kicad_sch).

## What the source actually declares

The following distinguishes custom design rules from saved interactive tuner
state. A number stored inside a single-length tuning pattern is not a global
DDR skew constraint. Missing numeric settings remain unspecified.

| Fixture | Length/skew settings in the pinned board/project |
| --- | --- |
| h3 | No custom length/skew rules or saved numeric tuning patterns found. |
| a64 | No numeric length/skew rules in the legacy project or PCB. |
| stmp157 | No numeric length/skew rules in the legacy project or PCB. |
| orangecrab | No numeric length/skew rules in the legacy project or PCB. |
| a13 | One `single` tuning pattern on `/DDR3 Memory/ddr-d2`: target 24.84 mm, range 24.74–24.94 mm. This applies to that RAM-side net, not every byte net. The pattern's stored skew range is inactive in single-length mode. |
| h616 | [Custom rules](https://github.com/Kononenko-K/Allwinner_H616_Devboard/blob/94fe1071ff3d7c2e6a227a3e4dfccb6acae305c4/Hardware/H616_DDR3/H616_devboard.kicad_dru): `DDR3_ADDR` skew max 6.35 mm; `DDR3_DATA_LB` and `DDR3_DATA_HB` max 2.54 mm. The three `INTER_CLASS_*` conditions have unterminated single-quoted class names. The project records pattern `/DRAM/DQ[1]\|[0-9]` for the upper-byte class. These class selectors are not substituted for physical RAM pin membership. |
| butterstick | No custom numeric length/skew rules or tuning patterns found; sibling `drc-rules` is empty. |
| glider | 48 saved DDR tuner patterns contain length target 2147.483647 mm and ±0.1 mm range. This saturated saved target is not a credible DDR routing budget and is not applied as one. |
| imx6 | [Custom rules](https://github.com/ts-manuel/iMX6-Demo-Board/blob/f1a40c0f5d6fa711bb6f84a7fa0da9e89bed6def/kicad/iMX6%20Demo%20Board.kicad_dru): `DRAM_BANK0` length 44–44.5 mm; `DRAM_BANK1` 36.5–37 mm; `DRAM_ADDR_CMD_CTRL` 45–46 mm. A separate 0.1 mm skew rule selects `A.inDiffPair('DRAM_DQSL')`; it is not a byte-wide rule. The PCB also has per-pattern tuner settings, which must not override class rules indiscriminately. |
| icepi | Per-pattern saved length targets include 27 ±0.1 mm on address/control signals and 20.5 ±0.1 mm on data signals. One `diff_pair_skew` pattern on `/DDR3/CLK-` stores a zero target and ±0.1 mm range. These are per-pattern settings, not a blanket 0.1 mm DDR bus limit. |

Modern projects record `use_height_for_length_calcs`; native KiCad length
calculations can include via height and pad treatment. KiCad 8's custom skew rule
is measured against a group average; this benchmark reports longest minus
shortest. See the [KiCad 8 custom-rule definition](https://docs.kicad.org/8.0/en/pcbnew/pcbnew.html#custom-design-rules).
Consequently this PR does not copy those numbers into Core's planar bus options
and claim native KiCad compliance. Routing options and fixture geometry stay as
they are on main. The change is mandatory measurement of the resulting copper,
with explicit base/PR deltas so loss of length matching is visible.

## Measurement and signal mapping

Each RAM has six groups: byte0 (8 DQ + DM + DQS±), DQS0, byte1, DQS1, clock±,
and address/command. The 10 fixtures contain 13 RAMs, hence 78 groups. Byte
membership follows the original RAM's native FBGA96 balls:

| Group | RAM native balls |
| --- | --- |
| Byte0 DQ, DM, DQS± | E3 F7 F2 F8 H3 H8 G2 H7, E7, F3 G3 |
| Byte1 DQ, DM, DQS± | D7 C3 C8 C2 A7 A2 B8 A3, D3, C7 B7 |
| Clock± | J7 K7 |

This deliberately follows the electrical endpoints rather than suffixes:
H616's `SDQM0/SDQS0` connects to the upper RAM byte and `SDQM1/SDQS1` to
the lower byte; OrangeCrab's LDQS/UDQS names are also swapped at the RAM.
Reset is asynchronous and excluded. Glider's tied chip-select is excluded
from the controller-driven address/command group.

Lengths follow the shortest connected copper centerline between the retained
pad centers, including meanders and fanout. Branch stubs and duplicate route
records do not add length. Layer changes through actual vias add no planar
length. Separate layers without a via remain disconnected. The coordinate
frame is board-world mm, +X right, +Y up, +Z above.

A13 paths sum controller-to-resistor and resistor-to-RAM copper; resistor body
delay is excluded. Its four-resistor arrays pair pins 1–8, 2–7, 3–6, 4–5.
A64 and STMP157 clock fixtures retain the RAM side of their series resistors,
so their clock-pair metric starts there. It does not claim to measure an
omitted controller-side section.

Every normal assessment runs this measurement. A group gets min/max/skew only
when all its signal paths are connected; otherwise they are null and the report
shows n/a. JSON retains the per-net lengths and coverage. Base/PR aggregates
use the same complete groups on both revisions, and reports show coverage so
a missing group cannot silently improve the average. Existing saved results
may omit the new field; no missing-field validation or opt-in flag is added.

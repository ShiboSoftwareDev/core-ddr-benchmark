# Initial DDR planar skew baseline — 2026-11-23

This historical run predates reference routing options. See the reference-options report for the current constrained inputs.

A fresh default benchmark ran all ten existing full DDR fixtures with a 120-second per-circuit render budget and no skew enable flag. Renderer: Core [`dfa41f9`](https://github.com/tscircuit/core/commit/dfa41f9887804f8fbcf7857d2bd6fbe6e66edb31). Final reporting-only changes were applied by reassessing the saved copper; render timings and outcomes are preserved under their original render fingerprint.

| Fixture | Connected nets | Complete matching groups | Worst byte skew (mm) | Worst pair skew (mm) | Address/command skew (mm) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Allwinner H3 DDR3 16x1 | 16/53 | 0/6 | n/a | n/a | n/a |
| OLIMEX A64-OLinuXino rev H | 32/75 | 0/12 | n/a | n/a | n/a |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | 72/72 | 12/12 | 10.417179 | 2.606245 | 29.337110 |
| OrangeCrab rev 0.2.1 ECP5 DDR3 | 50/50 | 6/6 | 10.270193 | 4.144254 | 24.296836 |
| Allwinner A13 SBC | 32/96 | 0/6 | n/a | n/a | n/a |
| Allwinner H616 Devboard DDR3 | 53/53 | 6/6 | 16.289933 | 3.536831 | 30.541708 |
| ButterStick r1.0 | 55/55 | 12/12 | 20.564795 | 11.515939 | 58.425779 |
| Glider mainboard | 49/49 | 6/6 | 14.249894 | 7.670581 | 22.656381 |
| i.MX6 Demo Board | 53/53 | 6/6 | 15.339259 | 3.161975 | 28.399677 |
| iCE/Pi CM0 SBC | 50/50 | 6/6 | 8.799038 | 2.633960 | 25.206526 |

54/78 matching groups are measurable. H3, A64 and A13 retain DQ copper but lack complete data/mask/strobe or control paths; their incomplete groups remain unavailable. All seven fully connected cases have measurements for every configured group. These figures establish a geometric baseline, not a passing timing target.

Validation: `bun test tests` (9 pass), `tsc --noEmit`, `python3 scripts/source_skew.py --check` (24 verified source files), the fresh ten-fixture default run, and final reassessment. CLI self-comparison always reports 54 preserved groups and 24 unavailable groups. An injected +0.25 mm group-skew regression is reported without an enable flag. Current readers accept omitted optional skew/source fields and report them as unavailable. Routing and skew regressions remain measured outcomes, not infrastructure failures.

The source audit records: five sources have no numeric targets; A13, Glider and iCE/Pi have per-pattern targets only; H616 and i.MX6 have custom rules. Raw conditions and tuning modes are preserved. Malformed H616 rules, scoped i.MX6 selectors and native length semantics prevent a blanket source-compliance claim. See [the source audit](source-skew-audit-2026-11-23.md).

Render fingerprint: `sha256:0390c116b2dd02812393f63af9036d011f3aa4cc13bd482d54770be0c7bd63d1`.

Assessment fingerprint: `sha256:58cdd7131e10b29bc54d3610097fbdadc2d7ee0f1cc261a976dbd05b8d211fdd`.

Runtime: Bun 1.4.2, darwin arm64, Apple M5 Pro. Original render budget: 120 s per circuit.

Assessment dependencies: `@tscircuit/checks@0.0.282`, `circuit-json@0.0.561`.

Reproduce a fresh run or reassess saved copper with:

```sh
bun scripts/run.ts --core /path/to/core --out results/skew
bun scripts/reassess.ts /path/to/copied-results/results.json /path/to/original-core
```

Skew uses planar copper centerlines in mm, excludes via barrels and component/package delay, and is not timing skew in ps. A13 combines copper across series resistors. A64/STM32MP157 clock paths start at the retained RAM-side series-resistor pads. Multi-receiver groups are assessed separately. H616 and OrangeCrab byte groups follow native RAM balls despite their strobe/mask naming differences.

<details>
<summary>DDR length matching (78 groups)</summary>

| Circuit | Group | Local paths | Local min–max (mm) | Local skew (mm) |
| --- | --- | ---: | ---: | ---: |
| Allwinner H3 DDR3 16x1 | DU1 byte0 | 8/11 | n/a | n/a |
| Allwinner H3 DDR3 16x1 | DU1 DQS0 | 0/2 | n/a | n/a |
| Allwinner H3 DDR3 16x1 | DU1 byte1 | 8/11 | n/a | n/a |
| Allwinner H3 DDR3 16x1 | DU1 DQS1 | 0/2 | n/a | n/a |
| Allwinner H3 DDR3 16x1 | DU1 clock | 0/2 | n/a | n/a |
| Allwinner H3 DDR3 16x1 | DU1 address/command | 0/28 | n/a | n/a |
| OLIMEX A64-OLinuXino rev H | U2 byte0 | 8/11 | n/a | n/a |
| OLIMEX A64-OLinuXino rev H | U2 DQS0 | 0/2 | n/a | n/a |
| OLIMEX A64-OLinuXino rev H | U2 byte1 | 8/11 | n/a | n/a |
| OLIMEX A64-OLinuXino rev H | U2 DQS1 | 0/2 | n/a | n/a |
| OLIMEX A64-OLinuXino rev H | U2 clock (RAM side of series resistors) | 0/2 | n/a | n/a |
| OLIMEX A64-OLinuXino rev H | U2 address/command | 0/28 | n/a | n/a |
| OLIMEX A64-OLinuXino rev H | U3 byte2 | 8/11 | n/a | n/a |
| OLIMEX A64-OLinuXino rev H | U3 DQS2 | 0/2 | n/a | n/a |
| OLIMEX A64-OLinuXino rev H | U3 byte3 | 8/11 | n/a | n/a |
| OLIMEX A64-OLinuXino rev H | U3 DQS3 | 0/2 | n/a | n/a |
| OLIMEX A64-OLinuXino rev H | U3 clock (RAM side of series resistors) | 0/2 | n/a | n/a |
| OLIMEX A64-OLinuXino rev H | U3 address/command | 0/28 | n/a | n/a |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | U2 byte0 | 11/11 | 11.254773–14.169848 | 2.915076 |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | U2 DQS0 | 2/2 | 11.254773–13.861017 | 2.606245 |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | U2 byte1 | 11/11 | 9.573149–15.123723 | 5.550574 |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | U2 DQS1 | 2/2 | 9.573149–10.055992 | 0.482843 |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | U2 clock (RAM side of series resistors) | 2/2 | 13.274872–14.435680 | 1.160808 |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | U2 address/command | 25/25 | 15.237615–44.574726 | 29.337110 |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | U3 byte2 | 11/11 | 21.346299–31.763477 | 10.417179 |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | U3 DQS2 | 2/2 | 29.700714–29.722897 | 0.022183 |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | U3 byte3 | 11/11 | 8.101219–11.163961 | 3.062742 |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | U3 DQS3 | 2/2 | 8.161880–10.232590 | 2.070711 |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | U3 clock (RAM side of series resistors) | 2/2 | 14.101218–14.554057 | 0.452839 |
| OLIMEX STMP157-OLinuXino-LIME2 rev B1 | U3 address/command | 25/25 | 22.726703–46.407821 | 23.681118 |
| OrangeCrab rev 0.2.1 ECP5 DDR3 | U4 byte0 | 11/11 | 8.795815–14.219485 | 5.423670 |
| OrangeCrab rev 0.2.1 ECP5 DDR3 | U4 UDQS (byte0) | 2/2 | 11.495125–13.245912 | 1.750788 |
| OrangeCrab rev 0.2.1 ECP5 DDR3 | U4 byte1 | 11/11 | 12.197667–22.467860 | 10.270193 |
| OrangeCrab rev 0.2.1 ECP5 DDR3 | U4 LDQS (byte1) | 2/2 | 16.246593–16.954070 | 0.707478 |
| OrangeCrab rev 0.2.1 ECP5 DDR3 | U4 clock | 2/2 | 19.843350–23.987604 | 4.144254 |
| OrangeCrab rev 0.2.1 ECP5 DDR3 | U4 address/command | 25/25 | 8.111979–32.408815 | 24.296836 |
| Allwinner A13 SBC | U200 byte0 | 8/11 | n/a | n/a |
| Allwinner A13 SBC | U200 DQS0 | 0/2 | n/a | n/a |
| Allwinner A13 SBC | U200 byte1 | 8/11 | n/a | n/a |
| Allwinner A13 SBC | U200 DQS1 | 0/2 | n/a | n/a |
| Allwinner A13 SBC | U200 clock | 0/2 | n/a | n/a |
| Allwinner A13 SBC | U200 address/command | 0/23 | n/a | n/a |
| Allwinner H616 Devboard DDR3 | U2 byte0 | 11/11 | 7.268305–15.990755 | 8.722450 |
| Allwinner H616 Devboard DDR3 | U2 DQS1 (byte0) | 2/2 | 12.453924–15.990755 | 3.536831 |
| Allwinner H616 Devboard DDR3 | U2 byte1 | 11/11 | 4.684090–20.974023 | 16.289933 |
| Allwinner H616 Devboard DDR3 | U2 DQS0 (byte1) | 2/2 | 14.224810–14.878396 | 0.653586 |
| Allwinner H616 Devboard DDR3 | U2 clock | 2/2 | 10.341861–12.532442 | 2.190581 |
| Allwinner H616 Devboard DDR3 | U2 address/command | 28/28 | 3.515669–34.057377 | 30.541708 |
| ButterStick r1.0 | U11 byte0 | 11/11 | 10.853911–18.945267 | 8.091357 |
| ButterStick r1.0 | U11 DQS0 | 2/2 | 12.187605–12.909708 | 0.722103 |
| ButterStick r1.0 | U11 byte1 | 11/11 | 8.591169–15.477773 | 6.886604 |
| ButterStick r1.0 | U11 DQS1 | 2/2 | 14.121542–15.477773 | 1.356230 |
| ButterStick r1.0 | U11 clock | 2/2 | 17.334113–18.074281 | 0.740169 |
| ButterStick r1.0 | U11 address/command | 25/25 | 12.740387–41.504803 | 28.764415 |
| ButterStick r1.0 | U12 byte0 | 11/11 | 8.728480–25.316652 | 16.588172 |
| ButterStick r1.0 | U12 DQS0 | 2/2 | 17.829607–19.238878 | 1.409271 |
| ButterStick r1.0 | U12 byte1 | 11/11 | 9.041758–29.606553 | 20.564795 |
| ButterStick r1.0 | U12 DQS1 | 2/2 | 9.041758–20.557697 | 11.515939 |
| ButterStick r1.0 | U12 clock | 2/2 | 16.468636–19.426436 | 2.957800 |
| ButterStick r1.0 | U12 address/command | 25/25 | 15.496336–73.922115 | 58.425779 |
| Glider mainboard | U12 byte0 | 11/11 | 16.312031–30.561925 | 14.249894 |
| Glider mainboard | U12 DQS0 | 2/2 | 22.891345–30.561925 | 7.670581 |
| Glider mainboard | U12 byte1 | 11/11 | 14.477716–21.519956 | 7.042239 |
| Glider mainboard | U12 DQS1 | 2/2 | 17.714351–20.022915 | 2.308564 |
| Glider mainboard | U12 clock | 2/2 | 22.160747–26.250289 | 4.089543 |
| Glider mainboard | U12 address/command | 23/23 | 15.067126–37.723507 | 22.656381 |
| i.MX6 Demo Board | U9 byte0 | 11/11 | 15.728427–31.067686 | 15.339259 |
| i.MX6 Demo Board | U9 DQS0 | 2/2 | 23.660934–24.252012 | 0.591078 |
| i.MX6 Demo Board | U9 byte1 | 11/11 | 19.313322–25.471454 | 6.158132 |
| i.MX6 Demo Board | U9 DQS1 | 2/2 | 23.715655–24.163628 | 0.447973 |
| i.MX6 Demo Board | U9 clock | 2/2 | 37.314446–40.476421 | 3.161975 |
| i.MX6 Demo Board | U9 address/command | 28/28 | 17.133937–45.533614 | 28.399677 |
| iCE/Pi CM0 SBC | U2 byte0 | 11/11 | 8.655219–15.156501 | 6.501283 |
| iCE/Pi CM0 SBC | U2 DQS0 | 2/2 | 9.513906–12.147866 | 2.633960 |
| iCE/Pi CM0 SBC | U2 byte1 | 11/11 | 8.708183–17.507221 | 8.799038 |
| iCE/Pi CM0 SBC | U2 DQS1 | 2/2 | 16.372930–17.507221 | 1.134292 |
| iCE/Pi CM0 SBC | U2 clock | 2/2 | 14.109553–14.111657 | 0.002103 |
| iCE/Pi CM0 SBC | U2 address/command | 25/25 | 10.751102–35.957628 | 25.206526 |

Per-signal lengths are retained in assessment.json and results.json. A13 sums copper on both sides of its series resistors. A64 and STM32MP157 clocks cover only the retained RAM side of their series resistors. Via barrel lengths, passive bodies, package delays and propagation velocity are excluded. These are geometric length differences, not timing skew or hardware qualification.

</details>

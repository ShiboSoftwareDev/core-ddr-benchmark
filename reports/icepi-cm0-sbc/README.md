# Routed iCE/Pi CM0 SBC

The complete generated board connects 230 of 230 multi-pad nets. KiCad 9 reports zero electrical design-rule errors, zero unconnected items and zero dangling tracks or vias. All 50 DDR controller-to-memory paths pass the 12 authored timing checks and six original skew limits. The clock pair measures 0.004855 mm of skew against the original 0.010809 mm. [Connectivity](./connectivity.json) · [Timing](./ddr-timing.json) · [Board image](./icepi-cm0-sbc-top.svg)

This run started from the full TSX placement and netlist. It removed the original routed tracks, arcs and vias, intercepted the routing phases, generated new copper and refined it with physical clearance and timing measurements. The published SDK 0.0.3300 and tscircuit main at 459f5fe stop during clock length matching on the same TSX. The integration repro preserves that behavior. [Full TSX](../../circuits/icepi-sbc.tsx) · [Core E2E repro](https://github.com/tscircuit/core/pull/5919)

Download the project, open `cm0.kicad_pro` in KiCad, or run `kicad-cli pcb drc --severity-error --exit-code-violations cm0.kicad_pcb` inside the extracted directory. The archive includes both DRC reports, all 199 footprint-library lookup warnings, the drill-spacing audit, the board license and the timing measurements. [KiCad project](./icepi-cm0-sbc-kicad.zip)

The placement, component footprints and zone design are from cheyao's open-source iCE/Pi SBC, licensed under Solderpad Hardware License v2.1. [Upstream hardware](https://github.com/cheyao/icepi-sbc/tree/45037f8522e6b95649ab43772b08fe223cb87f01/hardware) · [License](https://github.com/cheyao/icepi-sbc/blob/45037f8522e6b95649ab43772b08fe223cb87f01/LICENSE)

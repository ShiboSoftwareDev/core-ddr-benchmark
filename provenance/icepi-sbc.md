# iCE/Pi CM0 SBC

The board fixture comes from cheyao's iCE/Pi CM0 hardware, licensed under the Solderpad Hardware License v2.1. The immutable PCB and project are the inputs to the extractor. [Original PCB](https://github.com/cheyao/icepi-sbc/blob/45037f8522e6b95649ab43772b08fe223cb87f01/hardware/cm0.kicad_pcb) · [Project](https://github.com/cheyao/icepi-sbc/blob/45037f8522e6b95649ab43772b08fe223cb87f01/hardware/cm0.kicad_pro) · [License](../licenses/iCE-Pi-Solderpad-2.1.txt)

The PCB names JLC04161H-3313 as its physical stackup. The fixture selects the standard JLCPCB four-layer, nominal 1.6 mm build. The KiCad stack totals 1.59468 mm including solder mask.

The TSX places all 280 footprints on the four-layer outline. It preserves 230 multi-terminal nets, 17 named single-terminal nets and the 219 pins KiCad explicitly marks as unconnected. The first routing phase requests the 50 DDR signals with the existing 18 controller-to-memory timing constraints. Core's remaining phase owns the other 180 multi-terminal nets.

The input retains native pad geometry, drill sizes, copper layers, footprint courtyards, silkscreen, and the board's copper pour boundaries. Ten edge connector courtyards extend past the outline in the original layout. The TSX allows those footprints to overhang while keeping board-wide placement checks active. Pour outlines include higher priority regions and all 20 copper-pour keepouts. The original tracks, vias, RF trace arcs and filled zones are absent from the routing input. Nominal trace widths come from the most frequent manufactured width on each net, with the project net-class width as the fallback.

Core fills the pours using its supported clearances. Independent KiCad checks refill the original thermal and island settings. The benchmark’s DDR length metric measures planar copper between the H3 and memory terminals.

Regenerate the compressed fixture with KiCad 9's Python bindings and the two original source files together in the same directory.

```sh
python3 scripts/extract-icepi-sbc.py path/to/hardware/cm0.kicad_pcb
```

The incremental SD D3 fixture contains the 1,019 fixed PCB traces from the verified full-board routing run, including 94 standalone stitching vias. It omits the entire H3 SD D3 track. Board placement, pours, and all 18 DDR timing rules still come from the original TSX. [Verified routing run](https://github.com/ShiboSoftwareDev/core-ddr-benchmark/tree/0de6ac85719c81d3df287210e541f99d437fed00/reports/icepi-cm0-sbc)

"""Extract ST's AA/LFBGA448 package lengths, matched to original CPU balls.

Use a Python with xlrd installed and pass the original ST workbook path.
The workbook is read only; no source spreadsheet is modified or recalculated.
"""
import hashlib
import json
from pathlib import Path
import re
import sys
import xlrd

from kicad_source import ROOT, one, parse

path = Path(sys.argv[1])
raw = path.read_bytes()
assert hashlib.sha256(raw).hexdigest() == "36a4f468804060a41ad040ebb3ca6a9b8618b413d46aafab11ee2019bc683514"
workbook = xlrd.open_workbook(path)
lengths = {}
for name, signal_col, length_col in (("Address_Command", 0, 1), ("Data", 1, 2)):
    sheet = workbook.sheet_by_name(name)
    assert sheet.cell_value(0, 0) == "STM32MP15XXAA"
    for row in range(2, sheet.nrows):
        signal, length = sheet.cell_value(row, signal_col), sheet.cell_value(row, length_col)
        if signal and isinstance(length, float):
            lengths[signal] = {"mm": length, "cell": f"{name}!{chr(65 + length_col)}{row + 1}"}
lib_path = ROOT / ".source-cache/stmp157/STMP157-OLinuXino-LIME2_Rev_B1-cache.lib"
lib_raw = lib_path.read_bytes()
block = re.search(r"^DEF OLIMEX_IC_STM32MP157CAA3x .*?^ENDDEF", lib_raw.decode(), re.M | re.S)[0]
pins = {}
for line in block.splitlines():
    if not line.startswith("X DDR_"):
        continue
    _, function, ball, *_ = line.split()
    function = function.removeprefix("DDR_")
    function = re.sub(r"^(DQS\d|CLK)([PN])$", r"\1_\2", function)
    if function in lengths:
        pins[ball] = {"signal": function, **lengths[function]}
assert len(pins) == len(lengths) == 71
board = parse((ROOT / ".source-cache/stmp157/STMP157-OLinuXino-LIME2_Rev_B1.kicad_pcb").read_text())
result = {
    "package": "STM32MP15XXAA / LFBGA448", "workbookSha256": hashlib.sha256(raw).hexdigest(),
    "sourceUrl": "https://www.st.com/resource/en/hw_model/stm32mp15x-series-ddr-memory-routing-guidelines-examples.zip",
    "mirrorUrl": "https://github.com/prashant87/MP_board/blob/f4bb25a20af6a2da35cce5eac72a03aeddcc6956/STM32MP1_routing_examples/STM32MP15XXAA/Memory_length_equalization_in_mm_for_STM32MP15XXAA.xls",
    "symbolPath": "HARDWARE/STMP157-OLinuXino-LIME2/1. Latest hardware revision/STMP157-OLinuXino-LIME2_Rev_B1/STMP157-OLinuXino-LIME2_Rev_B1-cache.lib",
    "symbolSha256": hashlib.sha256(lib_raw).hexdigest(),
    "boardThicknessMm": float(one(one(board, "general"), "thickness")[0]),
    "layerDepthMm": {"top": 0, "bottom": float(one(one(board, "general"), "thickness")[0])},
    "pins": pins,
}
encoded = json.dumps({key: value for key, value in result.items() if key != "pins"}, indent=2)[:-2]
encoded += ',\n  "pins": {\n' + ",\n".join(f"    {json.dumps(ball)}: {json.dumps(value)}" for ball, value in pins.items()) + "\n  }\n}\n"
target = ROOT / "circuits/stm32-package-lengths.json"
if "--check" in sys.argv:
    assert target.read_text() == encoded
else:
    target.write_text(encoded)
print(len(pins), "ST package lengths, matched to native controller balls")

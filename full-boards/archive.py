"""Bundle the six TSX recreations, provenance, and completed routing artifacts."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import sys

root = Path(__file__).resolve().parents[1]
results = Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root/"results/plane-intent-fix"
if not results.is_dir():
    raise FileNotFoundError(f"Routing result directory does not exist: {results}")
output = results/"full-board-circuits-and-results.zip"
ids = ["orangecrab", "h616", "butterstick", "glider", "imx6", "icepi"]
files = [root/"manifest.json", root/"LICENSE", root/"scripts/kicad_source.py"]
files.extend(root/"circuits"/(board_id+".json.gz") for board_id in ids)
for folder in [root/"full-boards", root/"licenses", results]:
    files.extend(p for p in folder.rglob("*") if p.is_file()
                 and not {"node_modules","__pycache__","patched-core"}.intersection(p.parts)
                 and p.suffix not in {".zip", ".log"}
                 and p.name != "unrouted.circuit.json"
                 and not (p.name.startswith("phase-") and p.name.endswith(".srj.json")))
with ZipFile(output, "w", ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(set(files)):
        archive.write(path, path.relative_to(root))
print(f"{output}: {output.stat().st_size:,} bytes")

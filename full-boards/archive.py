"""Bundle the six TSX recreations, provenance, and completed routing artifacts."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
output = root/"results/full-board-results/full-board-circuits-and-results.zip"
ids = ["orangecrab", "h616", "butterstick", "glider", "imx6", "icepi"]
files = [root/"manifest.json", root/"LICENSE", root/"scripts/kicad_source.py"]
files.extend(root/"circuits"/(board_id+".json.gz") for board_id in ids)
for folder in [root/"full-boards", root/"licenses", root/"results/full-boards-phased", root/"results/full-boards-final", root/"results/full-board-results"]:
    files.extend(p for p in folder.rglob("*") if p.is_file() and "node_modules" not in p.parts and "__pycache__" not in p.parts and p != output)
with ZipFile(output, "w", ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(set(files)):
        archive.write(path, path.relative_to(root))
print(f"{output}: {output.stat().st_size:,} bytes")

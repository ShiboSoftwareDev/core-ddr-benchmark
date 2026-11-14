"""Download all six pinned native PCBs; verify before allowing extraction."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

root = Path(__file__).resolve().parents[1]
ids = {"orangecrab", "h616", "butterstick", "glider", "imx6", "icepi"}
boards = [b for b in json.loads((root/"manifest.json").read_text())["circuits"] if b["id"] in ids]


def fetch(board):
    origin = board["source"]
    folder = root/".source-cache"/board["id"]
    folder.mkdir(parents=True, exist_ok=True)
    for suffix, key in [(".kicad_pcb", "sourceSha256"), (".kicad_pro", "projectSha256")]:
        if key not in origin:
            continue
        path = str(Path(origin["path"]).with_suffix(suffix))
        target = folder/("board"+suffix)
        raw = target.read_bytes() if target.exists() else urlopen(f"https://raw.githubusercontent.com/{origin['repo']}/{origin['commit']}/{quote(path)}", timeout=90).read()
        if hashlib.sha256(raw).hexdigest() != origin[key]:
            raise ValueError(f"{board['id']} {suffix}: source SHA-256 mismatch")
        target.write_bytes(raw)
    return board["id"]


with concurrent.futures.ThreadPoolExecutor(6) as pool:
    for board_id in pool.map(fetch, boards):
        print("Verified", board_id)

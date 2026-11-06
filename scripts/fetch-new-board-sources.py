"""Fetch and verify the five newer DDR boards for extract-new-boards.py."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen
from kicad_source import parse

root = Path(__file__).resolve().parents[1]
boards = json.loads((root/'provenance/new-boards.json').read_text())

def fetch(board):
    folder = root/'.source-cache'/board['id']
    folder.mkdir(parents=True,exist_ok=True)
    for suffix,key in [('.kicad_pcb','sourceSha256'),('.kicad_pro','projectSha256')]:
        path = str(Path(board['path']).with_suffix(suffix))
        url = f"https://raw.githubusercontent.com/{board['repo']}/{board['commit']}/{quote(path)}"
        target = folder/('board'+suffix)
        raw = target.read_bytes() if target.exists() else urlopen(url,timeout=90).read()
        if hashlib.sha256(raw).hexdigest() != board[key]:
            raise ValueError(f"{board['id']}: {suffix} hash mismatch")
        target.write_bytes(raw)
        if suffix == '.kicad_pcb':
            (folder/'parsed.json').write_text(json.dumps(parse(raw.decode())))
    return board['id']

for board_id in concurrent.futures.ThreadPoolExecutor(5).map(fetch,boards):
    print('Verified',board_id)

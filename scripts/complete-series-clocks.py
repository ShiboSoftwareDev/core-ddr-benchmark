"""Restore the two omitted controller-side clock nets in each OLIMEX fixture.

Existing placements/pads stay unchanged. Native KiCad board-world points use
mm, +X right and +Y down; only net membership and source widths are copied.
Run after the original importers, then regenerate source_skew.py.
"""
import gzip
import hashlib
import json
from pathlib import Path
import sys

from kicad_source import ROOT, components, many, one, parse

manifest = json.loads((ROOT / "manifest.json").read_text())
for case in manifest["circuits"]:
    refs = {"a64": ("R3", "R4"), "stmp157": ("R2", "R3")}.get(case["id"])
    if not refs:
        continue
    path = ROOT / case["file"]
    source = case["source"]
    raw = (ROOT / ".source-cache" / case["id"] / Path(source["path"]).name).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == source["sourceSha256"]
    board = parse(raw.decode())
    native = components(board)
    fixture = json.loads(gzip.decompress(path.read_bytes()))
    cpu = next(part for part in native if part["ref"] == "U1")

    def selector(ref, number):
        part = next(part for part in fixture["parts"] if part["name"] == ref)
        pad = next(pad for pad in part["pads"] if pad["nativePin"] == number)
        return f".{ref} > .{pad['pin']}"

    for ref in refs:
        resistor = next(part for part in native if part["ref"] == ref)
        for pad in many(resistor["node"], "pad"):
            net = one(pad, "net")
            cpu_pad = next((pad for pad in many(cpu["node"], "pad") if one(pad, "net") == net), None)
            if cpu_pad is None or any(trace["nativeNet"] == net[1] for trace in fixture["traces"]):
                continue
            widths = [float(one(segment, "width")[0]) for segment in many(board, "segment") if one(segment, "net") == net[:1]]
            fixture["traces"].append({"name": f"DDR_clock_controller_{ref}", "nativeNet": net[1], "path": [selector("U1", cpu_pad[1]), selector(ref, pad[1])], "width": min(widths), "group": "remaining"})
    for metadata in (fixture["source"], source):
        metadata["nets"] = len(fixture["traces"])
        metadata["terminals"] = sum(len(trace["path"]) for trace in fixture["traces"])
        note = "Controller-side clock resistor nets restored from the same immutable PCB; full clock paths sum both copper sections and omit resistor body length."
        metadata["notes"] = list(dict.fromkeys(metadata.get("notes", []) + [note]))
    encoded = gzip.compress(json.dumps(fixture, separators=(",", ":")).encode(), compresslevel=9, mtime=0)
    if "--check" in sys.argv:
        assert path.read_bytes() == encoded, case["id"]
    else:
        path.write_bytes(encoded)
    case["nets"] = len(fixture["traces"])
    case["sha256"] = hashlib.sha256(encoded).hexdigest()
    print(case["id"], case["nets"], "DDR nets including complete series clock paths")
encoded = json.dumps(manifest, indent=2) + "\n"
if "--check" in sys.argv:
    assert (ROOT / "manifest.json").read_text() == encoded
else:
    (ROOT / "manifest.json").write_text(encoded)

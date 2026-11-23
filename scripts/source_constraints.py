"""Extract optional DDR targets from the exact manifest PCB/project revisions.

python3 scripts/source_constraints.py [--check]
No hardware budgets are inferred for missing, malformed or unbounded settings.
"""
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import urlopen

from kicad_source import ROOT, many, one, parse

manifest = json.loads((ROOT / "manifest.json").read_text())
target = ROOT / "circuits/ddr-constraints.json"
previous = json.loads(target.read_text())
pairs = json.loads(subprocess.check_output(["bun", "-e", """
import {getDdrSkewGroups} from './scripts/ddr-skew';
import {readFileSync} from 'node:fs'; import {gunzipSync} from 'node:zlib';
const m=JSON.parse(readFileSync('manifest.json','utf8'));
console.log(JSON.stringify(Object.fromEntries(m.circuits.map(c=>[c.id,getDdrSkewGroups(JSON.parse(gunzipSync(readFileSync(c.file)).toString())).filter(g=>g.signals.length===2).map(g=>g.signals.map(s=>s.name))]))));
"""], cwd=ROOT))
result = {}
for circuit in manifest["circuits"]:
    cid, source = circuit["id"], circuit["source"]
    files, constraints, notes = {}, [], []

    def read(path, optional=False):
        if optional and path not in previous.get(cid, {}).get("files", {}):
            return None
        cache = ROOT / ".source-cache" / cid / Path(path).name
        if not cache.exists():
            try:
                raw = urlopen(f"https://raw.githubusercontent.com/{source['repo']}/{source['commit']}/{quote(path)}", timeout=30).read()
            except HTTPError as error:
                if optional and error.code == 404:
                    return None
                raise
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(raw)
        raw = cache.read_bytes()
        sha = hashlib.sha256(raw).hexdigest()
        expected = source["sourceSha256"] if path == source["path"] else previous.get(cid, {}).get("files", {}).get(path)
        if expected:
            assert sha == expected, (cid, path)
        files[path] = sha
        return raw.decode()

    fixture = json.loads(gzip.decompress((ROOT / circuit["file"]).read_bytes()))
    nets = {trace["nativeNet"] for trace in fixture["traces"]}
    board = parse(read(source["path"]))
    stem = source["path"].removesuffix(".kicad_pcb")
    project_text = read(stem + ".kicad_pro", True)
    if project_text is None:
        read(stem + ".pro", True)
    project = json.loads(project_text) if project_text else {}
    settings = project.get("net_settings", {})
    severities = project.get("board", {}).get("design_settings", {}).get("rule_severities", {})
    assignments = settings.get("netclass_assignments") or {}

    def netclass(net):
        assigned = assignments.get(net)
        if assigned:
            return assigned[0] if isinstance(assigned, list) else assigned
        # KiCad 8 CTX_NETCLASS tries anchored regex and wildcard patterns,
        # then uses the first matching assignment (not physical byte names).
        for entry in settings.get("netclass_patterns", []):
            pattern = entry["pattern"]
            wildcard = re.escape(pattern).replace(r"\*", ".*").replace(r"\?", ".")
            if re.match("^" + pattern + "$", net) or re.fullmatch(wildcard, net):
                return entry["netclass"]

    custom_lengths = set()
    dru_path = stem + ".kicad_dru"
    rules = read(dru_path, True)
    if cid == "butterstick":
        dru_path = str(Path(stem).parent / "drc-rules")
        rules = read(dru_path)
    for rule in many(parse("(rules\n" + (rules or "") + "\n)"), "rule"):
        condition = one(rule, "condition", [""])[0]
        for constraint in many(rule, "constraint"):
            if constraint[1] not in ("length", "skew") or not re.search("DDR|DRAM|BYTE", rule[1] + condition, re.I):
                continue
            match = re.fullmatch(r"A.NetClass == '([^']+)'", condition)
            members = sorted(net for net in nets if match and netclass(net) == match[1])
            if not members:
                notes.append(f"{rule[1]}: source condition is malformed or selects no retained class; not applied.")
                continue
            bounds = {key: float(one(constraint, key)[0].removesuffix("mm")) for key in ("min", "max") if one(constraint, key)}
            options = {"minLength": bounds["min"]} if "min" in bounds else {}
            if "max" in bounds:
                options["maxLength" if constraint[1] == "length" else "maxLengthSkew"] = bounds["max"]
            if constraint[1] == "skew":
                options["skewReference"] = "mean"
            severity = one(rule, "severity", [severities.get(constraint[1] + "_out_of_range", "error")])[0]
            constraints.append({"name": rule[1], "nets": members, "sourcePath": dru_path, "severity": severity, **options})
            if constraint[1] == "length":
                custom_lengths.update(members)

    windows = {}
    saturated = False
    for pattern in many(board, "generated"):
        if one(pattern, "type") != ["tuning_pattern"]:
            continue
        net = one(pattern, "last_netname", [""])[0]
        if net not in nets or one(pattern, "is_time_domain") == ["yes"]:
            continue
        mode = one(pattern, "tuning_mode", [""])[0]
        pair = next((pair for pair in pairs[cid] if net in pair), [net])
        if mode == "diff_pair_skew":
            low = float(one(pattern, "target_skew_min", ["nan"])[0])
            high = float(one(pattern, "target_skew_max", ["nan"])[0])
            if low == -high and one(pattern, "target_skew", ["0"]) == ["0"] and len(pair) == 2:
                constraints.append({"name": net + " pair", "nets": pair, "sourcePath": source["path"], "severity": severities.get("skew_out_of_range", "error"), "maxLengthSkew": high})
            else:
                notes.append(net + ": offset/asymmetric tuner skew is not a maximum pair mismatch; not applied.")
            continue
        if mode not in ("single", "diff_pair"):
            continue
        if one(pattern, "target_length") in (["2147.483647"], ["1000000"]):
            saturated = True
            continue
        bounds = {prop: float(one(pattern, field)[0]) for prop, field in (("minLength", "target_length_min"), ("maxLength", "target_length_max")) if one(pattern, field)}
        for member in pair if mode == "diff_pair" else [net]:
            if member not in custom_lengths or one(pattern, "override_custom_rules") == ["yes"]:
                windows.setdefault(member, []).append(bounds)
    grouped = {}
    for net, candidates in windows.items():
        if candidates and candidates[0] and all(candidate == candidates[0] for candidate in candidates):
            grouped.setdefault(tuple(candidates[0].items()), []).append(net)
    for bounds, members in grouped.items():
        constraints.append({"name": "Saved length target " + str(len(constraints) + 1), "nets": sorted(members), "sourcePath": source["path"], "severity": severities.get("length_out_of_range", "error"), **dict(bounds)})
    if saturated:
        notes.append("Unbounded/saturated saved tuner length targets are not routing limits.")
    result[cid] = {"files": files, "constraints": constraints, "notes": list(dict.fromkeys(notes))}
encoded = json.dumps(result, indent=2) + "\n"
if "--check" in sys.argv:
    assert target.read_text() == encoded, "Regenerate circuits/ddr-constraints.json"
else:
    target.write_text(encoded)
for cid, data in result.items():
    print(cid, len(data["constraints"]), "reference constraints")

"""Map compatible optional KiCad reference settings to Core bus options.

Keep missing options unset. Preserve unsupported declarations in source-skew.json
and explain them here rather than changing their scope or skew definition.
"""
import gzip
import json
from pathlib import Path
import re
import sys

from source_skew import load_verified

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "circuits/reference-routing-options.json"


def bounds(fields):
    return {name: float(fields[key]) for name, key in (
        ("minLength", "target_length_min"), ("maxLength", "target_length_max")
    ) if key in fields}


def map_options(circuit_id, audit, groups):
    fixture = json.loads(gzip.decompress((ROOT / "circuits" / f"{circuit_id}.json.gz").read_bytes()))
    traces = {trace["nativeNet"]: trace for trace in fixture["traces"]}
    net_options, pair_options, notes = {}, [], []
    projects = [file for file in audit["files"] if file["path"].endswith(".kicad_pro")]
    assignments = {}
    if projects:
        project = json.loads(load_verified(circuit_id, audit, projects[0]))
        assignments = project.get("net_settings", {}).get("netclass_assignments") or {}
    custom_lengths = {}
    for rule in audit["constraints"]:
        if rule["status"] != "declared":
            notes.append(f"{rule['name']}: preserve malformed reference condition without applying it")
            continue
        if rule["kind"] == "skew":
            notes.append(f"{rule['name']}: retain the exact reference selector and skew semantics; no blanket maxLengthSkew translation")
            continue
        match = re.fullmatch(r"A.NetClass == '([^']+)'", rule["condition"])
        if not match:
            notes.append(f"{rule['name']}: selector has no direct Core bus mapping")
            continue
        options = {name: float(rule["bounds"][key].removesuffix("mm")) for name, key in (
            ("minLength", "min"), ("maxLength", "max")
        ) if key in rule["bounds"]}
        for net in traces:
            classes = assignments.get(net, [])
            if isinstance(classes, str):
                classes = [classes]
            if match[1] in classes:
                custom_lengths[net] = options
    net_options.update({traces[net]["name"]: options for net, options in custom_lengths.items()})
    length_candidates = {}
    for pattern in audit["tuningPatterns"]:
        fields, net = pattern["fields"], pattern["net"]
        mode = fields.get("tuning_mode")
        if fields.get("is_time_domain") == "yes":
            notes.append(f"{net}: time-domain target retained without converting delay to length")
            continue
        if mode == "diff_pair_skew":
            # Core's maxLengthSkew represents a symmetric difference around
            # zero. Do not convert an offset or asymmetric skew target.
            low, high = fields.get("target_skew_min"), fields.get("target_skew_max")
            if low is None or high is None or float(low) != -float(high) or float(fields.get("target_skew", "0")) != 0:
                notes.append(f"{net}: non-symmetric skew target retained without approximation")
                continue
            pair = next((group for group in groups if group["kind"] == "differential_pair" and net in group["signals"]), None)
            if pair:
                pair_nets = [sections[0][0] for sections in pair["signals"].values() if len(sections) == 1]
                if len(pair_nets) == 2:
                    mapped = {"name": pair["name"], "nets": pair_nets, "maxLengthSkew": float(high)}
                    if mapped not in pair_options:
                        pair_options.append(mapped)
            continue
        if mode not in ("single", "diff_pair"):
            continue
        if net in custom_lengths and fields.get("override_custom_rules") != "yes":
            continue
        # These exact stored values are disabled/unbounded tuner state, not
        # useful nominal DDR route lengths. Keep the raw fields in the audit.
        if fields.get("target_length") in ("2147.483647", "1000000"):
            continue
        options = bounds(fields)
        members = [net]
        if mode == "diff_pair":
            pair = next((group for group in groups if group["kind"] == "differential_pair" and net in group["signals"]), None)
            if pair:
                members = list(pair["signals"])
        for member in members:
            length_candidates.setdefault(member, []).append(options)
    for net, candidates in length_candidates.items():
        if all(options == candidates[0] for options in candidates):
            if candidates[0]:
                net_options[traces[net]["name"]] = candidates[0]
        else:
            notes.append(f"{net}: differing per-pattern windows retained without selecting a global replacement")
    if audit["useHeightForLengthCalcs"]:
        notes.append("Reference includes via height; Core bus length options use planar pad-center lengths. Numeric settings are retained; native 3D compliance is not asserted.")
    if any(pattern["fields"].get("target_length") in ("2147.483647", "1000000") for pattern in audit["tuningPatterns"]):
        notes.append("Disabled/unbounded stored tuner lengths remain in the source audit and are not made into routing targets.")
    return {"netOptions": net_options, "pairOptions": pair_options, "notes": list(dict.fromkeys(notes))}


if __name__ == "__main__":
    audits = json.loads((ROOT / "provenance/source-skew.json").read_text())
    groups = json.loads((ROOT / "circuits/skew-groups.json").read_text())
    mapped = {circuit_id: map_options(circuit_id, audit, groups[circuit_id]) for circuit_id, audit in audits.items()}
    encoded = json.dumps(mapped, indent=2) + "\n"
    if "--check" in sys.argv:
        if TARGET.read_text() != encoded:
            raise SystemExit("Reference routing options are stale; run python3 scripts/source_routing_options.py")
    else:
        TARGET.write_text(encoded)
    for circuit_id, options in mapped.items():
        print(circuit_id, len(options["netOptions"]), "net windows,", len(options["pairOptions"]), "pair skew options")

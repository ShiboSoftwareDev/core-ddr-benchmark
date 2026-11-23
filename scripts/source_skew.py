"""Audit numeric DDR declarations in pinned project, rule and PCB source files.

Preserve custom-rule conditions and per-pattern targets verbatim. Do not turn
inactive tuning fields into global skew limits or silently repair invalid rules.
This is a source audit, not a KiCad DRC emulator or a source-compliance claim.

    python3 scripts/source_skew.py
    python3 scripts/source_skew.py --check
"""
import gzip
import hashlib
import json
from pathlib import Path
import sys
from urllib.parse import quote
from urllib.request import urlopen

from kicad_source import many, one, parse

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "provenance/source-skew.json"


def load_verified(circuit_id, source, file):
    cache = ROOT / ".source-cache" / circuit_id / Path(file["path"]).name
    if not cache.exists():
        url = f"https://raw.githubusercontent.com/{source['repo']}/{source['commit']}/{quote(file['path'])}"
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(urlopen(url, timeout=90).read())
    raw = cache.read_bytes()
    if hashlib.sha256(raw).hexdigest() != file["sha256"]:
        raise ValueError(f"{circuit_id}: source hash mismatch: {file['path']}")
    return raw.decode()


def audit(circuit_id, source):
    fixture = json.loads(gzip.decompress((ROOT / "circuits" / f"{circuit_id}.json.gz").read_bytes()))
    native_nets = {trace["nativeNet"] for trace in fixture["traces"]}
    constraints, patterns = [], []
    use_height = None
    board_version, generator_version = None, None
    severities = {}
    for file in source["files"]:
        text = load_verified(circuit_id, source, file)
        path = file["path"]
        if path.endswith(".kicad_pro"):
            project = json.loads(text)
            settings = project.get("board", {}).get("design_settings", {})
            use_height = settings.get("rules", {}).get("use_height_for_length_calcs")
            severities = {kind: settings.get("rule_severities", {}).get(f"{kind}_out_of_range") for kind in ("length", "skew")}
        elif path.endswith(".kicad_dru") or Path(path).name == "drc-rules":
            rules = parse("(rules\n" + text + "\n)")
            for rule in many(rules, "rule"):
                condition = one(rule, "condition", [""])[0]
                for constraint in many(rule, "constraint"):
                    if constraint[1] not in ("length", "skew"):
                        continue
                    if not any(word in (rule[1] + condition).upper() for word in ("DDR", "DRAM", "BYTE")):
                        continue
                    constraints.append({
                        "name": rule[1], "kind": constraint[1], "condition": condition,
                        "bounds": {key: one(constraint, key)[0] for key in ("min", "opt", "max") if one(constraint, key)},
                        "status": "invalid_condition" if condition.count("'") % 2 else "declared",
                        "sourcePath": path,
                    })
        elif path.endswith(".kicad_pcb"):
            board = parse(text)
            board_version = one(board, "version", [None])[0]
            generator_version = one(board, "generator_version", [None])[0]
            for pattern in many(board, "generated"):
                if one(pattern, "type") != ["tuning_pattern"]:
                    continue
                net = one(pattern, "last_netname", [""])[0]
                if net not in native_nets:
                    continue
                # Preserve the tuning mode: single-track length mode does not
                # activate the pattern's stored default target_skew fields.
                fields = {key: one(pattern, key)[0] for key in (
                    "tuning_mode", "is_time_domain", "override_custom_rules",
                    "target_length", "target_length_min", "target_length_max",
                    "target_skew", "target_skew_min", "target_skew_max",
                    "target_delay", "target_delay_min", "target_delay_max",
                    "last_status",
                ) if one(pattern, key)}
                patterns.append({"net": net, "sourcePath": path, "fields": fields})
    notes = [
        "Audited the pinned PCB, project and sibling custom-rule files listed here; absence is not a hardware timing qualification.",
        "Rule conditions, bounds and pattern modes are preserved, not generalized to the benchmark's 78 physical matching groups.",
        "Source-rule compliance is unresolved: the benchmark measures planar pad-center paths; KiCad may include via height, pad shortcuts and version-specific skew semantics.",
    ]
    if circuit_id == "h616":
        notes.append("INTER_CLASS_1/2/3 have unterminated single-quoted class names. No automatic repair or effective-rule claim is made.")
        notes.append("The source high-byte class pattern /DRAM/DQ[1]|[0-9] overlaps DQ1's lower-byte assignment; do not replace it with an assumed DQ8-15 selector.")
    if circuit_id == "imx6":
        notes.append("Diff Pair Skew uses the unqualified selector DRAM_DQSL while retained nets have a hierarchy prefix. Preserve the selector; do not assume it applies to every DQS or clock pair.")
    if any(float(pattern["fields"].get("target_length", "0")) > 2000 for pattern in patterns):
        notes.append("Some stored pattern targets are above 2000 mm; preserve them as stored tuning state rather than inventing a usable global DDR budget.")
    return {
        **source, "status": "custom_rules" if constraints else "pattern_targets" if patterns else "no_numeric_targets",
        "useHeightForLengthCalcs": use_height,
        "boardFileVersion": board_version, "generatorVersion": generator_version,
        "ruleSeverities": severities,
        "constraints": constraints, "tuningPatterns": patterns, "notes": notes,
    }


if __name__ == "__main__":
    sources = json.loads((ROOT / "provenance/source-skew-files.json").read_text())
    result = {circuit_id: audit(circuit_id, source) for circuit_id, source in sources.items()}
    encoded = json.dumps(result, indent=2) + "\n"
    if "--check" in sys.argv:
        if TARGET.read_text() != encoded:
            raise SystemExit("Source skew audit is stale; run python3 scripts/source_skew.py")
    else:
        TARGET.write_text(encoded)
    for circuit_id, source in result.items():
        print(circuit_id, source["status"], len(source["constraints"]), "rules,", len(source["tuningPatterns"]), "DDR patterns")

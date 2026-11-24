"""Extract optional DDR targets from the exact manifest PCB/project revisions.

python3 scripts/source_constraints.py [--check]
Engineering supplements are explicitly labelled; optional source fields stay optional.
"""
import gzip
import configparser
import hashlib
import json
import math
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
original = json.loads((ROOT / "circuits/ddr-skew-reference.json").read_text())
groups = json.loads(subprocess.check_output(["bun", "-e", """
import {getDdrSkewGroups} from './circuits/ddr-signals';
import {readFileSync} from 'node:fs'; import {gunzipSync} from 'node:zlib';
const m=JSON.parse(readFileSync('manifest.json','utf8'));
console.log(JSON.stringify(Object.fromEntries(m.circuits.map(c=>[c.id,getDdrSkewGroups(JSON.parse(gunzipSync(readFileSync(c.file)).toString()))]))));
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
    legacy = configparser.ConfigParser(strict=False, interpolation=None)
    if project_text is None:
        legacy.read_string("[project]\n" + (read(stem + ".pro", True) or ""))
        checker = "lib/kicad-length-matching-checks/length_match.py" if cid == "orangecrab" else None
        if checker:
            read(checker)
        # OrangeCrab's bundled checker explicitly defines LMxxx in mm and
        # tests max(lengths) - min(lengths) < xxx between U3 and U4.
        for section in legacy.sections():
            name = legacy.get(section, "Name", fallback="")
            tolerance = re.search(r"(^|_)LM([0-9.]+)($|_)", name)
            if "Netclasses/" in section and tolerance:
                members = [net for cls in many(board, "net_class") if cls[1] == name for net in (item[1] for item in many(cls, "add_net")) if net in nets]
                if members and checker:
                    constraints.append({"name": name, "nets": sorted(members), "sourcePath": checker, "severity": "error", "maxLengthSkew": float(tolerance[2]), "skewComparison": "lt", "memoryRef": "U4"})
                elif members:
                    notes.append(f"Legacy class {name} selects {len(members)} retained nets; the project supplies no numeric length/skew field or unit for its LM suffix. Intent unresolved; not assumed unconstrained.")
                else:
                    notes.append(f"Legacy class {name} has no assigned retained nets; no target is created for an empty class.")
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
            correction = None
            # The H616 source has three unterminated class literals and uses
            # B for a net-length rule evaluated on A. Preserve the original
            # expression and explicitly repair its named class union.
            union = re.fullmatch(r"A.NetClass == '([^']+)' \|\| B.NetClass == '([^']+)", condition)
            if cid == "h616" and union:
                members = sorted(net for net in nets if netclass(net) in union.groups())
                correction = " || ".join(f"A.NetClass == '{name}'" for name in union.groups())
            pair_selector = re.fullmatch(r"A.inDiffPair\('([^']+)'\)", condition)
            if pair_selector:
                # KiCad matches the full hierarchical pair name. The i.MX6
                # source uses a unique leaf name: qualify that selector,
                # recording the repair rather than silently selecting all pairs.
                pair_groups = [group for group in groups[cid] if len(group["signals"]) == 2 and all(re.sub(r"_?[PN]$", "", signal["name"].rsplit("/", 1)[-1]) == pair_selector[1] for signal in group["signals"])]
                if len(pair_groups) == 1:
                    members = [signal["name"] for signal in pair_groups[0]["signals"]]
                    full_pair = re.sub(r"_?[PN]$", "", members[0])
                    correction = f"A.inDiffPair('{full_pair}')"
            if not members:
                notes.append(f"{rule[1]}: source condition is malformed or selects no retained class; not applied.")
                continue
            bounds = {key: float(one(constraint, key)[0].removesuffix("mm")) for key in ("min", "max") if one(constraint, key)}
            options = {"minLength": bounds["min"]} if "min" in bounds else {}
            if "max" in bounds:
                options["maxLength" if constraint[1] == "length" else "maxLengthSkew"] = bounds["max"]
            if constraint[1] == "skew" and one(board, "generator_version", ["8"])[0].startswith("8"):
                options["skewReference"] = "mean"
            if correction:
                options.update(sourceCondition=condition, appliedCondition=correction)
                if union:
                    options["assessmentOnly"] = True
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
        pair = next(([signal["name"] for signal in group["signals"]] for group in groups[cid] if len(group["signals"]) == 2 and net in [signal["name"] for signal in group["signals"]]), [net])
        if mode == "diff_pair_skew":
            low = float(one(pattern, "target_skew_min", ["nan"])[0])
            high = float(one(pattern, "target_skew_max", ["nan"])[0])
            if low == -high and one(pattern, "target_skew", ["0"]) == ["0"] and len(pair) == 2:
                constraints.append({"name": net + " pair", "nets": pair, "sourcePath": source["path"], "severity": severities.get("skew_out_of_range", "error"), "maxLengthSkew": high})
            elif len(pair) == 2 and low <= high:
                # KiCad's skew placer measures selected path minus coupled
                # path, not absolute mismatch. Preserve that signed window;
                # never reinterpret a 43 mm offset as a 43 mm max mismatch.
                constraints.append({"name": net + " signed skew target", "nets": [net, next(member for member in pair if member != net)], "sourcePath": source["path"], "severity": severities.get("skew_out_of_range", "error"), "skewReference": "signed_pair", "minSignedSkew": low, "targetSignedSkew": float(one(pattern, "target_skew", ["0"])[0]), "maxSignedSkew": high})
            else:
                notes.append(net + ": tuner skew has no usable bounded differential-pair target; not applied.")
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
    if not constraints:
        notes.append("The pinned reference files declare no numeric DDR length/skew target. No hardware maximum is inferred from an absent optional field; original-copper preservation is benchmarked separately.")
    if cid == "stmp157":
        notes.append("ST AN5122 package + via + PCB constraints are assessed separately using the AA/LFBGA448 workbook and complete series-clock paths. The original board supplies total thickness but no inner-layer stackup, so via depth is bounded rather than guessed: https://www.st.com/resource/en/application_note/dm00462392-stm32mp1-series-ddr-memory-routing-guidelines-stmicroelectronics.pdf")
    if cid in ("orangecrab", "butterstick", "glider"):
        # ECP5: page 30 of Lattice FPGA-TN-02038-2.1, PDF SHA-256
        # 7b32b411d44a9b585972ea43583c9000fdb596f5322e4c9c5f3182591c44feae.
        # Spartan-6 MCB: UG388 v2.3 page 42, explicit PCB distances in mil.
        url = "https://www.xilinx.com/support/documentation/user_guides/ug388.pdf#page=42" if cid == "glider" else "https://www.latticesemi.com/api/document/download?id=50482#page=30"
        document = "UG388 v2.3 page 42" if cid == "glider" else "FPGA-TN-02038-2.1 page 30"
        def guideline(name, nets, maximum, references=None, assessment_only=False):
            constraint = {"name": name, "memoryRef": name.split()[0], "nets": nets, "sourcePath": document, "sourceUrl": url, "severity": "error", "maxLengthSkew": maximum}
            if references:
                constraint.update(skewReference="references", referenceNets=references)
            if assessment_only:
                constraint["assessmentOnly"] = True
            constraints.append(constraint)
        for offset in range(0, len(groups[cid]), 6):
            byte0, dqs0, byte1, dqs1, clock, address = groups[cid][offset:offset+6]
            names = lambda group: [signal["name"] for signal in group["signals"]]
            for byte, dqs in ((byte0, dqs0), (byte1, dqs1)):
                if cid != "glider":
                    guideline(byte["name"] + " DQ/DM to DQS (§9.2)", names(byte), 1.27, names(dqs), True)
                guideline(dqs["name"] + (" pair (UG388)" if cid == "glider" else " pair (§9.7)"), names(dqs), 0.254)
            guideline(clock["name"] + (" pair (UG388)" if cid == "glider" else " pair (§9.11)"), names(clock), 0.254)
            if cid != "glider":
                guideline(clock["name"].split()[0] + " inter-byte DQS (§9.9)", names(dqs0) + names(dqs1), 2.54, assessment_only=True)
                guideline(address["name"] + " to CK (§9.10)", names(address) + names(clock), 2.54, names(clock), True)
        if cid == "glider":
            notes.append("Use WP479's newer DDR3 endpoint-delay requirements for DQ/DM and address/control, replacing the older UG388 planar equivalents. WP479 p3/p11 explicitly removes DQS-to-CK and inter-byte DQS matching; neither is imposed. Retain UG388's 10 mil P/N PCB pair guidance, with WP479's additional 2 ps DQS-pair checks. Delay assessment uses the original stackup and bounded FPGA package skew; it is an estimate, not SI signoff.")
        else:
            notes.append("ECP5 guide §9 checks trace matching against both strobe/clock conductors. Relative and overlapping inter-group requirements are assessed only; Core has no equivalent reference-net tuning option. Via-count/stackup and non-skew hardware requirements are outside these planar checks.")
    if cid in ("h3", "icepi"):
        # Allwinner H3_REF_DDR3_16X2_V1_0, Layout Note p2 §5.
        # The x16 byte rules also apply to a single retained RAM. DQM is not
        # named by this table; a separate engineering target covers it below.
        url = "https://files.catbox.moe/xzy0h1.pdf#page=2"
        def h3_rule(name, members, maximum, references=None):
            rule = {"name": name, "memoryRef": name.split()[0], "nets": members, "sourcePath": "H3_REF_DDR3_16X2_V1_0 Layout Note page 2 section 5", "sourceUrl": url, "sourceSha256": "4fcf5c17d72cf39ed0a46362f1a5ab66b5d7ea4369c25acda480baad970ac50a", "severity": "error", "maxLengthSkew": maximum}
            if references:
                rule.update(skewReference="references", referenceNets=references, assessmentOnly=True)
            constraints.append(rule)
        for offset in range(0, len(groups[cid]), 6):
            byte0, dqs0, byte1, dqs1, clock, address = groups[cid][offset:offset+6]
            names = lambda group: [signal["name"] for signal in group["signals"]]
            for byte, dqs in ((byte0, dqs0), (byte1, dqs1)):
                h3_rule(byte["name"] + " DQ to DQS (Allwinner)", names(byte)[:8] + names(dqs), 1.27, names(dqs))
                h3_rule(dqs["name"] + " pair (Allwinner)", names(dqs), 0.254)
            h3_rule(clock["name"] + " pair (Allwinner)", names(clock), 0.254)
            h3_rule(clock["name"].split()[0] + " DQS to CK (Allwinner)", names(dqs0) + names(dqs1) + names(clock), 20.32, names(clock))
            h3_rule(address["name"] + " to CK (Allwinner)", names(address) + names(clock), 15.24, names(clock))
        notes.append("Allwinner H3 DDR3 layout note p2 supplies 50 mil DQ-to-DQS, 800 mil DQS-to-CK, 600 mil address/control-to-CK, and 10 mil differential-pair limits. Its DQ table does not name DQM; a separate engineering requirement covers mask matching. These planar projections do not certify the guide's equal-via-count/vertical-length requirements.")
    if cid == "a64":
        # Shared controller-side copper cancels when comparing the two RAM
        # endpoints of the SAME net. Never compare unrelated address nets.
        for suffix, page in (("clock", 20), ("address/command", 21)):
            memories = [group for group in groups[cid] if group["name"].endswith(" " + suffix)]
            shared = sorted(set(signal["name"] for signal in memories[0]["signals"]) & set(signal["name"] for signal in memories[1]["signals"]))
            constraints.append({"name": "U2/U3 " + suffix + " branch matching (Allwinner)", "nets": shared, "memoryRefs": ["U2", "U3"], "skewReference": "memory_endpoints", "maxLengthSkew": 1.27, "skewComparison": "lt", "assessmentOnly": True, "severity": "error", "sourcePath": f"A64 PCB Layout Guide V1.0 page {page}", "sourceUrl": "https://www.scribd.com/document/473702324/A64-PCB-Layout-Guide-V1-0-pdf"})
        notes.append("Allwinner A64 PCB Layout Guide V1.0 pp20–21 requires the two shared clock/address branch lengths to differ by less than 50 mil. Assessment compares U2 and U3 paths of each shared net, so their common trunk cancels. This is not a within-byte tolerance.")
    if cid == "imx6":
        byte0, dqs0, byte1, dqs1, clock, address = groups[cid]
        names = lambda group: [signal["name"] for signal in group["signals"]]
        clocks = names(clock)
        controls = [net for net in names(address) if re.search(r"DRAM_(CLK_EN|ODT|CS)", net)]
        commands = [net for net in names(address) if net not in controls]
        def nxp_rule(name, members, **options):
            constraints.append({"name": name, "nets": members, "memoryRef": "U9", "sourcePath": "IMX6ULLHDG Rev 0 Table 21 page 23", "sourceUrl": "https://manuals.plus/m/363c0e56b9f86b62dfc0829ff6f9baf299076b3c6ccfc6a1dbf065da1b9dcd23.pdf#page=23", "sourceSha256": "05f66fd4940f17fcf36db64f6e46026202cf7a7c4e883f3cf6e2ff27927287c4", "severity": "error", **options})
        nxp_rule("U9 clock (NXP)", clocks, maxLengthSkew=0.127, maxLength=50.8)
        for byte, dqs in ((byte0, dqs0), (byte1, dqs1)):
            nxp_rule(byte["name"] + " spread (NXP)", names(byte), maxLengthSkew=0.635)
            nxp_rule(dqs["name"] + " pair (NXP)", names(dqs), maxLengthSkew=0.254)
            nxp_rule(byte["name"] + " no longer than CK (NXP)", names(byte) + clocks, lengthReference="shortest", referenceNets=clocks, maxLength=0, assessmentOnly=True)
        for name, members, maximum in (("address/command", commands, 0.635), ("control", controls, 1.27)):
            nxp_rule("U9 " + name + " spread (NXP)", members, maxLengthSkew=maximum)
            nxp_rule("U9 " + name + " to shortest CK (NXP)", members + clocks, lengthReference="shortest", referenceNets=clocks, minLength=-5.08, maxLength=0, assessmentOnly=True)
        notes.append("NXP IMX6ULLHDG Rev 0 Table 21 byte-group strategy: 2 inch clock maximum; 5 mil CK pair, 10 mil DQS pair, 25 mil byte/address and 50 mil control matching. Use a conservative full-spread interpretation of the ± matching figures. Address/control must be 0–200 mil shorter than the shortest CK; bytes must not exceed it. The alternative all-signals-to-clock strategy is not combined with this one.")
    if cid in ("a13", "a64", "h616", "h3", "icepi"):
        # Fill necessary matching relationships from this board's measured
        # original copper, never by borrowing another controller's budget.
        def preserve_matching(name, members, references=None):
            memory = name.split()[0]
            signals = [signal for group in groups[cid] if group["name"].startswith(memory + " ") for signal in group["signals"] if signal["name"] in members]
            lengths = {net: length for group, values in original[cid]["groups"].items() if group.startswith(memory + " ") for net, length in values["lengthsMm"].items()}
            selected = [lengths[net] for net in members]
            maximum = max(abs(lengths[net] - lengths[ref]) for net in members if net not in references for ref in references) if references else max(selected) - min(selected)
            maximum = (math.ceil(maximum * 1_000_000) + 1) / 1_000_000
            rule = {"name": name, "nets": members, "memoryRef": memory, "basis": "original_matching", "pathBasis": "full_signal", "sourcePath": source["path"], "sourceSha256": source["sourceSha256"], "severity": "error", "maxLengthSkew": maximum, "derivation": "Benchmark preservation target measured from this exact original board's complete signal paths; not a manufacturer maximum. Includes 0.000001 mm measurement rounding allowance."}
            if references:
                rule.update(skewReference="references", referenceNets=references, assessmentOnly=True)
            elif any(len(signal["sections"]) != 1 for signal in signals):
                rule["assessmentOnly"] = True
            constraints.append(rule)
        for offset in range(0, len(groups[cid]), 6):
            byte0, dqs0, byte1, dqs1, clock, address = groups[cid][offset:offset+6]
            names = lambda group: [signal["name"] for signal in group["signals"]]
            for byte, dqs in ((byte0, dqs0), (byte1, dqs1)):
                if cid in ("h3", "icepi"):
                    preserve_matching(byte["name"] + " DM to DQS (original matching)", [names(byte)[8]] + names(dqs), names(dqs))
                else:
                    preserve_matching(byte["name"] + " DQ/DM to DQS (original matching)", names(byte), names(dqs))
                    preserve_matching(dqs["name"] + " pair (original matching)", names(dqs))
            if cid not in ("h3", "icepi"):
                preserve_matching(clock["name"] + " pair (original matching)", names(clock))
                preserve_matching(address["name"] + " to CK (original matching)", names(address) + names(clock), names(clock))
        notes.append("Necessary DQ/DM-to-DQS, P/N and address/control-to-CK relationships without published numeric budgets use this board's original measured mismatch as benchmark preservation targets. No half-H3 budgets, cross-byte equalization or unverified DQS-to-CK rule is added. All original vendor/project requirements remain separate. Full paths sum both sides of series resistors.")
    for constraint in constraints:
        if cid == "h616" and constraint.get("appliedCondition"):
            constraint.update(sourceSeverity=constraint["severity"], severity="warning", derivation="Comparison-only interpretation of a malformed source selector. Preserve its numeric target and named class union, but do not turn a rule the original project could not apply into a new hard requirement.")
    constraints = list({json.dumps(constraint, sort_keys=True): constraint for constraint in constraints}.values())
    result[cid] = {"files": files, "constraints": constraints, "notes": list(dict.fromkeys(notes))}
    if cid == "glider":
        # Source distances are scalar depths below the top copper center in
        # board-world mm (+X right, +Y up, +Z above; right handed).
        stackup = one(one(board, "setup"), "stackup")
        stack_layers = many(["stackup"] + stackup, "layer")
        layers, depth = {}, 0.0
        names = {"F.Cu": "top", "In1.Cu": "inner1", "In2.Cu": "inner2", "B.Cu": "bottom"}
        copper = [layer for layer in stack_layers if layer[1] in names or layer[1].startswith("dielectric")]
        first_center = float(one(copper[0], "thickness")[0]) / 2
        for layer in copper:
            thickness = float(one(layer, "thickness")[0])
            if layer[1] in names:
                layers[names[layer[1]]] = round(depth + thickness / 2 - first_center, 7)
            depth += thickness
        result[cid]["delayModel"] = {
            "boardSourceUrl": f"https://github.com/{source['repo']}/blob/{source['commit']}/{source['path']}",
            "boardSha256": source["sourceSha256"], "layerDepthMm": layers,
            "epsilonR": float(one(next(layer for layer in copper if layer[1].startswith("dielectric")), "epsilon_r")[0]),
            "formulaSourceUrl": "https://www.ti.com/lit/an/snla035/snla035.pdf#page=6",
            "requirementSourceUrl": "https://docs.amd.com/api/khub/documents/iXwsrzNOW6nx7qC93WOpcQ/content#page=10",
            "packageSourceUrl": "https://docs.amd.com/api/khub/documents/5xGMdRIxMi0ioQ1azGBsvQ/content#page=82",
            "deviceBasis": "XC6SLX16-FTG256 from the source Caster MIG project (2f714ab7c217e6441c46cfd647764d9a74967aec); the PCB symbol names only XC6SLX-FTG256",
            "packageSkewPs": 71,
        }
encoded = json.dumps(result, indent=2) + "\n"
if "--check" in sys.argv:
    assert target.read_text() == encoded, "Regenerate circuits/ddr-constraints.json"
else:
    target.write_text(encoded)
for cid, data in result.items():
    print(cid, len(data["constraints"]), "DDR checks")

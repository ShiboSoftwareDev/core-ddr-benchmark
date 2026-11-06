import gzip
import collections
import fnmatch
import hashlib
import json
import math
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).parent))
from kicad_source import components, many, one


def extract(board):
    folder = ROOT / ".source-cache" / board["id"]
    tree = json.loads((folder / "parsed.json").read_text())
    reference = json.loads((ROOT / board["referenceFile"]).read_text())
    net_names = {n[1]: n[2] for n in many(tree, "net")}

    def net_name(node):
        value = one(node, "net")
        if not value or value[0] == "0":
            return None
        return net_names.get(value[0], value[-1])

    copper_layers = [l for l in one(tree, "layers") if l[2] in ["signal", "power", "mixed"]]
    layer_map = {}
    for index, layer in enumerate(copper_layers):
        name = f"inner{index}"
        if index == 0:
            name = "top"
        if index == len(copper_layers) - 1:
            name = "bottom"
        layer_map[layer[1]] = name
    cs = components(tree)
    memory = next(c for c in cs if c["ref"] == board["memoryRef"])
    memories = [memory] + [c for c in cs if c["ref"] != board["memoryRef"] and c["value"] == memory["value"]]
    signal_nets = set()
    data_groups = {}
    for memory_index, memory_part in enumerate(memories):
        for pad in many(memory_part["node"], "pad"):
            signal = " ".join(one(pad, "pinfunction", []))
            name = net_name(pad)
            if not name or re.search(r"VDD|VSS|VREF|ZQ|\bNC\b", signal, re.I):
                continue
            if re.search(r"VREF|ZQ|GND|VDD|VCC|unconnected", name, re.I) or name.startswith("+"):
                continue
            signal_nets.add(name)
            if re.fullmatch(r"DQ[UL]?\d+", signal):
                byte = 1 if pad[1][0] in "ABCD" else 0
                data_groups[name] = f"byte{2 * memory_index + byte}"
    for connection in reference["connections"]:
        signal_nets.add(connection["sourcePath"]["controllerSideNet"])
        signal_nets.add(connection["sourcePath"]["memorySideNet"])

    endpoints = collections.defaultdict(list)
    for component in cs:
        for pad in many(component["node"], "pad"):
            name = net_name(pad)
            if name in signal_nets:
                endpoints[name].append((component["ref"], pad[1]))
    signal_nets = {name for name in signal_nets if len(set(endpoints[name])) >= 2}
    involved = {board["memoryRef"], board["controllerRef"]}
    involved.update(ref for name in signal_nets for ref, pin in endpoints[name])
    selected = [c for c in cs if c["ref"] in involved]

    project = json.loads((folder / "board.kicad_pro").read_text())
    settings = project["net_settings"]
    classes = {c["name"]: c for c in settings["classes"]}
    default = classes["Default"]

    def net_rule(name, key):
        assigned = settings.get("netclass_assignments") or {}
        class_name = assigned.get(name, "Default")
        if isinstance(class_name, list):
            class_name = class_name[0]
        for pattern in settings.get("netclass_patterns", []):
            if fnmatch.fnmatchcase(name, pattern["pattern"]):
                class_name = pattern["netclass"]
                break
        return classes[class_name].get(key, default[key])

    widths = collections.defaultdict(collections.Counter)
    for segment in many(tree, "segment"):
        if net_name(segment) in signal_nets:
            widths[net_name(segment)][float(one(segment, "width")[0])] += 1
    vias = [v for v in many(tree, "via") if net_name(v) in signal_nets]
    if not vias:
        raise ValueError("No manufactured DDR via geometry")
    via_pad = min(float(one(v, "size")[0]) for v in vias)
    via_hole = min(float(one(v, "drill")[0]) for v in vias)
    clearance = max(net_rule(name, "clearance") for name in signal_nets)

    edges = []
    for key in ["gr_line", "gr_arc", "gr_rect", "gr_poly"]:
        for shape in many(tree, key):
            if one(shape, "layer") != ["Edge.Cuts"]:
                continue
            for key2 in ["start", "end", "mid", "center"]:
                p = one(shape, key2)
                if p:
                    edges.append((float(p[0]), -float(p[1])))
            for pts in many(shape, "pts"):
                edges.extend((float(p[1]), -float(p[2])) for p in many(pts, "xy"))
    if not edges:
        raise ValueError("No Edge.Cuts found")
    bounds = {"minX": min(p[0] for p in edges), "maxX": max(p[0] for p in edges), "minY": min(p[1] for p in edges), "maxY": max(p[1] for p in edges)}
    cx = (bounds["minX"] + bounds["maxX"]) / 2
    cy = (bounds["minY"] + bounds["maxY"]) / 2
    parts = []
    native_pads = []
    pin_aliases = {}
    approximations = collections.Counter()
    for component in selected:
        fp = component["node"]
        at = component["at"]
        rotation = float(at[2]) if len(at) > 2 else 0
        angle = math.radians(rotation)
        part = {"name": component["ref"], "value": component["value"], "x": float(at[0]) - cx, "y": -float(at[1]) - cy, "rotation": rotation, "layer": layer_map[one(fp, "layer")[0]], "pads": [], "pinLabels": {}}
        for pad in many(fp, "pad"):
            pad_layers = one(pad, "layers", [])
            if not any(l in layer_map or l in ["*.Cu", "F&B.Cu"] for l in pad_layers):
                continue
            pa = one(pad, "at", ["0", "0"])
            size = one(pad, "size")
            if not size:
                raise ValueError("Pad without size")
            px, py = map(float, pa[:2])
            native_pin = pad[1]
            pin = ""
            if native_pin:
                alias_key = (component["ref"], native_pin)
                if alias_key not in pin_aliases:
                    pin_aliases[alias_key] = f"pin{len(part['pinLabels']) + 1}"
                pin = pin_aliases[alias_key]
                part["pinLabels"][pin] = [f"BALL_{native_pin}"]
            shape = pad[3]
            if shape not in ["circle", "rect"]:
                approximations[shape] += 1
            data = {"pin": pin, "nativePin": native_pin, "kind": pad[2], "x": px, "y": py, "width": float(size[0]), "height": float(size[1]), "shape": shape, "rotation": float(pa[2]) if len(pa) > 2 else 0, "sourceNet": net_name(pad)}
            drill = one(pad, "drill")
            if drill:
                if drill[0] == "oval":
                    raise ValueError("Oval drill requires an exact footprint")
                data["drill"] = float(drill[0])
            part["pads"].append(data)
            native_pads.append({"part": part["name"], "pin": pin, "nativePin": native_pin, "x": float(at[0]) + px * math.cos(angle) + py * math.sin(angle) - cx, "y": -float(at[1]) + px * math.sin(angle) - py * math.cos(angle) - cy, "width": data["width"], "height": data["height"], "rotation": data["rotation"], "layer": part["layer"]})
        parts.append(part)

    for connection in reference["connections"]:
        if connection["group"] != "data":
            continue
        ball = connection["memory"]["ball"]
        group = "byte1" if ball[0] in "ABCD" else "byte0"
        for side in ["memorySideNet", "controllerSideNet"]:
            data_groups[connection["sourcePath"][side]] = group
    traces = []
    for index, name in enumerate(sorted(signal_nets)):
        width = net_rule(name, "track_width")
        if widths[name]:
            width = widths[name].most_common(1)[0][0]
        traces.append({"name": f"DDR_{index:03}", "nativeNet": name, "width": width, "path": [f".{ref} > .{pin_aliases[(ref, pin)]}" for ref, pin in sorted(set(endpoints[name]))], "group": data_groups.get(name, "remaining"), "sourceWidthCounts": dict(widths[name])})
    output = {**board, "width": bounds["maxX"] - bounds["minX"], "height": bounds["maxY"] - bounds["minY"], "bounds": bounds, "coordinateOffset": {"x": cx, "y": cy}, "layers": len(copper_layers), "nativeLayers": copper_layers, "signalLayers": [layer_map[l[1]] for l in copper_layers if l[2] != "power"], "rules": {"appliedGlobalClearance": clearance, "viaPad": via_pad, "viaDrill": via_hole, "widths": sorted({t["width"] for t in traces})}, "parts": parts, "traces": traces, "nativePads": native_pads, "padApproximations": dict(approximations), "scope": "Native DDR subsystem: all pads on controller, RAM and every component touching a selected DDR signal. Existing copper removed. Power, VREF, ZQ and unconnected nets excluded. Original board edge bounding box. Per-net modal manufactured track widths and smallest manufactured DDR via size; project clearance. No timing constraints invented."}
    output.pop("referenceFile", None)
    (ROOT / "circuits" / (board["id"] + ".json.gz")).write_bytes(gzip.compress((json.dumps(output, separators=(",", ":")) + "\n").encode(), mtime=0))
    print(board["id"], len(traces), "signals", len(native_pads), "pads", len(parts), "parts", output["layers"], "layers", output["rules"], collections.Counter(t["group"] for t in traces))


for board in json.loads((ROOT / "provenance/new-boards.json").read_text()):
    extract(board)

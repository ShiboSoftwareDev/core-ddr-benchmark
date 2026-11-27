"""Extract the complete, unrouted iCE/Pi PCB. Run with KiCad 9's pcbnew module.

Usage: python3 scripts/extract-icepi-sbc.py path/to/hardware/cm0.kicad_pcb
Place the original cm0.kicad_pro beside the PCB. Coordinates are board-world mm
(+X right, +Y up), with footprint-local pad centers measured from each anchor.
"""

import base64
from collections import Counter, defaultdict
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys

import pcbnew as pcb
from kicad_source import ROOT, components, many, one, parse

SOURCE_HASH = "430a3b232c9b6e8219fbd726fc47128079de88286b93ab543ed676d9634188c1"
PROJECT_HASH = "9e60a9fbd0f16d2d2ee73039ab8ebc801579cd1280c9705d12305779e76606ad"
LAYER_NAMES = {
    pcb.F_Cu: "top",
    pcb.In1_Cu: "inner1",
    pcb.In2_Cu: "inner2",
    pcb.B_Cu: "bottom",
}


def checked_source(path, digest):
    contents = path.read_bytes()
    if hashlib.sha256(contents).hexdigest() != digest:
        raise ValueError(f"Unexpected revision of {path.name}")
    return contents


def relative_point(position, origin):
    return {"x": pcb.ToMM(position.x - origin.x), "y": pcb.ToMM(origin.y - position.y)}


def ring_points(chain, origin):
    return [relative_point(point, origin) for point in chain.CPoints()]


def net_selector_name(name):
    # Core net selectors only allow identifier characters. Preserve polarity.
    name = name.lstrip("/").replace("~{", "N_")
    if name.startswith("+"):
        name = "VCC_" + name[1:]
    if name.endswith(("+", "-")):
        name = name[:-1] + ("_P" if name.endswith("+") else "_N")
    return re.sub(r"[^A-Za-z0-9_]+", "_", name).strip("_")


def extract_footprint(component, footprint, center, board_outline, net_pins):
    footprint.BuildCourtyardCaches()
    courtyard = footprint.GetCourtyard(
        pcb.B_CrtYd if footprint.IsFlipped() else pcb.F_CrtYd
    )
    overhang = pcb.SHAPE_POLY_SET(courtyard)
    overhang.BooleanSubtract(board_outline)
    anchor = footprint.GetPosition()
    pads_by_uuid = {pad.m_Uuid.AsString(): pad for pad in footprint.Pads()}
    native_pads = many(component["node"], "pad")
    numbers = list(dict.fromkeys(str(p[1]) for p in native_pads if p[1]))
    pins = {number: f"pin{i + 1}" for i, number in enumerate(numbers)}
    pad_labels = {pin: [f"PAD_{number}"] for number, pin in pins.items()}
    pin_sites = {}
    pads = []
    no_connect = []
    for native_pad in native_pads:
        pad = pads_by_uuid[one(native_pad, "uuid")[0]]
        number = pad.GetNumber()
        pin = pins.get(number)
        if pin:
            # KiCad assigns the net to each separate land, including connector shields.
            sites = pin_sites.setdefault(number, {})
            position = (pad.GetPosition().x, pad.GetPosition().y)
            if position not in sites:
                if sites:
                    pin = f"pin{len(pad_labels) + 1}"
                    pad_labels[pin] = [f"PAD_{number}_{len(sites) + 1}"]
                sites[position] = pin
            pin = sites[position]
        copper_layers = pad.GetLayerSet().CuStack()
        kind = native_pad[2] if copper_layers else "paste_only"
        size = pad.GetSize()
        land = {
            **relative_point(pad.GetPosition(), anchor),
            "width": pcb.ToMM(size.x),
            "height": pcb.ToMM(size.y),
            "ccwRotationDegrees": pad.GetOrientationDegrees(),
            "kind": kind,
            "shape": native_pad[3],
            "pin": pin,
            "number": number,
            "hasPaste": pad.IsOnLayer(pcb.F_Paste) or pad.IsOnLayer(pcb.B_Paste),
            "hasMaskOpening": pad.IsOnLayer(pcb.F_Mask) or pad.IsOnLayer(pcb.B_Mask),
        }
        if native_pad[3] == "roundrect":
            land["roundRadius"] = pcb.ToMM(pad.GetRoundRectCornerRadius())
        if kind in ("np_thru_hole", "thru_hole"):
            drill = pad.GetDrillSize()
            assert pad.GetOffset().x == 0 and pad.GetOffset().y == 0
            land.update(holeWidth=pcb.ToMM(drill.x), holeHeight=pcb.ToMM(drill.y))
        if kind == "paste_only":
            assert not pin and pad.IsOnLayer(pcb.F_Paste)
        if pin and "no_connect" in pad.GetPinType().split("+"):
            if pin not in no_connect:
                no_connect.append(pin)
        elif pin and pad.GetNetname():
            selector = f".{component['ref']} > .{pin}"
            if selector not in net_pins[pad.GetNetname()]:
                net_pins[pad.GetNetname()].append(selector)
        pads.append(land)
    return {
        "name": component["ref"],
        "value": component["value"],
        "footprint": component["footprint"],
        **relative_point(anchor, center),
        "layer": "bottom" if footprint.IsFlipped() else "top",
        "allowOffBoard": component["ref"].startswith("J")
        and overhang.OutlineCount() > 0,
        "pads": pads,
        "noConnect": no_connect,
        "pinLabels": pad_labels,
        "courtyards": [
            ring_points(courtyard.COutline(i), anchor)
            for i in range(courtyard.OutlineCount())
        ],
    }


def extract_pours(board, board_outline, center, selector_names):
    zones, pours = list(board.Zones()), []
    for zone in zones:
        if zone.GetIsRuleArea():
            assert zone.GetDoNotAllowCopperPour()
            assert not any(
                (
                    zone.GetDoNotAllowTracks(),
                    zone.GetDoNotAllowVias(),
                    zone.GetDoNotAllowPads(),
                    zone.GetDoNotAllowFootprints(),
                )
            )
            continue
        for layer in zone.GetLayerSet().CuStack():
            boundary = pcb.SHAPE_POLY_SET(zone.Outline())
            boundary.BooleanIntersection(board_outline)
            for other in zones:
                if not other.GetLayerSet().Contains(layer):
                    continue
                if other.GetIsRuleArea() or (
                    other.GetNetCode() != zone.GetNetCode()
                    and other.GetAssignedPriority() > zone.GetAssignedPriority()
                ):
                    boundary.BooleanSubtract(other.Outline())
            # Core accepts a single outline. Fracture the boolean result so its
            # internal pour keepouts survive without becoming track obstacles.
            boundary.Fracture()
            for i in range(boundary.OutlineCount()):
                pours.append(
                    {
                        "selectorName": selector_names[zone.GetNetname()],
                        "layer": LAYER_NAMES[layer],
                        "outline": ring_points(boundary.COutline(i), center),
                        "clearance": pcb.ToMM(zone.GetLocalClearance()),
                    }
                )
    return pours


def extract_silkscreen(board, layer, board_bounds):
    # Store physical ink outlines from KiCad (including the original footprint artwork).
    # The SVG viewBox uses KiCad world mm, +X right, +Y down, with its origin at the board's upper left.
    inks = pcb.SHAPE_POLY_SET()
    for footprint in board.GetFootprints():
        footprint.TransformFPShapesToPolySet(
            inks, layer, 0, pcb.FromMM(0.005), pcb.ERROR_INSIDE, True, True
        )
    for drawing in board.GetDrawings():
        if drawing.GetLayer() == layer:
            drawing.TransformShapeToPolygon(
                inks, layer, 0, pcb.FromMM(0.005), pcb.ERROR_INSIDE
            )
    # Each graphic owns one outline. Core stores the source SVG on each output
    # face, so a board-sized SVG would repeat both silk layers hundreds of times.
    graphics = []
    for i in range(inks.OutlineCount()):
        outer = inks.COutline(i)
        box = outer.BBox()
        origin = box.GetOrigin()
        width, height = pcb.ToMM(box.GetWidth()), pcb.ToMM(box.GetHeight())
        if not width or not height:
            continue
        paths = []
        for chain in [outer] + [inks.CHole(i, h) for h in range(inks.HoleCount(i))]:
            points = [
                f"{pcb.ToMM(p.x - origin.x):.4f} {pcb.ToMM(p.y - origin.y):.4f}"
                for p in chain.CPoints()
            ]
            if len(points) > 2:
                paths.append("M" + "L".join(points) + "Z")
        if not paths:
            continue
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}"><path fill-rule="evenodd" d="{"".join(paths)}"/></svg>'
        graphics.append(
            {
                **relative_point(box.Centre(), board_bounds.Centre()),
                "width": width,
                "height": height,
                "layer": "top" if layer == pcb.F_SilkS else "bottom",
                "svg": base64.b64encode(svg.encode()).decode(),
            }
        )
    return graphics


def main(path):
    layout = parse(checked_source(path, SOURCE_HASH).decode())
    project = json.loads(checked_source(path.with_suffix(".kicad_pro"), PROJECT_HASH))
    board = pcb.LoadBoard(str(path))
    bounds = board.GetBoardEdgesBoundingBox()
    center = bounds.Centre()
    outline = pcb.SHAPE_POLY_SET()
    assert board.GetBoardPolygonOutlines(outline) and outline.OutlineCount() == 1
    net_pins = defaultdict(list)
    parts = [
        extract_footprint(
            c, board.FindFootprintByReference(c["ref"]), center, outline, net_pins
        )
        for c in components(layout)
    ]
    net_widths = defaultdict(Counter)
    for segment in many(layout, "segment") + many(layout, "arc"):
        net_widths[one(segment, "net")[0]][float(one(segment, "width")[0])] += 1
    ddr = json.loads(gzip.decompress((ROOT / "circuits/icepi.json.gz").read_bytes()))
    ddr_names = {trace["nativeNet"]: trace["name"] for trace in ddr["traces"]}
    names = {
        name: ddr_names.get(name, net_selector_name(name))
        for _, _, name in many(layout, "net")
        if name
    }
    assert len(set(names.values())) == len(names)
    nets = [
        {
            "name": name,
            "selectorName": names[name],
            "pins": net_pins[name],
            "width": net_widths[number].most_common(1)[0][0]
            if net_widths[number]
            else project["net_settings"]["classes"][0]["track_width"],
        }
        for _, number, name in many(layout, "net")
        if net_pins.get(name)
    ]
    assert all(
        set(trace["path"]) == set(net_pins[trace["nativeNet"]])
        for trace in ddr["traces"]
    )
    result = {
        "parts": parts,
        "outline": ring_points(outline.COutline(0), center),
        "nets": nets,
        "pours": extract_pours(board, outline, center, names),
        "silkscreens": [
            graphic
            for layer in (pcb.F_SilkS, pcb.B_SilkS)
            for graphic in extract_silkscreen(board, layer, bounds)
        ],
        "rules": project["board"]["design_settings"]["rules"],
    }
    (ROOT / "circuits/icepi-sbc.json.gz").write_bytes(
        gzip.compress(json.dumps(result, separators=(",", ":")).encode(), mtime=0)
    )
    print(
        f"{len(parts)} footprints, {sum(len(p['pads']) for p in parts)} pads, {sum(len(n['pins']) > 1 for n in nets)} multi-pad nets"
    )


if __name__ == "__main__":
    main(Path(sys.argv[1]))

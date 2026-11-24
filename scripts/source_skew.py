"""Measure the original routed PCBs, not stored tuner targets.

Run with KiCad's Python (pcbnew installed) and Bun on PATH. Native KiCad points
are integer nm, +X right/+Y down. Distances are planar mm; vias add no depth.
Exact arc lengths, pad-center approaches, branches and native layer spans are
included. Source files are verified against manifest.json before loading.
"""
import gzip
import hashlib
import heapq
import json
import math
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import quote
from urllib.request import urlopen

import pcbnew

ROOT = Path(__file__).resolve().parents[1]
IU = 1_000_000


def point(position, layer):
    return (position.x, position.y, layer)


def net_graph(board, net):
    graph, segments, arcs, vias, radii = {}, [], [], [], {}

    def node(p):
        graph.setdefault(p, {})
        return p

    def link(a, b, length):
        node(a); node(b)
        graph[a][b] = min(graph[a].get(b, math.inf), length)
        graph[b][a] = min(graph[b].get(a, math.inf), length)

    for track in board.GetTracks():
        if track.GetNetname() != net:
            continue
        if isinstance(track, pcbnew.PCB_VIA):
            vias.append(track)
            layers = list(track.GetLayerSet().CuStack())
            for layer in layers:
                radii[point(track.GetPosition(), layer)] = track.GetWidth(layer) / 2
                link(point(track.GetPosition(), layers[0]), point(track.GetPosition(), layer), 0)
        else:
            a, b = node(point(track.GetStart(), track.GetLayer())), node(point(track.GetEnd(), track.GetLayer()))
            for p in (a, b):
                radii[p] = max(radii.get(p, 0), track.GetWidth() / 2)
            if isinstance(track, pcbnew.PCB_ARC):
                arcs.append((a, point(track.GetMid(), track.GetLayer()), b, track.GetLength() / IU))
            else:
                segments.append((a, b, track.GetWidth() / 2))
    pads = [pad for footprint in board.GetFootprints() for pad in footprint.Pads() if pad.GetNetname() == net]
    for pad in pads:
        for layer in pad.GetLayerSet().CuStack():
            node(point(pad.GetPosition(), layer))
    # A pad or via may touch the middle of a segment, not its endpoint.
    for a, b, width in segments:
        dx, dy = b[0] - a[0], b[1] - a[1]
        squared = dx * dx + dy * dy
        if not squared:
            continue
        contacts = [(pad, point(pad.GetPosition(), a[2])) for pad in pads if pad.IsOnLayer(a[2])]
        contacts += [(via, point(via.GetPosition(), a[2])) for via in vias if via.IsOnLayer(a[2])]
        for item, center in contacts:
            t = max(0, min(1, ((center[0] - a[0]) * dx + (center[1] - a[1]) * dy) / squared))
            q = (round(a[0] + t * dx), round(a[1] + t * dy), a[2])
            touches = item.GetEffectiveShape(a[2]).Collide(pcbnew.VECTOR2I(q[0], q[1]), math.ceil(width)) if isinstance(item, pcbnew.PAD) else math.hypot(q[0]-center[0], q[1]-center[1]) <= item.GetWidth(a[2])/2 + width
            if touches:
                link(center, q, math.hypot(q[0]-center[0], q[1]-center[1])/IU)
    vertices = list(graph)
    # Legacy boards sometimes terminate at a copper edge rather than exactly
    # at its centerline. Join only overlapping endpoint copper, counting the
    # center-to-center approach rather than silently snapping it to zero.
    for i, a in enumerate(vertices):
        for b in vertices[i + 1:]:
            length = math.hypot(a[0] - b[0], a[1] - b[1])
            if a[2] == b[2] and length <= radii.get(a, 0) + radii.get(b, 0):
                link(a, b, length / IU)
    for via in vias:
        for layer in via.GetLayerSet().CuStack():
            center = point(via.GetPosition(), layer)
            for p in vertices:
                length = math.hypot(p[0] - center[0], p[1] - center[1])
                if p[2] == layer and length <= via.GetWidth(layer) / 2:
                    link(center, p, length / IU)
    for a, b, width in segments:
        dx, dy = b[0] - a[0], b[1] - a[1]
        squared = dx * dx + dy * dy
        if not squared:
            continue
        on_segment = []
        for p in vertices:
            if p[2] != a[2]:
                continue
            t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / squared))
            if math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) < 10:
                on_segment.append((t, p))
        on_segment.sort()
        for (_, start), (_, end) in zip(on_segment, on_segment[1:]):
            link(start, end, math.hypot(end[0] - start[0], end[1] - start[1]) / IU)
    for a, mid, b, length in arcs:
        x, y = mid[0] - a[0], mid[1] - a[1]
        u, v = b[0] - a[0], b[1] - a[1]
        determinant = 2 * (x * v - y * u)
        cx = a[0] + ((x*x + y*y) * v - (u*u + v*v) * y) / determinant
        cy = a[1] + ((u*u + v*v) * x - (x*x + y*y) * u) / determinant
        angle = lambda p: math.atan2(p[1] - cy, p[0] - cx)
        start = angle(a)
        span = (angle(b) - start) % math.tau
        direction = 1 if (angle(mid) - start) % math.tau <= span else -1
        span = span if direction == 1 else math.tau - span
        radius = math.hypot(a[0] - cx, a[1] - cy)
        on_arc = [(0, a), (1, b)]
        for p in vertices:
            t = ((angle(p) - start) * direction) % math.tau / span
            if p[2] == a[2] and t < 1 and abs(math.hypot(p[0] - cx, p[1] - cy) - radius) < 10:
                on_arc.append((t, p))
        on_arc.sort()
        for (ta, pa), (tb, pb) in zip(on_arc, on_arc[1:]):
            link(pa, pb, (tb - ta) * length)
    # Original traces can enter away from a pad's center. Keep the center as
    # the measurement terminal and connect its actual copper approaches.
    for pad in pads:
        layers = list(pad.GetLayerSet().CuStack())
        centers = [point(pad.GetPosition(), layer) for layer in layers]
        for center in centers:
            link(centers[0], center, 0)
            for p in vertices:
                if p[2] == center[2] and pad.GetEffectiveShape(center[2]).Collide(pcbnew.VECTOR2I(p[0], p[1]), int(radii.get(p, 0))):
                    link(center, p, math.hypot(p[0] - center[0], p[1] - center[1]) / IU)
    return graph


def distance(graph, start, end):
    queue, best = [(0, start)], {start: 0}
    while queue:
        length, p = heapq.heappop(queue)
        if p == end:
            return length
        if length != best[p]:
            continue
        for q, step in graph.get(p, {}).items():
            if length + step < best.get(q, math.inf):
                best[q] = length + step
                heapq.heappush(queue, (length + step, q))
    return None


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text())
    requests = json.loads(subprocess.check_output(["bun", "-e", """
    import {getDdrSkewGroups} from './circuits/ddr-signals';
    import {readFileSync} from 'node:fs'; import {gunzipSync} from 'node:zlib';
    const m=JSON.parse(readFileSync('manifest.json','utf8'));
    console.log(JSON.stringify(Object.fromEntries(m.circuits.map(c=>[c.id,getDdrSkewGroups(JSON.parse(gunzipSync(readFileSync(c.file)).toString()))]))));
    """], cwd=ROOT))
    result = {}
    for circuit in manifest["circuits"]:
        circuit_id, source = circuit["id"], circuit["source"]
        file = ROOT / ".source-cache" / circuit_id / Path(source["path"]).name
        if not file.exists():
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(urlopen(f"https://raw.githubusercontent.com/{source['repo']}/{source['commit']}/{quote(source['path'])}").read())
        assert hashlib.sha256(file.read_bytes()).hexdigest() == source["sourceSha256"], circuit_id
        fixture_bytes = (ROOT / circuit["file"]).read_bytes()
        assert hashlib.sha256(fixture_bytes).hexdigest() == circuit["sha256"], circuit_id
        fixture = json.loads(gzip.decompress(fixture_bytes))
        board = pcbnew.LoadBoard(str(file))
        traces = {trace["name"]: trace for trace in fixture["traces"]}
        graphs, measured = {}, {}

        def terminal(selector, net):
            ref, pin = re.fullmatch(r"\.(\S+) > \.(\S+)", selector).groups()
            part = next(part for part in fixture["parts"] if part["name"] == ref)
            native_pad = next(pad for pad in part["pads"] if pad["pin"] == pin)
            pads = [pad for pad in board.FindFootprintByReference(ref).Pads() if pad.GetNumber() == native_pad["nativePin"] and pad.GetNetname() == net]
            assert pads, (circuit_id, selector, net)
            # Select the native primitive captured by this fixture port.
            pad = min(pads, key=lambda pad: abs(pad.GetFPRelativePosition().x / IU - native_pad["x"]) + abs(pad.GetFPRelativePosition().y / IU - native_pad["y"]))
            return point(pad.GetPosition(), list(pad.GetLayerSet().CuStack())[0])

        for group in requests[circuit_id]:
            lengths = []
            for signal in group["signals"]:
                length = 0
                for trace_name, start, end in signal["sections"]:
                    net = traces[trace_name]["nativeNet"]
                    if net not in graphs:
                        graphs[net] = net_graph(board, net)
                    section = distance(graphs[net], terminal(start, net), terminal(end, net))
                    if section is None:
                        print(circuit_id, group['name'], net, 'DISCONNECTED', flush=True)
                        length = None
                        break
                    length += section
                lengths.append(length)
            complete = len(lengths) >= 2 and all(length is not None for length in lengths)
            measured[group["name"]] = {
                "minLengthMm": round(min(lengths), 6) if complete else None,
                "maxLengthMm": round(max(lengths), 6) if complete else None,
                "lengthsMm": {signal["name"]: round(length, 6) if length is not None else None for signal, length in zip(group["signals"], lengths)},
            }
        result[circuit_id] = {"fixtureSha256": circuit["sha256"], "sourceSha256": source["sourceSha256"], "groups": measured}
        print(circuit_id, len(measured), "original routed groups", flush=True)
    # One group per line keeps the 78 measured comparisons reviewable.
    encoded = "{\n" + ",\n".join(
        "  " + json.dumps(cid) + ": {\n    \"fixtureSha256\": " + json.dumps(data["fixtureSha256"]) + ",\n    \"sourceSha256\": " + json.dumps(data["sourceSha256"]) + ",\n    \"groups\": {\n" +
        ",\n".join("      " + json.dumps(name) + ": " + json.dumps(values) for name, values in data["groups"].items()) + "\n    }\n  }"
        for cid, data in result.items()
    ) + "\n}\n"
    target = ROOT / "circuits/ddr-skew-reference.json"
    if "--check" in sys.argv:
        assert target.read_text() == encoded, "Original-board skew reference changed"
    else:
        target.write_text(encoded)


if __name__ == "__main__":
    main()

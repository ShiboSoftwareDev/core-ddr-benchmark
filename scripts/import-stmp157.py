"""Import STMP157 from a pinned PCB and the original srj36 capture.

Usage: python3 scripts/import-stmp157.py PCB SAMPLE_JSON PROVENANCE_JSON
KiCad footprint-local points (mm, +Y down) become board-world points (+Y up).
"""
import gzip
import json
import math
from pathlib import Path
import re
import sys
from kicad_source import components, many, one, parse

tree = parse(Path(sys.argv[1]).read_text())
sample = json.loads(Path(sys.argv[2]).read_text())
provenance = json.loads(Path(sys.argv[3]).read_text())
selected_nets = {c['name'] for c in sample['connections']}
nets = {n[1]: n[2] for n in many(tree, 'net')}
def net_name(pad):
    value = one(pad, 'net')
    return nets.get(value[0], value[-1]) if value and value[0] != '0' else None

all_parts = components(tree)
selected_parts = [c for c in all_parts if c['ref'] in ['U1', 'U2', 'U3'] or any(net_name(p) in selected_nets for p in many(c['node'], 'pad'))]
layers = provenance['nativeLayers']
layer_map = {l[1]: 'top' if i == 0 else 'bottom' if i == len(layers)-1 else f'inner{i}' for i,l in enumerate(layers)}
bounds = sample['bounds']
cx = (bounds['minX'] + bounds['maxX']) / 2
cy = (bounds['minY'] + bounds['maxY']) / 2
parts = []
paths = {name: [] for name in selected_nets}
native_pads = []
for component in selected_parts:
    fp = component['node']
    at = component['at']
    rotation = float(at[2]) if len(at) > 2 else 0
    angle = math.radians(rotation)
    part = dict(name=component['ref'], value=component['value'], x=float(at[0])-cx, y=-float(at[1])-cy, rotation=rotation, layer=layer_map[one(fp,'layer')[0]], pads=[], pinLabels={})
    aliases = {}
    for pad in many(fp, 'pad'):
        if not any(l in layer_map or l in ['*.Cu', 'F&B.Cu'] for l in one(pad,'layers',[])):
            continue
        pin = pad[1]
        if pin not in aliases:
            aliases[pin] = f'pin{len(aliases)+1}'
        alias = aliases[pin]
        part['pinLabels'][alias] = [f'BALL_{pin}']
        pa = one(pad,'at',['0','0'])
        px, py = map(float,pa[:2])
        width,height = map(float,one(pad,'size'))
        part['pads'].append(dict(pin=alias,nativePin=pin,x=px,y=py,width=width,height=height,rotation=float(pa[2]) if len(pa)>2 else 0,shape=pad[3],kind=pad[2],drill=float(one(pad,'drill',['0'])[0])))
        native_pads.append(dict(part=part['name'],pin=alias,x=float(at[0])+px*math.cos(angle)+py*math.sin(angle)-cx,y=-float(at[1])+px*math.sin(angle)-py*math.cos(angle)-cy,width=width,height=height,layer=part['layer']))
        name = net_name(pad)
        if name in selected_nets:
            paths[name].append(f".{part['name']} > .{alias}")
    parts.append(part)
traces = []
for i, connection in enumerate(sample['connections']):
    name = connection['name']
    match = re.fullmatch(r'/S0SDQ(\d+)', name)
    traces.append(dict(name=f'DDR_{i:03}',nativeNet=name,path=list(dict.fromkeys(paths[name])),width=connection['nominalTraceWidth'],group=f'byte{int(match[1])//8}' if match else 'remaining'))
source = dict(id='stmp157',title=provenance['name'],source=provenance,width=bounds['maxX']-bounds['minX'],height=bounds['maxY']-bounds['minY'],layers=len(layers),signalLayers=provenance['signalLayers'],rules=provenance['rules'],parts=parts,traces=traces,nativePads=native_pads)
output = Path(__file__).resolve().parents[1]/'circuits/stmp157.json.gz'
output.write_bytes(gzip.compress((json.dumps(source,separators=(',',':'))+'\n').encode(),mtime=0))
print('stmp157',len(traces),'nets',len(native_pads),'pads')

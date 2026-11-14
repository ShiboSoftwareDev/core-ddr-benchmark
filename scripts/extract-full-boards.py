"""Native KiCad world points (mm, X right/Y down) to core board world (X right/Y up)."""
import json,gzip,collections,re,fnmatch,sys,hashlib,io
from urllib.parse import quote
from urllib.request import urlopen
from pathlib import Path
import pcbnew
sys.path.insert(0,str(Path(__file__).resolve().parent))
from kicad_source import parse,many,one
root=Path(__file__).resolve().parents[1]
for reference in json.loads((root/'full-boards/manifest.json').read_text())['circuits']:
 alias=reference['id'];original='orangecrab' if alias=='ecp5' else alias
 folder=root/'.source-cache/full-boards'/alias;folder.mkdir(parents=True,exist_ok=True)
 native=reference['source']
 for suffix,key in [('.kicad_pcb','sourceSha256'),('.kicad_pro','projectSha256')]:
  if key not in native:continue
  target=folder/('board'+suffix)
  if not target.exists():
   url=f"https://raw.githubusercontent.com/{native['repo']}/{native['commit']}/{quote(str(Path(native['path']).with_suffix(suffix)))}"
   target.write_bytes(urlopen(url,timeout=90).read())
  assert hashlib.sha256(target.read_bytes()).hexdigest()==native[key],(alias,suffix)
 board=pcbnew.LoadBoard(str(folder/'board.kicad_pcb'))
 ddr=json.load(gzip.open(root/'circuits'/f'{original}.json.gz'))
 ddr_by_net={t['nativeNet']:t for t in ddr['traces']}
 tree=parse((folder/'board.kicad_pcb').read_text())
 layers=list(board.GetEnabledLayers().CuStack())
 layer_names=['top']+[f'inner{i}' for i in range(1,len(layers)-1)]+['bottom'];layer_map=dict(zip(layers,layer_names))
 poly=pcbnew.SHAPE_POLY_SET();assert board.GetBoardPolygonOutlines(poly) and poly.OutlineCount()==1 and not poly.HoleCount(0),alias
 chain=poly.Outline(0);outline=[(pcbnew.ToMM(chain.CPoint(i).x),-pcbnew.ToMM(chain.CPoint(i).y)) for i in range(chain.PointCount())]
 cx=(min(p[0] for p in outline)+max(p[0] for p in outline))/2;cy=(min(p[1] for p in outline)+max(p[1] for p in outline))/2
 parts=[];endpoints=collections.defaultdict(set);native_refs=collections.Counter(f.GetReference() for f in board.GetFootprints());graphic=0
 shapes={pcbnew.PAD_SHAPE_CIRCLE:'circle',pcbnew.PAD_SHAPE_RECT:'rect',pcbnew.PAD_SHAPE_OVAL:'oval',pcbnew.PAD_SHAPE_ROUNDRECT:'roundrect',pcbnew.PAD_SHAPE_CUSTOM:'custom'}
 for fp in sorted(board.GetFootprints(),key=lambda f:f.GetReference()):
  ref=fp.GetReference()
  if native_refs[ref]>1 or not re.fullmatch('[A-Za-z_][A-Za-z0-9_]*',ref):
   assert not any(p.GetNetCode() for p in fp.Pads()),ref
   graphic+=1;ref=f'NATIVE_GRAPHIC_{graphic}'
  x=pcbnew.ToMM(fp.GetPosition().x)-cx;y=-pcbnew.ToMM(fp.GetPosition().y)-cy
  part={'name':ref,'value':fp.GetValue(),'x':x,'y':y,'layer':layer_map[fp.GetLayer()],'pinLabels':{},'pads':[]};aliases={}
  for i,p in enumerate(fp.Pads()):
   hole=p.GetAttribute()==pcbnew.PAD_ATTRIB_NPTH;copper=[z for z in layers if p.IsOnLayer(z)]
   if not copper and not hole:continue
   pin_number=p.GetNumber()
   if pin_number and not hole and pin_number not in aliases:
    aliases[pin_number]=f'pin{len(aliases)+1}';part['pinLabels'][aliases[pin_number]]=[f'NATIVE_{pin_number}']
   pin=aliases.get(pin_number) if not hole else None
   px=pcbnew.ToMM(p.GetPosition().x)-cx;py=-pcbnew.ToMM(p.GetPosition().y)-cy
   pad={'name':f'pad{i}','pin':pin,'nativePin':pin_number,'kind':'hole' if hole else 'plated' if p.GetAttribute()==pcbnew.PAD_ATTRIB_PTH else 'smd','shape':shapes[p.GetShape()],'x':round(px-x,8),'y':round(py-y,8),'worldX':round(px,8),'worldY':round(py,8),'width':pcbnew.ToMM(p.GetSize().x),'height':pcbnew.ToMM(p.GetSize().y),'rotation':p.GetOrientationDegrees(),'layers':[layer_map[z] for z in copper],'net':p.GetNetname() or None}
   if pad['kind']!='smd':pad.update(drillWidth=pcbnew.ToMM(p.GetDrillSize().x),drillHeight=pcbnew.ToMM(p.GetDrillSize().y))
   if pad['shape']=='roundrect':pad['cornerRadius']=pcbnew.ToMM(p.GetRoundRectCornerRadius())
   if pad['shape']=='custom':
    shape=pcbnew.SHAPE_POLY_SET();p.TransformShapeToPolygon(shape,copper[0],0,5000,pcbnew.ERROR_OUTSIDE)
    assert shape.OutlineCount()==1 and not shape.HoleCount(0),(alias,ref,pin_number)
    contour=shape.Outline(0);pad['points']=[{'x':round(pcbnew.ToMM(contour.CPoint(j).x-p.GetPosition().x),8),'y':round(-pcbnew.ToMM(contour.CPoint(j).y-p.GetPosition().y),8)} for j in range(contour.PointCount())]
   part['pads'].append(pad)
   if p.GetNetCode() and pin:endpoints[p.GetNetCode()].add((ref,pin,pin_number))
  parts.append(part)
 classes={};assignments={};patterns=[]
 if (folder/'board.kicad_pro').exists():
  project=json.loads((folder/'board.kicad_pro').read_text());settings=project['net_settings'];classes={c['name']:c for c in settings['classes']};assignments=settings.get('netclass_assignments') or {};patterns=settings.get('netclass_patterns') or []
 else:
  for c in many(tree,'net_class'):
   name=c[1];classes[name]={'track_width':float(one(c,'trace_width')[0]),'clearance':float(one(c,'clearance')[0])}
   for n in many(c,'add_net'):assignments[n[1]]=[name]
 widths_by_net=collections.defaultdict(collections.Counter)
 for track in board.GetTracks():
  if isinstance(track,pcbnew.PCB_TRACK) and not isinstance(track,pcbnew.PCB_VIA):widths_by_net[track.GetNetCode()][round(pcbnew.ToMM(track.GetWidth()),8)]+=1
 traces=[]
 for code,net in sorted(board.GetNetInfo().NetsByNetcode().items()):
  if code==0:continue
  native=net.GetNetname();targets=sorted(endpoints[code]);matched='Default'
  assigned=assignments.get(native,[]);matched=assigned[-1] if assigned else matched
  for pattern in patterns:
   if fnmatch.fnmatchcase(native,pattern['pattern']):matched=pattern['netclass']
  netclass=classes.get(matched,classes.get('Default',{}));width=float(netclass.get('track_width',ddr['rules']['widths'][0]))
  if widths_by_net[code]:width=widths_by_net[code].most_common(1)[0][0]
  if native in ddr_by_net:group=ddr_by_net[native]['group'];width=ddr_by_net[native]['width']
  elif len(targets)<2:group='single'
  elif not native.startswith('Net-(') and re.search(r'GND|VCC|VDD|VSS|VBUS|VBAT|[+][0-9]|\b[0-9]+V[0-9]*\b|^[0-9]+[.]?[0-9]*V',native.upper()):group='power'
  else:group='other_signals'
  traces.append({'name':f'N{code:04d}','netName':f'NET{code:04d}','nativeNet':native,'path':[f'.{ref} > .{pin}' for ref,pin,_ in targets],'width':width,'group':group,'endpoints':[{'ref':ref,'pin':pin,'nativePin':np} for ref,pin,np in targets]})
 min_width=min([t['width'] for t in traces]+[float(c.get('diff_pair_width',c.get('track_width',1))) for c in classes.values()]);rules={**ddr['rules'],'minTraceWidth':min_width}
 # Keep every component fixed; add routing space outside the native geometry.
 pads=[pad for part in parts for pad in part['pads']]
 x0=min([round(x-cx,8) for x,y in outline]+[p['worldX']-max(p['width'],p['height'])/2 for p in pads])-10
 x1=max([round(x-cx,8) for x,y in outline]+[p['worldX']+max(p['width'],p['height'])/2 for p in pads])+10
 y0=min([round(y-cy,8) for x,y in outline]+[p['worldY']-max(p['width'],p['height'])/2 for p in pads])-10
 y1=max([round(y-cy,8) for x,y in outline]+[p['worldY']+max(p['width'],p['height'])/2 for p in pads])+10
 result={'id':alias,'title':reference['title'],'width':x1-x0,'height':y1-y0,'outline':[{'x':x0,'y':y0},{'x':x1,'y':y0},{'x':x1,'y':y1},{'x':x0,'y':y1}],'layers':len(layers),'signalLayers':ddr['signalLayers'],'rules':rules,'parts':parts,'traces':traces}
 buffer=io.BytesIO()
 with gzip.GzipFile(fileobj=buffer,mode='wb',filename='',mtime=0) as archive:archive.write(json.dumps(result,separators=(',',':')).encode())
 packed=buffer.getvalue()
 assert hashlib.sha256(packed).hexdigest()==reference['sha256'],f'{alias}: full-board fixture differs'
 (root/reference['file']).write_bytes(packed)
 print(alias,'parts',len(parts),'pads',sum(len(p['pads']) for p in parts),'nets',len(traces),'phases',dict(collections.Counter(t['group'] for t in traces)),'minwidth',min_width,flush=True)

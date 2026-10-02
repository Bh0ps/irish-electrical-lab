"""Summarise actual exported inventory and reproducible construction evidence."""
import json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
manifest=json.loads((ROOT/'lab/public/models/manifest.json').read_text())
baseline=json.loads((ROOT/'verification/model-detail/historical-1.1.1/manifest.json').read_text())
def totals(items):
    return {field:sum(item.get(field,0) for item in items) for field in ('meshCount','sourceMeshCount','triangles','lowTriangles','bytes','lowBytes')}
families={}
for item in manifest:
    family=item['detailFamily'];families.setdefault(family,[]).append(item['key'])
report={'revision':2,'variants':len(manifest),'authoringFamilies':len(families),'current':totals(manifest),'historical1_1_1':totals(baseline),'familyInventory':families,'largestDrawCallInventories':sorted([{'key':a['key'],'meshes':a['meshCount'],'triangles':a['triangles'],'lowTriangles':a['lowTriangles']} for a in manifest],key=lambda a:a['meshes'],reverse=True)[:12], 'sourceAndAssetHashes':[]}
for asset in manifest:
    paths=[ROOT/'authoring/blender/models'/f"{asset['key']}.blend",ROOT/'lab/public'/asset['url'].lstrip('/'),ROOT/'lab/public'/asset['lowUrl'].lstrip('/'),ROOT/'lab/public'/asset['thumbnailUrl'].lstrip('/')]
    report['sourceAndAssetHashes'].append({'key':asset['key'],'files':[{'path':str(path.relative_to(ROOT)).replace('\\','/'),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()} for path in paths]})
folder=ROOT/'verification/model-detail';folder.mkdir(exist_ok=True)
(folder/'inventory-summary.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:report[k] for k in ('variants','authoringFamilies','current','historical1_1_1')},indent=2))

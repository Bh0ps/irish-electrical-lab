"""Assemble app-owned native GPU captures into reviewable local contact sheets."""
import json, math, sys, hashlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
verification = Path(sys.argv[1])
report = json.loads((verification / 'desktop-gallery-report.json').read_text(encoding='utf-8'))
output = verification / 'gpu-contact-sheets'
output.mkdir(exist_ok=True)
font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 17)
entries = {f'variants-{view}-{side}':[entry for entry in report['individualModels'] if entry.get('view','normal')==view and entry['side']==side] for view in ('normal','open','exploded','cutaway') for side in ('front','rear')}
entries.update({'configurations':report['configurations'],'inspection-batches':report['images']})
written = []
for group, images in entries.items():
    for page in range(math.ceil(len(images)/12)):
        canvas = Image.new('RGB', (1440, 1264), '#edf1f3')
        draw = ImageDraw.Draw(canvas)
        scope='Installed' if report.get('packaged',True) else 'Source desktop'
        draw.text((12, 8), f'{scope} Irish Electrical Lab {report.get("version","")} — {group} — page {page+1}', fill='#16333d', font=font)
        for cell, entry in enumerate(images[page*12:(page+1)*12]):
            image = Image.open(verification / entry['file']).convert('RGB')
            image.thumbnail((470, 260))
            x, y = (cell % 3)*480+5, (cell//3)*305+42
            canvas.paste(image, (x+(470-image.width)//2, y))
            label = f"{entry.get('index',entry.get('id',entry.get('batch'))):02} · {entry.get('name',entry.get('title',entry.get('view')))}"
            draw.text((x+5, y+264), label[:57], fill='#16333d', font=font)
        file = output / f'{group}-{page+1:02}.jpg'
        canvas.save(file, quality=94)
        written.append(str(file))
audit={'version':report.get('version'),'packaged':report.get('packaged'),'pages':len(written),'variantCaptures':len(report['individualModels']),'uniqueVariants':len({entry['key'] for entry in report['individualModels']}),'configurationCaptures':len(report['configurations']),'groupCounts':{key:len(images) for key,images in entries.items()},'reportSHA256':hashlib.sha256((verification/'desktop-gallery-report.json').read_bytes()).hexdigest(),'files':[{'path':str(Path(file).relative_to(verification)).replace('\\','/'),'sha256':hashlib.sha256(Path(file).read_bytes()).hexdigest()} for file in written]}
(output/'contact-sheet-audit.json').write_text(json.dumps(audit,indent=2))
print(json.dumps({'pages':len(written),'variantCaptures':audit['variantCaptures'],'uniqueVariants':audit['uniqueVariants'],'configurationCaptures':audit['configurationCaptures'],'files':written},indent=2))

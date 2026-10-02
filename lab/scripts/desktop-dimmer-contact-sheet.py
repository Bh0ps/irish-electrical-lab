"""Review the focused dimmer captures from the real installed Electron window."""
import json, math, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root = Path(sys.argv[1])
report = json.loads((root / 'desktop-dimmer-report.json').read_text(encoding='utf-8'))
font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 20)
written = []
for page in range(math.ceil(len(report['images']) / 6)):
    sheet = Image.new('RGB', (1800, 1660), '#eef2f3')
    draw = ImageDraw.Draw(sheet)
    draw.text((14, 10), f'Installed Irish Electrical Lab {report["version"]} — real dimmer interaction — page {page+1}', fill='#17333d', font=font)
    for index, item in enumerate(report['images'][page*6:(page+1)*6]):
        image = Image.open(root / item['file']).convert('RGB')
        image.thumbnail((880, 480))
        x,y=(index%2)*900+8,(index//2)*530+44
        sheet.paste(image,(x+(880-image.width)//2,y))
        draw.text((x+5,y+487),item['name'].replace('-',' '),fill='#17333d',font=font)
    output=root/f'dimmer-contact-sheet-{page+1:02}.jpg'
    sheet.save(output,quality=95)
    written.append(str(output))
print(json.dumps({'pages':len(written),'files':written},indent=2))
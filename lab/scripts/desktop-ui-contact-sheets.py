"""Build review sheets from the installed 1.1.0 application's real UI captures."""
import json, math, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

verification = Path(sys.argv[1])
report = json.loads((verification / 'desktop-1.1-ui-report.json').read_text(encoding='utf-8'))
output = verification / 'ui-1.1-contact-sheets'
output.mkdir(exist_ok=True)
font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 19)
groups = {
    'stages': [image for image in report['images'] if image['name'].startswith('stage-')],
    'widths': [image for image in report['images'] if '-width-' in image['name']],
    'flows': [image for image in report['images'] if not image['name'].startswith('stage-') and '-width-' not in image['name']],
}
written = []
for group, entries in groups.items():
    for page in range(math.ceil(len(entries) / 6)):
        canvas = Image.new('RGB', (1800, 1660), '#edf1f3')
        draw = ImageDraw.Draw(canvas)
        draw.text((14, 10), f'Installed Irish Electrical Lab {report["version"]} — {group} — page {page + 1}', fill='#16333d', font=font)
        for cell, entry in enumerate(entries[page * 6:(page + 1) * 6]):
            image = Image.open(verification / entry['file']).convert('RGB')
            image.thumbnail((880, 480))
            x, y = (cell % 2) * 900 + 8, (cell // 2) * 530 + 44
            canvas.paste(image, (x + (880 - image.width) // 2, y))
            draw.text((x + 5, y + 487), entry['name'].replace('-', ' '), fill='#16333d', font=font)
        file = output / f'{group}-{page + 1:02}.jpg'
        canvas.save(file, quality=94)
        written.append(str(file))
print(json.dumps({'pages': len(written), 'files': written}, indent=2))

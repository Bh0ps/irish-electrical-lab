"""Assemble locally rendered original assets for visual inspection."""
import json, math
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[2]
IMAGES=ROOT/'verification/blender'
inventory=json.loads((ROOT/'lab/public/models/manifest.json').read_text())
inventory.sort(key=lambda entry:entry['key'])
try:font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',16)
except OSError:font=ImageFont.load_default()
reports=[]
for family,views,columns,per_page,tile in [('faces',('front','rear'),4,16,200),('inspection',('open','exploded','cutaway'),3,12,180),('inspection-front',('open-front','exploded-front','cutaway-front'),3,12,180)]:
    for index in range(math.ceil(len(inventory)/per_page)):
        entries=inventory[index*per_page:(index+1)*per_page]
        width=tile*len(views);height=tile+50
        sheet=Image.new('RGB',(width*columns,height*math.ceil(len(entries)/columns)), '#e5ede9');draw=ImageDraw.Draw(sheet)
        for slot,entry in enumerate(entries):
            x=(slot%columns)*width;y=(slot//columns)*height
            draw.text((x+8,y+5),entry['galleryKey'],font=font,fill='#19362e')
            for v,view in enumerate(views):
                path=IMAGES/f"{entry['key']}-{view}.png"
                with Image.open(path) as original:
                    if original.size!=(500,500):raise ValueError(str(path)+' wrong render size')
                    image=original.convert('RGB').resize((tile,tile),Image.Resampling.LANCZOS)
                    sheet.paste(image,(x+v*tile,y+25))
                draw.text((x+v*tile+8,y+tile+26),view,font=font,fill='#385349')
            reports.append({'key':entry['galleryKey'],'views':list(views),'sheet':f'library-{family}-{index+1:02}.png'})
        sheet.save(IMAGES/f'library-{family}-{index+1:02}.png')
# Refresh the large reference sheet from the final renders.
first=['switch_single-rocker','rose_default','lamp_bulb'];views=('front','rear','open','exploded','cutaway')
sheet=Image.new('RGB',(2500,1650),'#e5ede9');draw=ImageDraw.Draw(sheet)
for row,key in enumerate(first):
    for column,view in enumerate(views):
        x=column*500;y=row*550
        draw.text((x+12,y+10),key+' · '+view,font=font,fill='#19362e')
        with Image.open(IMAGES/f'{key}-{view}.png') as image:sheet.paste(image.convert('RGB'),(x,y+40))
sheet.save(IMAGES/'first-fixtures-contact-sheet.png')
(IMAGES/'render-audit.json').write_text(json.dumps({'variants':len(inventory),'renders':len(inventory)*8,'thumbnails':len(inventory),'contactSheets':reports},indent=2))
print(f'Assembled {len(inventory)*8} rendered model views into 22 inspection sheets and the reference fixture sheet.')

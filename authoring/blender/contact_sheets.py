"""Assemble locally rendered original assets for visual inspection."""
import json, math, sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[2]
IMAGES=ROOT/'verification/blender'
inventory=json.loads((ROOT/'lab/public/models/manifest.json').read_text())
inventory.sort(key=lambda entry:entry['key'])
try:font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',16)
except OSError:font=ImageFont.load_default()
if '--access' in sys.argv:
    # Show the shipped front thumbnail beside the open installation face.
    target=IMAGES/'service-access'
    for i in range(0,len(inventory),15):
        entries=inventory[i:i+15];sheet=Image.new('RGB',(1008,math.ceil(len(entries)/3)*185),'#e3e9e5')
        draw=ImageDraw.Draw(sheet)
        for j,entry in enumerate(entries):
            x=j%3*336;y=j//3*185
            draw.text((x+4,y+2),entry['key'],font=font,fill='#20302d')
            for view,path in enumerate((ROOT/'lab/public'/entry['thumbnailUrl'].lstrip('/'),target/(entry['key']+'.png'))):
                with Image.open(path) as source:
                    image=source.convert('RGBA').resize((160,160),Image.Resampling.LANCZOS)
                    sheet.paste(image,(x+view*165+2,y+24),image)
        sheet.save(target/f'sheet-{i//15+1}.jpg',quality=89)
    print(f"{len(inventory)} equipment fronts and {len(inventory)} open connection views.")
    sys.exit(0)
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

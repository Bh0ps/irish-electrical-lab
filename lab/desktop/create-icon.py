"""Reproducible original vector-style Windows app icon (no remote assets)."""
from pathlib import Path
from PIL import Image, ImageDraw

folder = Path(__file__).parent / "assets"
folder.mkdir(exist_ok=True)
image = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((10, 10, 502, 502), radius=110, fill="#112936", outline="#3b6170", width=8)
draw.rounded_rectangle((53, 53, 459, 459), radius=78, outline="#1f3d48", width=4)
draw.line((102, 174, 167, 174, 167, 112), fill="#75d5c4", width=12)
draw.line((345, 400, 345, 337, 409, 337), fill="#75d5c4", width=12)
for x, y in ((102, 174), (167, 112), (345, 400), (409, 337)):
    draw.ellipse((x-12, y-12, x+12, y+12), fill="#112936", outline="#75d5c4", width=6)
draw.polygon(((280, 80), (163, 272), (249, 272), (215, 431), (357, 229), (271, 229)), fill="#edb763")
image.save(folder / "icon.png")
image.save(folder / "icon.ico", sizes=[(16,16), (24,24), (32,32), (48,48), (64,64), (128,128), (256,256)])

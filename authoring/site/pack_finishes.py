"""Prepare the local CC0 surface maps and daylight probe used by the site view."""
from io import BytesIO
import hashlib
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image

output = Path(__file__).resolve().parents[2] / 'lab/public/site-assets'
root = 'https://dl.polyhaven.org/file/ph-assets/'

def fetch(path, digest):
    with urlopen(Request(root + path, headers={'User-Agent': 'Irish-Electrical-Lab asset authoring'}), timeout=60) as response:
        data = response.read()
    if hashlib.md5(data).hexdigest() != digest:
        raise ValueError(f'Unexpected source revision for {path}')
    return data

surfaces = {
    'wood': ('wood_table_001', {
        'diff':'56652a7339b16a76afad20d3585f66ea',
        'nor_gl':'6360e09967add8baecaa5ecc55fb5e03',
        'arm':'b39a1587c9b99e3104baedae8d5dfa48',
    }),
    'plaster': ('white_plaster_02', {
        'diff':'7b10c2686bcfd76d1f309a20fd06b57e',
        'nor_gl':'55fc03203ebf1dc703a380fde93ff502',
        'arm':'4a5a080e2421fac4fa602680bef4c8b1',
    })
}
for label,(asset,maps) in surfaces.items():
    for channel,checksum in maps.items():
        image = Image.open(BytesIO(fetch(f'Textures/jpg/1k/{asset}/{asset}_{channel}_1k.jpg', checksum)))
        image.thumbnail((512,512), Image.Resampling.LANCZOS)
        image.save(output / f'{label}-{channel}.jpg',quality=85,subsampling=0 if channel=='nor_gl' else 2,optimize=True)
(output / 'daylight.hdr').write_bytes(fetch('HDRIs/hdr/1k/small_empty_room_1_1k.hdr','ecb0a2934b03edb73cba34167e6b7499'))

"""Pack Poly Haven's CC0 Potted Plant 04 for the offline site camera.

Uses the original glTF mesh, UVs and materials. Only the JPEG texture resolution
changes. Pinned file hashes reject an unexpected upstream revision.
"""
import hashlib
import io
import json
import struct
import urllib.request
from pathlib import Path

from PIL import Image

BASE = 'https://dl.polyhaven.org/file/ph-assets/Models/'
ASSET = 'potted_plant_04'
SOURCE = 'https://polyhaven.com/a/potted_plant_04'
FILES = {
    'scene': (f'gltf/1k/{ASSET}/{ASSET}_1k.gltf', '077d481764145f6e5e256593aab427bb'),
    'mesh': (f'gltf/8k/{ASSET}/{ASSET}.bin', '03774ca8e28e2aa30fb26cb68d5e0093'),
    'diff': (f'jpg/1k/{ASSET}/{ASSET}_diff_1k.jpg', '4a72fb3667fd3686ca4014f6676f59c4'),
    'arm': (f'jpg/1k/{ASSET}/{ASSET}_arm_1k.jpg', 'ed0030c6085bba45b6f63f3043b0b237'),
    'nor_gl': (f'jpg/1k/{ASSET}/{ASSET}_nor_gl_1k.jpg', '1c0b87906fd92c7b7ce5508110976474'),
}

def read(name):
    path, expected = FILES[name]
    with urllib.request.urlopen(urllib.request.Request(BASE + path, headers={'User-Agent': 'Irish-Electrical-Lab asset authoring'}), timeout=60) as response:
        data = response.read()
    if hashlib.md5(data).hexdigest() != expected:
        raise ValueError(f'Unexpected source revision for {name}')
    return data

def pad(data, byte):
    return data + byte * (-len(data) % 4)

def pack():
    scene = json.loads(read('scene'))
    blob = bytearray(read('mesh'))
    for image in scene['images']:
        name = image.pop('uri').split(ASSET + '_')[-1].removesuffix('_1k.jpg')
        with Image.open(io.BytesIO(read(name))) as source:
            source.thumbnail((512, 512), Image.Resampling.LANCZOS)
            out = io.BytesIO()
            source.save(out, format='JPEG', quality=85, subsampling=0 if name == 'nor_gl' else 2, optimize=True)
        data = out.getvalue()
        blob.extend(b'\0' * (-len(blob) % 4))
        image.update(mimeType='image/jpeg', bufferView=len(scene['bufferViews']))
        scene['bufferViews'].append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)})
        blob.extend(data)
    scene['buffers'] = [{'byteLength': len(blob)}]
    scene['asset']['copyright'] = 'Potted Plant 04 by James Ray Cock, Poly Haven. CC0 1.0.'
    scene['asset']['extras'] = {'source': SOURCE, 'license': 'https://creativecommons.org/publicdomain/zero/1.0/'}
    metadata = pad(json.dumps(scene, separators=(',', ':')).encode(), b' ')
    binary = pad(bytes(blob), b'\0')
    output = struct.pack('<4sII', b'glTF', 2, 28+len(metadata)+len(binary))
    output += struct.pack('<I4s', len(metadata), b'JSON') + metadata + struct.pack('<I4s', len(binary), b'BIN\0') + binary
    target = Path(__file__).resolve().parents[2] / 'lab/public/site-assets/potted-plant.glb'
    target.write_bytes(output)
    print(f'{target.name}: {len(output)} bytes')

if __name__ == '__main__':
    pack()

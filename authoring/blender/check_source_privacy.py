"""Read every editable Blender file before distribution. Requires Python 3.14+."""
from compression import zstd
from pathlib import Path
import os
import re
import sys

# Include remnants after a C buffer's end marker, e.g. //\0Users\name\...
PROFILE = re.compile(rb'(?:\busers[\\/]|/home/)[^/\\\x00]{1,128}[\\/]', re.I)


def check_model(file):
    data = file.read_bytes()
    if data.startswith(b'\x28\xb5\x2f\xfd'):
        data = zstd.decompress(data)
    if not data.startswith(b'BLENDER'):
        raise ValueError(f'Cannot verify the file format for {file.name}')
    username = os.environ.get('USERNAME') or os.environ.get('USER', '')
    local_name = None
    if len(username) > 2 and username.lower() not in ('root', 'runner', 'user'):
        local_name = re.compile(rb'\b' + re.escape(username.encode()) + rb'\b', re.I)
    for text in (data, data[::2], data[1::2]):
        if PROFILE.search(text) or (local_name and local_name.search(text)):
            return False
    return True


if __name__ == '__main__':
    files = sorted((Path(__file__).parent / 'models').glob('*.blend'))
    failures = [file.name for file in files if not check_model(file)]
    if not files or failures:
        sys.exit('Source model privacy check failed: ' + ', '.join(failures))
    print(f'Checked {len(files)} original model files.')

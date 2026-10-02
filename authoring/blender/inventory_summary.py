import json
from pathlib import Path
items=json.loads((Path(__file__).parent/'recipes/inventory.json').read_text())
for item in items:
    print(item['key'],item['definition']['model'],item['definition']['size'])

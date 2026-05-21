import json, re
f = open('v0.3/data/plants-perenual.js', 'r', encoding='utf-8')
d = f.read()
m = re.search(r'PLANTS_PERENUAL\s*=\s*(\[[\s\S]*?\])\s*;', d)
plants = json.loads(m.group(1))
print('Plants in perenual:', len(plants))
print('First 3 categories:', [p.get('category','?') for p in plants[:10]])

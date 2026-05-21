"""GrowMap — Recategorize all existing Perenual plants with smart category guessing"""

import json, re

DIR = 'c:\\plantapp\\v0.3\\data'
INPUT = f'{DIR}\\plants-perenual.js'

# Load existing plants
with open(INPUT, encoding='utf-8') as f:
    content = f.read()
    m = re.search(r'const PLANTS_PERENUAL = (\[.*?\]);', content, re.DOTALL)
    plants = json.loads(m.group(1))

print(f"Loaded {len(plants)} plants")

# Category keyword lists
fruit_kw = ['apple', 'banana', 'berry', 'cherry', 'citrus', 'grape', 'mango',
            'peach', 'pear', 'plum', 'orange', 'lemon', 'lime', 'fig', 'olive',
            'strawberry', 'raspberry', 'blueberry', 'watermelon', 'melon',
            'coconut', 'avocado', 'pineapple', 'papaya', 'kiwi', 'pomegranate',
            'apricot', 'nectarine', 'date', 'currant', 'gooseberry', 'persimmon',
            'guava', 'lychee', 'dragon fruit', 'passion fruit', 'mulberry',
            'cranberry', 'boysenberry', 'elderberry', 'quince', 'loquat',
            'tangerine', 'grapefruit', 'kumquat', 'tamarind', 'jujube',
            'soursop', 'cherimoya', 'feijoa', 'jabuticaba', 'rambutan',
            'mangosteen', 'durian', 'breadfruit', 'jackfruit', 'sapodilla',
            'acerola', 'aronia', 'lingonberry', 'huckleberry', 'salal',
            'chokeberry', 'cloudberry', 'loganberry', 'marionberry',
            'salmonberry', 'thimbleberry', 'juneberry', 'serviceberry',
            'saskatoon', 'buffalo berry', 'sea buckthorn', 'goji', 'wolfberry']

veg_kw = ['tomato', 'potato', 'carrot', 'onion', 'garlic', 'lettuce', 'cabbage',
          'broccoli', 'cauliflower', 'spinach', 'kale', 'pepper', 'cucumber',
          'eggplant', 'pumpkin', 'squash', 'bean', 'pea', 'corn', 'radish',
          'beet', 'celery', 'asparagus', 'artichoke', 'leek', 'shallot',
          'okra', 'turnip', 'rutabaga', 'parsnip', 'yam', 'sweet potato',
          'brussels sprout', 'collard', 'swiss chard', 'arugula', 'endive',
          'frisee', 'mizuna', 'tatsoi', 'komatsuna', 'mache', 'sorrel',
          'watercress', 'chicory', 'rapini', 'broccoli rabe', 'jicama',
          'kohlrabi', 'celeriac', 'horseradish', 'ginger', 'turmeric',
          'tomatillo', 'taro', 'manioc', 'cassava', 'daikon', 'scallion',
          'bell pepper', 'chili', 'jalapeno', 'habanero']

herb_kw = ['basil', 'mint', 'rosemary', 'thyme', 'oregano', 'sage', 'parsley',
           'dill', 'cilantro', 'chive', 'lavender', 'bay', 'tarragon', 'fennel',
           'marjoram', 'savory', 'lemongrass', 'stevia', 'nettle', 'comfrey',
           'yarrow', 'echinacea', 'valerian', 'calendula', 'chamomile',
           'lemon balm', 'catnip', 'hyssop', 'lovage', 'angelica', 'caraway',
           'chervil', 'borage', 'anise', 'coriander', 'cumin', 'dandelion']

tree_kw = ['oak', 'maple', 'pine', 'spruce', 'fir', 'birch', 'elm', 'willow',
           'ash', 'cedar', 'cypress', 'redwood', 'sequoia', 'beech', 'hickory',
           'poplar', 'aspen', 'cottonwood', 'sycamore', 'hemlock', 'larch',
           'tamarack', 'alder', 'basswood', 'linden', 'locust', 'walnut',
           'chestnut', 'pecan', 'hazel', 'filbert', 'butternut', 'osage',
           'catalpa', 'dogwood', 'magnolia', 'tulip tree', 'sweet gum',
           'ginkgo', 'juniper', 'yew', 'arborvitae', 'eucalyptus', 'acacia',
           'ironwood', 'hornbeam', 'douglas fir', 'red cedar', 'white cedar']

shrub_kw = ['bush', 'shrub']

changes = {
    'fruit': 0, 'vegetable': 0, 'herb': 0, 'tree': 0, 'shrub': 0,
    'succulent': 0, 'vine': 0, 'grain': 0, 'aquatic': 0, 'flower': 0
}

for p in plants:
    name = (p.get('name') or '').lower()
    sci = (p.get('scientificName') or '').lower()
    edible = p.get('edible', False)
    combined = f'{name} {sci}'
    
    if edible and any(k in combined for k in fruit_kw):
        new_cat, new_emoji = 'fruit', '🍎'
    elif edible and any(k in combined for k in veg_kw):
        new_cat, new_emoji = 'vegetable', '🥬'
    elif any(k in combined for k in herb_kw):
        new_cat, new_emoji = 'herb', '🌿'
    elif any(k in combined for k in tree_kw):
        new_cat, new_emoji = 'tree', '🌳'
    elif any(k in combined for k in shrub_kw) or 'shrub' in combined:
        new_cat, new_emoji = 'shrub', '🪴'
    elif 'succulent' in combined or 'cactus' in combined or 'aloe' in combined:
        new_cat, new_emoji = 'succulent', '🌵'
    elif 'vine' in combined or 'climber' in combined or 'ivy' in combined:
        new_cat, new_emoji = 'vine', '🍇'
    elif 'grass' in combined or 'grain' in combined or 'bamboo' in combined or 'cereal' in combined:
        new_cat, new_emoji = 'grain', '🌾'
    elif 'aquatic' in combined or 'water lily' in combined or 'duckweed' in combined:
        new_cat, new_emoji = 'aquatic', '💧'
    elif edible:
        new_cat, new_emoji = 'vegetable', '🥬'
    else:
        new_cat, new_emoji = 'flower', '🌸'
    
    old_cat = p.get('category', '')
    if old_cat != new_cat:
        changes[new_cat] += 1
    
    p['category'] = new_cat
    p['emoji'] = new_emoji

# Count all categories
cats = {}
for p in plants:
    c = p['category']
    cats[c] = cats.get(c, 0) + 1

print(f"\n✅ Recategorized all plants!")
print(f"\nCategory distribution:")
for c, n in sorted(cats.items(), key=lambda x: -x[1]):
    print(f"   {c}: {n} plants")

print(f"\nChanges made: {sum(changes.values())}")

# Save back
with open(INPUT, 'w', encoding='utf-8') as f:
    f.write(f'// Auto-generated — {len(plants)} plants from Perenual API (recategorized)\n')
    f.write('const PLANTS_PERENUAL = ')
    json.dump(plants, f, indent=2, ensure_ascii=False)
    f.write(';\n')

print(f"\n💾 Saved to {INPUT}")

"""GrowMap v0.3 — Fetch ALL Perenual plants (3,000+)
Tracks page progress in fetch_progress.json.
Resumes from last page. Run when API resets daily.

Run: python fetch_all_slow.py YOUR_API_KEY
"""

import json, sys, time, urllib.request, urllib.error, os, re

API_KEY = sys.argv[1]
DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT = os.path.join(DIR, 'data', 'plants-perenual.js')
PROGRESS = os.path.join(DIR, 'data', 'fetch_progress.json')

def fetch(page):
    url = f'https://perenual.com/api/species-list?key={API_KEY}&page={page}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode()), None, None
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        retry_after = None
        try:
            d = json.loads(body)
            retry_after = d.get('Retry-After')
        except: pass
        return None, e.code, retry_after

def guess_category(p, name, sci):
    """Categorize a plant based on Perenual data fields."""
    edible = p.get('edible') in [True, 'true', 1, '1']
    cycle = (p.get('cycle') or '').lower()
    type_val = (p.get('type') or '').lower()
    name_lower = (name or '').lower()
    sci_lower = (sci or '').lower()
    
    # Check by name keywords
    fruit_keywords = ['apple', 'banana', 'berry', 'cherry', 'citrus', 'grape', 'mango',
                      'peach', 'pear', 'plum', 'orange', 'lemon', 'lime', 'fig', 'olive',
                      'strawberry', 'raspberry', 'blueberry', 'watermelon', 'melon',
                      'coconut', 'avocado', 'pineapple', 'papaya', 'kiwi', 'pomegranate',
                      'apricot', 'nectarine', 'date', 'currant', 'gooseberry']
    veg_keywords = ['tomato', 'potato', 'carrot', 'onion', 'garlic', 'lettuce', 'cabbage',
                    'broccoli', 'cauliflower', 'spinach', 'kale', 'pepper', 'cucumber',
                    'eggplant', 'pumpkin', 'squash', 'bean', 'pea', 'corn', 'radish',
                    'beet', 'celery', 'asparagus', 'artichoke', 'leek', 'shallot']
    herb_keywords = ['basil', 'mint', 'rosemary', 'thyme', 'oregano', 'sage', 'parsley',
                     'dill', 'cilantro', 'chive', 'lavender', 'bay', 'tarragon', 'fennel']
    tree_keywords = ['oak', 'maple', 'pine', 'spruce', 'fir', 'birch', 'elm', 'willow',
                     'ash', 'cedar', 'cypress', 'redwood', 'sequoia', 'beech', 'hickory']
    
    name_check = f'{name_lower} {sci_lower}'
    
    if edible and any(k in name_check for k in fruit_keywords):
        return ('fruit', '🍎')
    if edible and any(k in name_check for k in veg_keywords):
        return ('vegetable', '🥬')
    if any(k in name_check for k in herb_keywords):
        return ('herb', '🌿')
    if any(k in name_check for k in tree_keywords) or 'tree' in type_val:
        return ('tree', '🌳')
    if 'shrub' in type_val or 'bush' in name_check:
        return ('shrub', '🪴')
    if 'succulent' in type_val or 'cactus' in name_check:
        return ('succulent', '🌵')
    if 'vine' in type_val or 'climber' in name_check:
        return ('vine', '🍇')
    if 'grass' in type_val or 'grain' in name_check or 'cereal' in name_check:
        return ('grain', '🌾')
    if 'aquatic' in type_val or 'water' in type_val:
        return ('aquatic', '💧')
    if 'fern' in name_check or 'moss' in name_check:
        return ('flower', '🌱')
    if edible:
        return ('vegetable', '🥬')
    # Default to flower
    return ('flower', '🌸')

def norm(p):
    sci = p.get('scientific_name', '') or ''
    if isinstance(sci, list): sci = sci[0] if sci else ''
    common = p.get('common_name', '') or ''
    if not common and not sci: return None
    img = p.get('default_image', {}) or {}
    iurl = img.get('original_url') or img.get('regular_url') or img.get('medium_url')
    thumb = img.get('thumbnail') or img.get('small_url') or iurl
    sun = p.get('sunlight') or []
    if isinstance(sun, list):
        full = any(s and 'full sun' in s.lower() for s in sun)
        part = any(s and 'part' in s.lower() for s in sun)
        shade = any(s and 'shade' in s.lower() for s in sun)
    else: full = part = shade = False
    sh = 8 if full else (5 if part else (3 if shade else 6))
    mf = p.get('temperature_min_F')
    xf = p.get('temperature_max_F')
    tmin = round((mf - 32) * 5 / 9) if mf else None
    tmax = round((xf - 32) * 5 / 9) if xf else None
    phmin = float(p['ph_min']) if p.get('ph_min') is not None else None
    phmax = float(p['ph_max']) if p.get('ph_max') is not None else None
    h = p.get('hardiness') or {}
    desc = p.get('description', '') or ''
    if not desc: desc = f'{common} ({sci})'
    
    cat, emoji = guess_category(p, common, sci)
    
    return {
        'id': f'perenual:{p["id"]}', 'source': 'perenual',
        'name': common, 'scientificName': sci,
        'category': cat, 'emoji': emoji, 'description': desc,
        'imageUrl': iurl, 'thumbnailUrl': thumb,
        'edible': p.get('edible') in [True, 'true', 1, '1'],
        'cycle': p.get('cycle') or 'Perennial',
        'requirements': {
            'tempMin': tmin, 'tempMax': tmax,
            'tempOptimalMin': tmin + 3 if tmin else None,
            'tempOptimalMax': tmax - 3 if tmax else None,
            'annualRainfallMin': 300, 'annualRainfallMax': 1200,
            'humidityMin': None, 'humidityMax': None,
            'soilPhMin': phmin, 'soilPhMax': phmax,
            'sunlightHoursMin': sh,
            'frostTolerant': None, 'droughtTolerant': False,
            'hardinessZoneMin': h.get('min'), 'hardinessZoneMax': h.get('max'),
        },
        'growingSeason': p.get('cycle') or 'Perennial', 'funFact': '',
    }

def save(plants, page):
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        f.write(f'// Auto-generated — {len(plants)} plants from Perenual API (page {page})\n')
        f.write('const PLANTS_PERENUAL = ')
        json.dump(plants, f, indent=2, ensure_ascii=False)
        f.write(';\n')
    # Save progress so we can resume from exact page
    with open(PROGRESS, 'w') as f:
        json.dump({'page': page, 'total': len(plants), 'last_fetch': time.time()}, f)
    print(f"  💾 {len(plants)} plants saved (page {page}) [{os.path.getsize(OUTPUT)//1024}KB]")

def load_progress():
    progress = {'page': 0}
    # Load from progress file first
    if os.path.exists(PROGRESS):
        with open(PROGRESS) as f:
            try: progress = json.load(f)
            except: pass
        return progress['page']
    # Fallback: count plants in existing file
    if os.path.exists(OUTPUT):
        with open(OUTPUT, encoding='utf-8') as f:
            m = re.search(r'const PLANTS_PERENUAL = (\[.*?\]);', f.read(), re.DOTALL)
            if m:
                plants = json.loads(m.group(1))
                # Each page has 30 plants, find which pages we have
                ids = sorted([p.get('_pid', 0) for p in plants])
                if ids:
                    last_id = ids[-1]
                    return last_id // 30  # approximate last page
    return 0

def load_plants():
    if os.path.exists(OUTPUT):
        with open(OUTPUT, encoding='utf-8') as f:
            m = re.search(r'const PLANTS_PERENUAL = (\[.*?\]);', f.read(), re.DOTALL)
            if m: return json.loads(m.group(1))
    return []

import datetime

def main():
    page = load_progress() + 1  # Resume from next page
    plants = load_plants()
    total_pages = 337  # API confirmed 337 pages total
    today = datetime.date.today().isoformat()
    
    print(f"🌱 Fetching ALL Perenual plants (100 req/day, 30/page)")
    print(f"   Have: {len(plants)} plants | Resume from page: {page}/{total_pages}")
    print(f"   Daily requests remaining: ~{min(100, total_pages - page + 1)}")
    requests_today = 0
    max_requests = 100
    
    while page <= total_pages and requests_today < max_requests:
        print(f"  📄 Page {page}/{total_pages}...", end=' ')
        data, err, retry_after = fetch(page)
        
        if err == 429:
            hrs = retry_after // 3600 if retry_after else 0
            if hrs >= 1:
                print(f"\n  ⏹ Hit daily limit ({requests_today} pages fetched today)")
                print(f"  💡 Resume tomorrow at page {page}")
                print(f"  💾 Already saved {len(plants)} plants")
                break
            elif retry_after:
                print(f"⚠️ Rate limited for {retry_after}s, waiting...")
                time.sleep(retry_after)
                continue
            else:
                print("⚠️ 429, waiting 120s...")
                time.sleep(120)
                continue
        
        if err:
            print(f"⚠️ {err}, retrying in 30s...")
            time.sleep(30)
            continue
        
        items = data.get('data', [])
        if not items:
            print("⏹ No more plants!")
            break
        
        count = 0
        for p in items:
            pl = norm(p)
            if pl:
                pl['_pid'] = p['id']
                # Deduplicate by checking if we already have this plant
                existing_ids = {x.get('_pid') for x in plants}
                if p['id'] not in existing_ids:
                    plants.append(pl)
                    count += 1
        
        print(f"✓ +{count} new (total: {len(plants)})")
        save(plants, page)
        requests_today += 1
        
        if len(items) < 30:
            print("⏹ Last page!")
            break
        
        page += 1
        time.sleep(1)
    
    print(f"\n{'='*50}")
    print(f"✅ Done! {len(plants)} plants (used {requests_today} requests today)")
    print(f"   Pages {page-requests_today+1}-{page} fetched")
    print(f"   Next resume page: {page+1}")
    if requests_today >= max_requests:
        print(f"   ⏳ Hit daily limit. Run again tomorrow for more!")
    print(f"📝 Saved to: {OUTPUT}")

if __name__ == '__main__':
    if not API_KEY: print("Usage: python fetch_all_slow.py YOUR_KEY"); exit(1)
    main()

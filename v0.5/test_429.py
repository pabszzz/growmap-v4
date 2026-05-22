"""Check what Perenual 429 says & if key works"""
import urllib.request, urllib.error, json

url = 'https://perenual.com/api/species-list?key=sk-55gh6a023cb922e3c17205&page=1&per_page=1'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=15) as r:
        print(f"✅ {r.status} OK!")
        d = json.loads(r.read())
        print(f"   Plants: {len(d.get('data',[]))}, last_page: {d.get('last_page')}")
except urllib.error.HTTPError as e:
    print(f"❌ HTTP {e.code}")
    body = e.read().decode('utf-8', errors='replace')
    print(f"   Body: {body[:500]}")
    print(f"   Headers:")
    for k, v in e.headers.items():
        if 'retry' in k.lower() or 'limit' in k.lower() or 'rate' in k.lower():
            print(f"     {k}: {v}")

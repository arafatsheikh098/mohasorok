"""Build src/data/n1.json, the real N1 (Dhaka -> Chattogram) centreline and its bridges.

Data: OpenStreetMap contributors (ODbL), via the OSRM demo router (route geometry)
and the Overpass API (bridges, rivers and canals).

  python3 -I tools/build_n1.py RAW_DIR          # RAW_DIR gets osrm.json, bridges.json, water.json
  python3 -I tools/build_n1.py RAW_DIR --fetch  # download them first
"""
import json, math, sys, os, time, urllib.request, urllib.parse

RAW = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'n1.json')
UA = {'User-Agent': 'mohasorok-route-builder'}
START_KM, END_KM = 2.9, 234.75     # Jatrabari (end of the Hanif flyover) .. A.K. Khan, Chattogram

def fetch():
    pts = [(90.4255, 23.7215), (90.6180, 23.6020), (91.7850, 22.3600)]
    url = 'https://router.project-osrm.org/route/v1/driving/' + ';'.join(f'{a},{b}' for a, b in pts) + '?overview=full&geometries=geojson'
    osrm = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90))
    json.dump(osrm, open(os.path.join(RAW, 'osrm.json'), 'w'))
    r = osrm['routes'][0]['geometry']['coordinates']
    poly = ','.join(f'{la:.5f},{lo:.5f}' for lo, la in r[::5] + [r[-1]])
    for kind, filt in [('bridges', 'way["bridge"]["highway"~"^(trunk|primary|motorway|trunk_link)$"]'),
                       ('water', 'way["waterway"~"^(river|canal)$"]')]:
        q = f'[out:json][timeout:150];{filt}(around:60,{poly});out tags geom;'
        for attempt in range(8):          # public Overpass servers are often busy: retry across mirrors
            host = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'][attempt % 3]
            try:
                req = urllib.request.Request(host, data=urllib.parse.urlencode({'data': q}).encode(), headers=UA)
                json.dump(json.load(urllib.request.urlopen(req, timeout=200)), open(os.path.join(RAW, kind + '.json'), 'w'))
                break
            except Exception as e:
                print(kind, host, e); time.sleep(5)
        else:
            sys.exit(f'could not download {kind}')

if '--fetch' in sys.argv:
    fetch()

coords = json.load(open(os.path.join(RAW, 'osrm.json')))['routes'][0]['geometry']['coordinates']
lat0 = sum(c[1] for c in coords) / len(coords)
lon0 = sum(c[0] for c in coords) / len(coords)
KX = math.cos(math.radians(lat0)) * 111320.0
KZ = 110540.0
def xz(lon, lat): return ((lon - lon0) * KX, -(lat - lat0) * KZ)

P = [xz(*c) for c in coords]
# drop duplicate points
Q = [P[0]]
for p in P[1:]:
    if math.dist(p, Q[-1]) > 0.5: Q.append(p)
# cumulative distance, then trim to Jatrabari .. A.K. Khan
def cum(pts):
    c = [0.0]
    for i in range(1, len(pts)): c.append(c[-1] + math.dist(pts[i], pts[i - 1]))
    return c
def at(pts, c, s):
    i = max(0, min(len(pts) - 2, next((k for k in range(len(c) - 1) if c[k + 1] >= s), len(c) - 2)))
    f = (s - c[i]) / max(1e-9, c[i + 1] - c[i])
    return (pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f)
C = cum(Q)
a, b = START_KM * 1000, END_KM * 1000
T = [at(Q, C, a)] + [p for p, s in zip(Q, C) if a < s < b] + [at(Q, C, b)]
# resample every 5 m, then smooth (moving average over +-30 m keeps the real shape, removes polyline corners)
C = cum(T)
R = [at(T, C, s) for s in [k * 5.0 for k in range(int(C[-1] / 5) + 1)]]
W = 6
S = []
for i in range(len(R)):
    lo, hi = max(0, i - W), min(len(R), i + W + 1)
    S.append((sum(p[0] for p in R[lo:hi]) / (hi - lo), sum(p[1] for p in R[lo:hi]) / (hi - lo)))
S[0], S[-1] = R[0], R[-1]
# keep every 2nd point (10 m) for the file; the game resamples to 2 m
F = S[::2] + ([S[-1]] if (len(S) - 1) % 2 else [])
CF = cum(F)
L = CF[-1]

def project(x, z):
    best, bi = 1e18, 0
    for i in range(0, len(F)):
        d = (F[i][0] - x) ** 2 + (F[i][1] - z) ** 2
        if d < best: best, bi = d, i
    return CF[bi], math.sqrt(best)

# bridges: OSM bridge ways that the road actually runs along
br = []
for e in json.load(open(os.path.join(RAW, 'bridges.json')))['elements']:
    g = [xz(p['lon'], p['lat']) for p in e.get('geometry', [])]
    if len(g) < 2: continue
    pr = [project(*p) for p in g]
    if max(d for _, d in pr) > 22: continue                 # a road crossing the N1, not the N1 itself
    s0, s1 = min(s for s, _ in pr), max(s for s, _ in pr)
    if s1 - s0 < 25: continue
    t = e.get('tags', {})
    br.append([s0, s1, t.get('name:en') or '', t.get('name') or ''])
br.sort()
merged = []
for s0, s1, en, bn in br:      # the two carriageways are separate ways in OSM: merge overlapping ones
    if merged and s0 < merged[-1][1] + 15:
        m = merged[-1]; m[1] = max(m[1], s1); m[2] = m[2] or en; m[3] = m[3] or bn
    else: merged.append([s0, s1, en, bn])

# rivers / canals crossing each bridge (nearest waterway point to the bridge middle)
water = [(e.get('tags', {}), [xz(p['lon'], p['lat']) for p in e.get('geometry', [])]) for e in json.load(open(os.path.join(RAW, 'water.json')))['elements']]
bridges = []
for s0, s1, en, bn in merged:
    sc = (s0 + s1) / 2
    mx, mz = at(F, CF, sc)
    best, bt = 1e18, {}
    for tags, g in water:
        for p in g:
            d = (p[0] - mx) ** 2 + (p[1] - mz) ** 2
            if d < best: best, bt = d, tags
    near = math.sqrt(best) < (s1 - s0) / 2 + 80
    river_en = (bt.get('name:en') or '') if near else ''
    river_bn = (bt.get('name') or '') if near else ''
    kind = bt.get('waterway', 'canal') if near else 'canal'
    bridges.append({'s0': round(s0), 's1': round(s1), 'en': en, 'bn': bn, 'river': river_en, 'riverBn': river_bn, 'kind': kind})

out = {
    'source': 'OpenStreetMap contributors (ODbL) via OSRM + Overpass',
    'lat0': lat0, 'lon0': lon0, 'kx': KX, 'kz': KZ,
    'length': round(L, 1),
    'pts': [v for p in F for v in (round(p[0], 1), round(p[1], 1))],
    'bridges': bridges,
}
json.dump(out, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'length {L/1000:.1f} km, {len(F)} points, {len(bridges)} bridges -> {os.path.relpath(OUT)}')
for b in bridges:
    if b['s1'] - b['s0'] >= 120: print(f"  km {b['s0']/1000:6.1f}  {b['s1']-b['s0']:4d} m  {b['en'] or b['bn'] or '-'} / {b['river'] or b['riverBn'] or b['kind']}")

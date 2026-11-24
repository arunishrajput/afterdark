"""Builds the trailer's night-city map from OpenStreetMap data (Connaught Place, New Delhi).

Outputs
  public/map/base.png   buildings, parks and minor paths baked at 3000x3000 (supersampled)
  src/data/map.json     main streets as SVG paths, the play zone, Base, spawns, pins and walking routes

Map data (c) OpenStreetMap contributors, ODbL.
Run: python3 -I prep/build_map.py  (from trailer/)
"""
import heapq
import json
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
W = H = 3000
S = 1.7  # px per metre
SS = 2  # supersample

data = json.load(open(os.path.join(HERE, 'osm-connaught-place.json')))
els = data['elements']

park = next(e for e in els if e['tags'].get('name') == 'Rajiv Chowk Central Park')
lat0 = sum(p['lat'] for p in park['geometry']) / len(park['geometry'])
lng0 = sum(p['lon'] for p in park['geometry']) / len(park['geometry'])
KX = 111320 * math.cos(math.radians(lat0)) * S
KY = 110574 * S


def proj(p):
    return ((p['lon'] - lng0) * KX + W / 2, (lat0 - p['lat']) * KY + H / 2)


MAIN = {'secondary', 'tertiary', 'residential', 'secondary_link', 'unclassified', 'living_street', 'pedestrian', 'primary', 'trunk'}
MINOR = {'service', 'footway', 'path', 'cycleway', 'steps', 'corridor'}

# ── base image ──
img = Image.new('RGB', (W * SS, H * SS), (4, 6, 12))
dr = ImageDraw.Draw(img)


def P(pts):
    return [(x * SS, y * SS) for x, y in pts]


for e in els:
    t = e['tags']
    if t.get('leisure') == 'park' or t.get('landuse') == 'grass':
        pts = [proj(p) for p in e.get('geometry', [])]
        if len(pts) > 2:
            dr.polygon(P(pts), fill=(7, 20, 22))
for e in els:
    if 'building' in e['tags']:
        pts = [proj(p) for p in e.get('geometry', [])]
        if len(pts) > 2:
            dr.polygon(P(pts), fill=(13, 19, 34), outline=(26, 36, 62), width=2 * SS // 2)
for e in els:
    hw = e['tags'].get('highway')
    if hw in MINOR:
        pts = [proj(p) for p in e.get('geometry', [])]
        if len(pts) > 1:
            dr.line(P(pts), fill=(18, 28, 50), width=3 * SS // 2, joint='curve')
for e in els:
    hw = e['tags'].get('highway')
    if hw in MAIN:
        pts = [proj(p) for p in e.get('geometry', [])]
        if len(pts) > 1:
            w = 14 if hw in ('secondary', 'primary', 'trunk') else 9
            dr.line(P(pts), fill=(16, 24, 44), width=w * SS, joint='curve')
img = img.resize((W, H), Image.LANCZOS)
img.save(os.path.join(ROOT, 'public', 'map', 'base.png'), optimize=True)

# ── vector streets ──
roads = []
for e in els:
    hw = e['tags'].get('highway')
    if hw in MAIN:
        pts = [proj(p) for p in e.get('geometry', [])]
        if len(pts) > 1:
            d = 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts)
            length = sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
            cx = sum(x for x, _ in pts) / len(pts)
            cy = sum(y for _, y in pts) / len(pts)
            roads.append({'d': d, 'k': 1 if hw in ('secondary', 'primary', 'trunk') else 2, 'len': round(length, 1), 'r': round(math.dist((cx, cy), (W / 2, H / 2)), 1)})
roads.sort(key=lambda r: r['r'])

# ── walking graph ──
coords = {}
adj = {}
for e in els:
    hw = e['tags'].get('highway')
    if hw in MAIN or hw in ('service', 'footway', 'pedestrian', 'path'):
        ids = e.get('nodes', [])
        geo = e.get('geometry', [])
        for nid, g in zip(ids, geo):
            coords[nid] = proj(g)
        for a, b in zip(ids, ids[1:]):
            if a in coords and b in coords:
                w = math.dist(coords[a], coords[b])
                adj.setdefault(a, []).append((b, w))
                adj.setdefault(b, []).append((a, w))


def nearest(x, y):
    return min(adj, key=lambda n: (coords[n][0] - x) ** 2 + (coords[n][1] - y) ** 2)


def route(a, b):
    dist = {a: 0}
    prev = {}
    pq = [(0, a)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == b:
            break
        if d > dist.get(u, 1e18):
            continue
        for v, w in adj.get(u, []):
            nd = d + w
            if nd < dist.get(v, 1e18):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))
    if b not in dist:
        return None
    path = [b]
    while path[-1] != a:
        path.append(prev[path[-1]])
    path.reverse()
    return [[round(coords[n][0], 1), round(coords[n][1], 1)] for n in path]


# largest connected component only
seen = set()
comps = []
for n in adj:
    if n in seen:
        continue
    stack = [n]
    comp = set()
    while stack:
        u = stack.pop()
        if u in comp:
            continue
        comp.add(u)
        stack.extend(v for v, _ in adj[u] if v not in comp)
    seen |= comp
    comps.append(comp)
big = max(comps, key=len)
adj = {n: [(v, w) for v, w in adj[n] if v in big] for n in big}

CX, CY = W / 2, H / 2
ZONE_R = 640
base = nearest(CX, CY)
rng = random.Random(7)


def ring_node(angle_deg, frac):
    a = math.radians(angle_deg)
    return nearest(CX + math.cos(a) * ZONE_R * frac, CY + math.sin(a) * ZONE_R * frac)


spawns = [ring_node(-90 + i * 45 + 8, 0.78) for i in range(8)]
pins = [ring_node(a, f) for a, f in [(-60, 0.55), (-10, 0.8), (35, 0.5), (80, 0.85), (125, 0.6), (170, 0.82), (215, 0.5), (260, 0.75), (300, 0.9), (10, 0.35), (150, 0.35), (240, 0.3)]]

routes = {
    'scatter': [route(base, s) for s in spawns],
    'converge': [route(s, base) for s in [ring_node(-90 + i * 45 + 30, 0.92) for i in range(8)]],
    'toPin': [route(spawns[i], pins[i]) for i in range(8)],
}
# the infection walk: a long street walk for the victim
victim = route(ring_node(150, 0.62), ring_node(250, 0.62))
routes['victim'] = victim

out = {
    'size': [W, H],
    'center': [CX, CY],
    'zoneR': ZONE_R,
    'base': [round(coords[base][0], 1), round(coords[base][1], 1)],
    'spawns': [[round(coords[n][0], 1), round(coords[n][1], 1)] for n in spawns],
    'pins': [[round(coords[n][0], 1), round(coords[n][1], 1)] for n in pins],
    'roads': roads,
    'routes': routes,
}
json.dump(out, open(os.path.join(ROOT, 'src', 'data', 'map.json'), 'w'), separators=(',', ':'))

# ── preview ──
pv = Image.open(os.path.join(ROOT, 'public', 'map', 'base.png')).convert('RGB')
d2 = ImageDraw.Draw(pv)
for r in roads:
    pts = [tuple(map(float, s.strip().split())) for s in r['d'][1:].split('L')]
    d2.line(pts, fill=(46, 139, 255) if r['k'] == 1 else (40, 90, 170), width=3 if r['k'] == 1 else 2)
d2.ellipse([CX - ZONE_R, CY - ZONE_R, CX + ZONE_R, CY + ZONE_R], outline=(255, 255, 255), width=3)
cols = [(255, 59, 59), (124, 255, 79), (255, 176, 32), (200, 120, 255)]
for i, rt in enumerate(routes['scatter']):
    if rt:
        d2.line([tuple(p) for p in rt], fill=cols[i % 4], width=6)
if victim:
    d2.line([tuple(p) for p in victim], fill=(255, 255, 255), width=8)
for p in out['pins']:
    d2.ellipse([p[0] - 14, p[1] - 14, p[0] + 14, p[1] + 14], fill=(255, 176, 32))
bx, by = out['base']
d2.ellipse([bx - 20, by - 20, bx + 20, by + 20], fill=(255, 255, 255))
pv.resize((1000, 1000), Image.LANCZOS).save('/tmp/map_preview.png')
print('roads', len(roads), 'graph nodes', len(adj), 'routes ok', all(routes['scatter']) and all(routes['converge']) and all(routes['toPin']) and bool(victim))
print('json KB', os.path.getsize(os.path.join(ROOT, 'src', 'data', 'map.json')) // 1024)

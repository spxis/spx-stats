#!/usr/bin/env python3
"""Load the raw Overpass files of scripts/osm_venues/fetch.py into legacy_osm (migration 076_legacy_osm) and work out, per venue, the
footprint, the pitches, the field's bearing and a mapped outfield wall. Data (c) OpenStreetMap contributors, ODbL 1.0.
Usage: load.py <raw dir> <YYYY-MM-DD> [--sql-out FILE] [--geojson-out FILE]
  e.g. load.py ~/Projects/backups/spx-stats/raw/osm_venues/2026-10-13 2026-10-13 --sql-out load.sql
Reads PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD. With --sql-out the SQL is written to FILE instead of run (apply it with
scripts/mac/ds1-apply.sh). --geojson-out writes venues-osm.geojson, the derived features as a file that must be published under the
ODbL (see README.md). Rerunnable: every venue in the raw folder is deleted and loaded again. Pure Python 3, no packages.

What goes where
  legacy_osm.query    one row per request (the raw file, its sha256, the OSM database's timestamp)
  legacy_osm.element  every element the request returned, as it came: type, id, version, timestamp, tags, geometry as GeoJSON text
  legacy_osm.derived  what was picked for the venue and worked out from it (kind footprint, pitch or wall), see README.md for the rules
  legacy_osm.verdict  one row per venue: how its footprint was found (wikidata, proximity, none, ambiguous) and why

Rules (nothing is guessed; anything not clear is left out and written to legacy_osm.verdict)
  footprint  a closed way or multipolygon tagged wikidata=<qid> (leisure=stadium first, then building=stadium, then the largest);
             else a leisure=stadium or building=stadium polygon with no wikidata tag of its own that holds the venue's coordinates or lies
             within 150 m with no other candidate within 100 m of it, or whose name shares a word with the venue's name (within 400 m, one
             such candidate only); a polygon tagged with another Wikidata item is another venue and never used.
  pitch      a leisure=pitch or leisure=ice_rink polygon with one of the six sports whose centre lies inside the footprint; with no footprint,
             one that holds the venue's coordinates or lies within 60 m of them.
  bearing    baseball: degrees from north (0-360) from home plate to centre field. Home plate is the one vertex of the pitch polygon whose angle
             is 90 degrees (+-15) and whose two edges are each at least 25 m long and within 25 percent of each other (the two foul lines of a
             fan-shaped field); the bearing is the direction that halves that angle, and the polygon's centre must lie within 25 degrees of it
             and the farthest vertex at least 30 m away. No such vertex, or several (an infield drawn as a diamond has four), gives no bearing.
             Other sports: the long axis (0-180, 90 is east-west) of the smallest rectangle that encloses the pitch polygon, with its length
             and width; a pitch within 10 percent of square gives no bearing.
  wall       a barrier=wall, fence or retaining_wall way tagged sport=baseball or softball within 200 m of a baseball pitch's home plate.
Geometry is simplified to 1 m (Douglas-Peucker) and written with 6 decimals."""
import glob, hashlib, json, math, os, re, subprocess, sys

argv = sys.argv[1:]
sql_out = geojson_out = None
for flag in ("--sql-out", "--geojson-out"):
    if flag in argv:
        i = argv.index(flag)
        if flag == "--sql-out":
            sql_out = os.path.expanduser(argv[i + 1])
        else:
            geojson_out = os.path.expanduser(argv[i + 1])
        del argv[i:i + 2]
raw, day = os.path.expanduser(argv[0]), argv[1]

SPORTS = ["baseball", "american_football", "canadian_football", "soccer", "ice_hockey", "basketball"]
R = 6371008.8
TOL = 1.0
q = lambda v: "null" if v is None else "'" + str(v).replace("'", "''") + "'"
n = lambda v: "null" if v is None else str(v)


# ---- geometry (rings are lists of (lon, lat); metres come from a local projection round the venue) ------------------------
def projector(lat0, lon0):
    kx = math.radians(1) * R * math.cos(math.radians(lat0))
    ky = math.radians(1) * R
    return lambda p: ((p[0] - lon0) * kx, (p[1] - lat0) * ky)


def area(pts):
    """Signed area (positive when counter-clockwise) of a ring of projected points (closing point not repeated)."""
    return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) / 2


def centroid(pts):
    a = area(pts)
    if abs(a) < 1e-9:
        return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
    cx = cy = 0.0
    for i in range(len(pts)):
        x0, y0 = pts[i]; x1, y1 = pts[(i + 1) % len(pts)]
        c = x0 * y1 - x1 * y0
        cx += (x0 + x1) * c; cy += (y0 + y1) * c
    return cx / (6 * a), cy / (6 * a)


def inside(pt, pts):
    x, y = pt
    c = False
    for i in range(len(pts)):
        x0, y0 = pts[i]; x1, y1 = pts[i - 1]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
            c = not c
    return c


def seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = 0 if dx == dy == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def dist_to_ring(pt, pts):
    """Metres from a point to a ring: 0 when inside."""
    if inside(pt, pts):
        return 0.0
    return min(seg_dist(pt, pts[i - 1], pts[i]) for i in range(len(pts)))


def dp(pts, tol):
    """Douglas-Peucker on an open polyline of projected points; returns the indexes kept."""
    keep = {0, len(pts) - 1}
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        best, bi = -1.0, None
        for i in range(a + 1, b):
            d = seg_dist(pts[i], pts[a], pts[b])
            if d > best:
                best, bi = d, i
        if bi is not None and best > tol:
            keep.add(bi); stack += [(a, bi), (bi, b)]
    return sorted(keep)


def simplify_ring(ring, pr):
    """Simplify a closed ring (lon, lat; first point repeated at the end) to TOL metres; never fewer than 3 points."""
    pts = ring[:-1] if ring[0] == ring[-1] else ring
    xy = [pr(p) for p in pts]
    if len(pts) <= 4:
        return pts
    far = max(range(len(xy)), key=lambda i: math.hypot(xy[i][0] - xy[0][0], xy[i][1] - xy[0][1]))
    k1 = dp(xy[:far + 1], TOL)
    k2 = [far + i for i in dp(xy[far:] + [xy[0]], TOL)]
    idx = sorted(set(k1) | {i for i in k2 if i < len(pts)})
    out = [pts[i] for i in idx]
    return out if len(out) >= 3 else pts


def rnd(p):
    return [round(p[0], 6), round(p[1], 6)]


def poly_geojson(outer, inners, pr):
    rings = [simplify_ring(outer, pr)] + [simplify_ring(r, pr) for r in inners]
    rings = [[rnd(p) for p in r] + [rnd(r[0])] for r in rings]
    return {"type": "Polygon", "coordinates": rings}


def assemble(segments):
    """Join way pieces (lists of (lon, lat)) that share end points into closed rings; pieces that do not close are dropped."""
    segs = [list(s) for s in segments if len(s) >= 2]
    rings = []
    while segs:
        cur = segs.pop(0)
        while cur[0] != cur[-1]:
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur += s[1:]
                elif s[-1] == cur[-1]:
                    cur += s[::-1][1:]
                elif s[-1] == cur[0]:
                    cur = s[:-1] + cur
                elif s[0] == cur[0]:
                    cur = s[::-1][:-1] + cur
                else:
                    continue
                segs.pop(i)
                break
            else:
                break
        if cur[0] == cur[-1] and len(cur) >= 4:
            rings.append(cur)
    return rings


def shape(e):
    """The element's geometry as ('polygon', outer, [inners]) for the biggest ring, ('multi', [(outer, [inners])...]), ('line', pts) or ('point', pt); None if it has none."""
    t = e["type"]
    if t == "node":
        return ("point", (e["lon"], e["lat"]))
    if t == "way":
        pts = [(g["lon"], g["lat"]) for g in e.get("geometry", []) if g]
        if len(pts) >= 4 and pts[0] == pts[-1]:
            return ("polygon", pts, [])
        return ("line", pts) if len(pts) >= 2 else None
    if e.get("tags", {}).get("type") not in ("multipolygon", "building"):
        return None
    outers, inners = [], []
    for m in e.get("members", []):
        if m["type"] != "way" or not m.get("geometry") or any(g is None for g in m["geometry"]):
            continue
        (inners if m.get("role") == "inner" else outers if m.get("role") in ("outer", "outline", "") else []).append([(g["lon"], g["lat"]) for g in m["geometry"]])
    orings, irings = assemble(outers), assemble(inners)
    if not orings:
        return None
    parts = []
    for o in orings:
        oxy = [(p[0], p[1]) for p in o[:-1]]
        parts.append((o, [r for r in irings if inside(r[0], oxy)]))
    return ("polygon", parts[0][0], parts[0][1]) if len(parts) == 1 else ("multi", parts)


def geometry_json(sh):
    """Full-precision GeoJSON of a shape, as it came."""
    k = sh[0]
    if k == "point":
        return {"type": "Point", "coordinates": list(sh[1])}
    if k == "line":
        return {"type": "LineString", "coordinates": [list(p) for p in sh[1]]}
    if k == "polygon":
        return {"type": "Polygon", "coordinates": [[list(p) for p in r] for r in [sh[1]] + sh[2]]}
    return {"type": "MultiPolygon", "coordinates": [[[list(p) for p in r] for r in [o] + i] for o, i in sh[1]]}


def main_ring(sh):
    """(outer ring, inners) of a polygon shape; for a multipolygon its largest outer ring (by the lon/lat area)."""
    if sh[0] == "polygon":
        return sh[1], sh[2]
    return max(sh[1], key=lambda p: abs(area(p[0][:-1])))


def sports_of(tags):
    got = {s.strip() for s in re.split(r"[;,]", tags.get("sport", ""))}
    return [s for s in SPORTS if s in got]


def hull(pts):
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]


def azimuth(dx, dy):
    return math.degrees(math.atan2(dx, dy)) % 360


def long_axis(xy):
    """(azimuth 0-180 of the long side, length, width) of the smallest rectangle enclosing the points."""
    h = hull(xy)
    best = None
    for i in range(len(h)):
        a, b = h[i], h[(i + 1) % len(h)]
        ux, uy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(ux, uy)
        if d == 0:
            continue
        ux, uy = ux / d, uy / d
        s = [(p[0] * ux + p[1] * uy, -p[0] * uy + p[1] * ux) for p in h]
        w = max(p[0] for p in s) - min(p[0] for p in s)
        t = max(p[1] for p in s) - min(p[1] for p in s)
        if best is None or w * t < best[0]:
            best = (w * t, w, t, ux, uy)
    _, w, t, ux, uy = best
    if w >= t:
        return azimuth(ux, uy) % 180, w, t
    return azimuth(-uy, ux) % 180, t, w


def home_plate(xy):
    """Home plate and the bearing (0-360) from it to centre field for a baseball pitch polygon (projected points, closing point not repeated).
    Returns ((x, y), bearing, depth) or (None, reason, None). The foul lines are two straight runs of edges of the polygon, each at least 60 m
    long and within a factor 1.5 of each other, whose lines cross at about 90 degrees at a point P within 45 m of both runs' nearer ends (the corner is often cut off, so P need not be a
    vertex); every vertex must lie inside the wedge that opens from P between the two lines (3 m tolerance), the polygon's centre must lie within 25 degrees of the wedge's
    middle, its farthest vertex at least 50 m from P, P no more than 5 m from the polygon, and the polygon fill at least half the quarter circle of that radius. P is home plate and the wedge's middle line is the bearing. Two different answers
    (an infield drawn as a diamond has four) or none give no bearing."""
    m = len(xy)
    raw_edges = [(xy[i - 1], xy[i]) for i in range(m)]
    ang = lambda e: math.atan2(e[1][1] - e[0][1], e[1][0] - e[0][0])
    chains = []   # runs of consecutive edges that turn by at most 6 degrees: one foul line is often several short edges
    for e in raw_edges:
        if chains and abs((math.degrees(ang(chains[-1]) - ang(e)) + 180) % 360 - 180) <= 6:
            chains[-1] = (chains[-1][0], e[1])
        else:
            chains.append(e)
    if len(chains) > 1 and abs((math.degrees(ang(chains[-1]) - ang(chains[0])) + 180) % 360 - 180) <= 6:
        chains[0] = (chains[-1][0], chains[0][1]); chains.pop()
    edges = [(a, b, math.hypot(b[0] - a[0], b[1] - a[1])) for a, b in chains]
    edges = [e for e in edges if e[2] >= 60]
    found = []
    c = centroid(xy)
    for i in range(len(edges)):
        for j in range(i + 1, len(edges)):
            a1, b1, l1 = edges[i]; a2, b2, l2 = edges[j]
            d1 = ((b1[0] - a1[0]) / l1, (b1[1] - a1[1]) / l1); d2 = ((b2[0] - a2[0]) / l2, (b2[1] - a2[1]) / l2)
            if abs(d1[0] * d2[0] + d1[1] * d2[1]) > math.cos(math.radians(82)):
                continue   # lines not within 8 degrees of perpendicular
            den = d1[0] * d2[1] - d1[1] * d2[0]
            t = ((a2[0] - a1[0]) * d2[1] - (a2[1] - a1[1]) * d2[0]) / den
            P = (a1[0] + t * d1[0], a1[1] + t * d1[1])
            u, v = None, None
            ok = True
            for (a_, b_, l_, d_) in ((a1, b1, l1, d1), (a2, b2, l2, d2)):
                ta, tb = (a_[0] - P[0]) * d_[0] + (a_[1] - P[1]) * d_[1], (b_[0] - P[0]) * d_[0] + (b_[1] - P[1]) * d_[1]
                lo, hi = min(ta, tb), max(ta, tb)
                if lo >= -3 and lo <= 45:
                    sgn = 1
                elif hi <= 3 and hi >= -45:
                    sgn = -1
                else:
                    ok = False; break
                if u is None:
                    u = (sgn * d_[0], sgn * d_[1])
                else:
                    v = (sgn * d_[0], sgn * d_[1])
            if not ok:
                continue
            cr = u[0] * v[1] - u[1] * v[0]
            if cr < 0:
                u, v = v, u   # u is the clockwise-most foul line
            bx, by = u[0] + v[0], u[1] + v[1]
            bl = math.hypot(bx, by)
            bx, by = bx / bl, by / bl
            # inside the wedge: left of u's line looking along u... with u clockwise of v, a point is inside if it is counter-clockwise of u and clockwise of v
            inside_wedge = all((u[0] * (w[1] - P[1]) - u[1] * (w[0] - P[0])) >= -3 and (v[0] * (w[1] - P[1]) - v[1] * (w[0] - P[0])) <= 3 for w in xy)
            if not inside_wedge:
                continue
            depth = max(math.hypot(w[0] - P[0], w[1] - P[1]) for w in xy)
            bear = azimuth(bx, by)
            cdir = azimuth(c[0] - P[0], c[1] - P[1])
            if depth < 50 or abs((cdir - bear + 180) % 360 - 180) > 25 or dist_to_ring(P, xy) > 5 or max(l1, l2) > 1.5 * min(l1, l2) or abs(area(xy)) < 0.5 * math.pi / 4 * depth ** 2:
                continue
            found.append((P, bear, depth))
    distinct = []
    for P, bear, depth in found:
        if not any(math.hypot(P[0] - Q[0], P[1] - Q[1]) < 12 and abs((bear - b2_ + 180) % 360 - 180) < 6 for Q, b2_, _ in distinct):
            distinct.append((P, bear, depth))
    if len(distinct) == 1:
        return distinct[0]
    return None, ("no pair of long edges forms a 90 degree foul-line wedge round the polygon" if not distinct else
                  f"{len(distinct)} different foul-line wedges fit (an infield drawn as a diamond)"), None


# ---- read the raw files ------------------------------------------------------------------------------------------------------
manifest = {}
for line in open(raw + "/manifest.jsonl", encoding="utf-8"):
    d = json.loads(line)
    manifest[d["file"]] = d
batch = {}   # qid -> elements tagged wikidata=<qid> from wikidata/ids-*.json
for f in sorted(glob.glob(raw + "/wikidata/ids-*.json")):
    for e in json.load(open(f))["elements"]:
        for w in e.get("tags", {}).get("wikidata", "").split(";"):
            batch.setdefault(w.strip(), []).append((os.path.relpath(f, raw), e))
venues = {}
for line in list(open(raw + "/venues.tsv", encoding="utf-8"))[1:]:
    qid, name, lat, lon = line.rstrip("\n").split("\t")[:4]
    venues[qid] = (name, float(lat), float(lon))

STOP = {"stadium", "field", "park", "arena", "centre", "center", "the", "and", "of", "at", "memorial", "coliseum", "dome", "gardens", "garden"}
words = lambda s: {w for w in re.findall(r"[a-z0-9]+", (s or "").lower()) if len(w) > 2 and w not in STOP}

sql = ["begin;"]
stats = {"venues": 0, "elements": 0, "footprint_wikidata": 0, "footprint_proximity": 0, "footprint_none": 0, "footprint_ambiguous": 0,
         "pitches": 0, "bearings": 0, "walls": 0}
features = []
file_of = {}   # venue -> the raw file with its 400 m search (a batch of venues, or a file of its own from an earlier version)
for fname, m_ in manifest.items():
    for v_ in m_.get("venues", []):
        file_of[v_] = fname
for f_ in glob.glob(raw + "/overpass/Q*.json"):
    file_of.setdefault(os.path.basename(f_)[:-5], "overpass/" + os.path.basename(f_))
cache = {}


def raw_file(fname):
    if fname not in cache:
        body_ = open(os.path.join(raw, fname), "rb").read()
        cache[fname] = (body_, json.loads(body_))
    return cache[fname]


def element_dist(e, pr):
    """Metres from the origin (the venue) to an element: 0 inside a polygon, else the nearest vertex or edge."""
    sh_ = shape(e)
    if sh_ and sh_[0] in ("polygon", "multi"):
        return min(dist_to_ring((0.0, 0.0), [pr(p) for p in o[:-1]]) for o, _ in ([(sh_[1], 0)] if sh_[0] == "polygon" else sh_[1]))
    if sh_ and sh_[0] == "line":
        xy_ = [pr(p) for p in sh_[1]]
        return min(seg_dist((0.0, 0.0), xy_[i], xy_[i + 1]) for i in range(len(xy_) - 1))
    if sh_ and sh_[0] == "point":
        return math.hypot(*pr(sh_[1]))
    pts_ = [pr((g["lon"], g["lat"])) for m_ in e.get("members", []) for g in (m_.get("geometry") or []) if g]
    return min((math.hypot(*p_) for p_ in pts_), default=1e9)


for qid in sorted(venues):
    if qid not in file_of:
        continue
    vname, vlat, vlon = venues[qid]
    sfile = file_of[qid]
    body, d = raw_file(sfile)
    mf = manifest.get(sfile, {})
    pr = projector(vlat, vlon)
    own_elements = d["elements"] if sfile == f"overpass/{qid}.json" else [e for e in d["elements"] if element_dist(e, pr) <= 400]
    pt0 = (0.0, 0.0)
    stats["venues"] += 1
    sql += [f"delete from legacy_osm.derived where qid = {q(qid)};", f"delete from legacy_osm.verdict where qid = {q(qid)};",
            f"delete from legacy_osm.element where qid = {q(qid)};", f"delete from legacy_osm.query where qid = {q(qid)};"]
    sql.append("insert into legacy_osm.query (qid, name, lat, lon, file, sha256, fetched_at, osm_base, element_count, fetched_on) values "
               f"({q(qid)}, {q(vname)}, {vlat}, {vlon}, {q(sfile)}, {q(hashlib.sha256(body).hexdigest())}, {q(mf.get('fetched_at'))}, "
               f"{q(d.get('osm3s', {}).get('timestamp_osm_base'))}, {len(own_elements) + len(batch.get(qid, []))}, {q(day)});")
    els, seen = [], set()
    for ffile, e in [(sfile, e) for e in own_elements] + batch.get(qid, []):
        if (e["type"], e["id"]) in seen:
            continue
        seen.add((e["type"], e["id"]))
        sh = shape(e)
        tags = e.get("tags", {})
        els.append({"e": e, "tags": tags, "sh": sh, "key": (e["type"], e["id"])})
        sql.append("insert into legacy_osm.element (qid, osm_type, osm_id, version, osm_timestamp, tags, geometry, from_file) values "
                   f"({q(qid)}, {q(e['type'])}, {e['id']}, {n(e.get('version'))}, {q(e.get('timestamp'))}, {q(json.dumps(tags, ensure_ascii=False, separators=(',', ':')))}::jsonb, "
                   f"{q(json.dumps(geometry_json(sh), separators=(',', ':'))) if sh else 'null'}, {q(ffile)});")
        stats["elements"] += 1
    for x in els:   # projected outer ring and distance of the venue's coordinates for every polygon
        x["xy"] = x["dist"] = x["area"] = None
        if x["sh"] and x["sh"][0] in ("polygon", "multi"):
            outer, inners = main_ring(x["sh"])
            x["ring"], x["inners"] = outer, inners
            x["xy"] = [pr(p) for p in outer[:-1]]
            x["dist"] = dist_to_ring(pt0, x["xy"])
            x["area"] = abs(area(x["xy"]))
    # ---- footprint
    foot, how, reason = None, None, None
    wd = [x for x in els if x["xy"] and qid in x["tags"].get("wikidata", "").split(";")]
    if wd:
        pri = lambda x: (0 if x["tags"].get("leisure") == "stadium" else 1 if x["tags"].get("building") == "stadium" else 2, -x["area"])
        foot, how = min(wd, key=pri), "wikidata"
    else:
        vw = words(vname)
        cands = [x for x in els if x["xy"] and (x["tags"].get("leisure") == "stadium" or x["tags"].get("building") == "stadium") and not x["tags"].get("wikidata")]
        for x in cands:
            x["names"] = set()
            for k in ("name", "old_name", "alt_name", "loc_name", "short_name", "official_name"):
                for part in (x["tags"].get(k) or "").split(";"):
                    x["names"] |= words(part)
            x["named"] = bool(x["names"] & vw)
        cands.sort(key=lambda x: x["dist"])
        if not cands:
            other = [x for x in els if x["tags"].get("wikidata") and qid not in x["tags"]["wikidata"].split(";") and x["xy"] and x["dist"] is not None and x["dist"] < 150]
            reason = ("no element tagged wikidata=" + qid + " and no untagged stadium within 400 m" +
                      (f" (the stadium near the coordinates is tagged {other[0]['tags']['wikidata']})" if other else ""))
        else:
            c0 = cands[0]
            holding = [x for x in cands if x["dist"] == 0]
            named = [x for x in cands if x["named"]]
            if len(holding) == 1 or (c0["dist"] <= 150 and len(holding) == 0 and (len(cands) == 1 or cands[1]["dist"] >= c0["dist"] + 100)):
                foot, how = (holding[0] if holding else c0), "proximity"
            elif len(holding) > 1:
                reason = f"{len(holding)} untagged stadium outlines hold the coordinates"
            elif len(named) == 1:
                foot, how = named[0], "proximity"
            else:
                reason = f"{len(cands)} untagged stadium outlines within 400 m, none clearly the venue (nearest {c0['dist']:.0f} m)"
    verdict_how = how or ("ambiguous" if reason and "outlines" in reason else "none")
    stats["footprint_" + verdict_how] += 1
    out = []   # derived rows
    seq = {"footprint": 0, "pitch": 0, "wall": 0}
    if foot:
        seq["footprint"] = 1
        parts = foot["sh"][1] if foot["sh"][0] == "multi" else [(foot["ring"], foot["inners"])]
        gs = [poly_geojson(o, i, pr) for o, i in parts]
        fa = sum(abs(area([pr(p) for p in o[:-1]])) - sum(abs(area([pr(p) for p in r[:-1]])) for r in i) for o, i in parts)
        out.append(dict(kind="footprint", seq=1, x=foot, matched_by=how, distance_m=round(foot["dist"]), sport=None,
                        geo=gs[0] if len(gs) == 1 else {"type": "MultiPolygon", "coordinates": [g["coordinates"] for g in gs]}, area=round(fa)))
    # ---- pitches
    pitches = []
    for x in els:
        if x["tags"].get("leisure") not in ("pitch", "ice_rink") or not x["xy"] or x["sh"][0] != "polygon" or not sports_of(x["tags"]):
            continue
        c = centroid(x["xy"])
        if foot:
            if not inside(c, foot["xy"]):
                continue
            by = "inside_footprint"
        else:
            if x["dist"] > 60:
                continue
            by = "proximity"
        pitches.append((x, by, sports_of(x["tags"])))
    pitches.sort(key=lambda t: (t[0]["dist"], t[0]["key"]))
    for x, by, sp in pitches:
        seq["pitch"] += 1
        row = dict(kind="pitch", seq=seq["pitch"], x=x, matched_by=by, distance_m=round(x["dist"]), sport=";".join(sp),
                   geo=poly_geojson(x["ring"], [], pr), area=round(x["area"]))
        xy = x["xy"]
        if "baseball" in sp:
            hp, bear, depth = home_plate(xy) if len(xy) >= 4 else (None, "too few vertices", None)
            if hp:
                row.update(bearing=round(bear, 1) % 360, bearing_kind="home_to_center", length_m=round(depth, 1), width_m=None,
                           bearing_method="home plate = where the pitch polygon's two long foul-line edges cross at 90 degrees; bearing halves that wedge")
                row["ref"] = (vlat + hp[1] / (math.radians(1) * R), vlon + hp[0] / (math.radians(1) * R * math.cos(math.radians(vlat))))
                row["home_xy"] = hp
            else:
                row["note"] = bear
        else:
            az, ln, wd_ = long_axis(xy)
            if wd_ / ln < 0.9:
                row.update(bearing=round(az, 1) % 180, bearing_kind="long_axis", length_m=round(ln, 1), width_m=round(wd_, 1),
                           bearing_method="long axis of the smallest rectangle enclosing the pitch polygon")
            else:
                row["note"] = "pitch is nearly square: no long axis"
        out.append(row)
        stats["pitches"] += 1
        stats["bearings"] += "bearing" in row
    # ---- outfield wall (mapped)
    homes = [r["home_xy"] for r in out if r.get("home_xy")]
    if homes:
        for x in els:
            if x["tags"].get("barrier") in ("wall", "fence", "retaining_wall") and x["tags"].get("sport") in ("baseball", "softball") and x["sh"] and x["sh"][0] == "line":
                xy = [pr(p) for p in x["sh"][1]]
                if any(math.hypot(p[0] - h[0], p[1] - h[1]) <= 200 for h in homes for p in xy):
                    seq["wall"] += 1
                    idx = dp(xy, TOL)
                    out.append(dict(kind="wall", seq=seq["wall"], x=x, matched_by="proximity", distance_m=round(min(math.hypot(p[0], p[1]) for p in xy)), sport=x["tags"]["sport"],
                                    geo={"type": "LineString", "coordinates": [rnd(x["sh"][1][i]) for i in idx]}, area=None))
                    stats["walls"] += 1
    notes = [f"pitch {r['x']['key'][0]}/{r['x']['key'][1]}: {r['note']}" for r in out if r.get("note")]
    npitch, nbear = sum(r["kind"] == "pitch" for r in out), sum("bearing" in r for r in out)
    sql.append("insert into legacy_osm.verdict (qid, footprint, reason, pitch_count, bearing_count) values "
               f"({q(qid)}, {q(verdict_how)}, {q('; '.join([reason] * bool(reason) + notes) or None)}, {npitch}, {nbear});")
    for r in out:
        x = r["x"]
        ref = r.get("ref")
        sql.append("insert into legacy_osm.derived (qid, kind, seq, osm_type, osm_id, matched_by, distance_m, sport, osm_name, geojson, area_m2, bearing_deg, bearing_kind, bearing_method, ref_lat, ref_lon, length_m, width_m) values "
                   f"({q(qid)}, {q(r['kind'])}, {r['seq']}, {q(x['key'][0])}, {x['key'][1]}, {q(r['matched_by'])}, {n(r['distance_m'])}, {q(r['sport'])}, {q(x['tags'].get('name'))}, "
                   f"{q(json.dumps(r['geo'], separators=(',', ':')))}, {n(r['area'])}, {n(r.get('bearing'))}, {q(r.get('bearing_kind'))}, {q(r.get('bearing_method'))}, "
                   f"{n(round(ref[0], 6)) if ref else 'null'}, {n(round(ref[1], 6)) if ref else 'null'}, {n(r.get('length_m'))}, {n(r.get('width_m'))});")
        features.append({"type": "Feature", "geometry": r["geo"], "properties": {
            "wikidata": qid, "venue": vname, "kind": r["kind"], "seq": r["seq"], "sport": r["sport"], "osm": f"{x['key'][0]}/{x['key'][1]}",
            "osm_version": x["e"].get("version"), "osm_timestamp": x["e"].get("timestamp"), "matched_by": r["matched_by"], "distance_m": r["distance_m"],
            "area_m2": r["area"], "bearing_deg": r.get("bearing"), "bearing_kind": r.get("bearing_kind"),
            "home_plate": [round(ref[1], 6), round(ref[0], 6)] if ref else None, "length_m": r.get("length_m"), "width_m": r.get("width_m")}})
sql.append("commit;")

if geojson_out:
    with open(geojson_out, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "licence": "ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/)",
                   "attribution": "(c) OpenStreetMap contributors, ODbL 1.0, openstreetmap.org/copyright",
                   "note": "Venue outlines, pitches and bearings derived by spx-stats (spxn.com) from OpenStreetMap; outlines simplified to 1 m. Bearings are degrees clockwise from north.",
                   "features": features}, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote", geojson_out, len(features), "features")
if sql_out:
    open(sql_out, "w", encoding="utf-8").write("\n".join(sql) + "\n")
    print("wrote", sql_out, stats)
    raise SystemExit(0)
p = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], input="\n".join(sql), text=True, capture_output=True)
print(p.stdout[-500:], p.stderr[-2000:])
if p.returncode:
    raise SystemExit(1)
print("loaded", stats)

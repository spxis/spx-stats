#!/usr/bin/env python3
"""Fetch the OpenStreetMap outline of every home venue from the Overpass API (data (c) OpenStreetMap contributors, ODbL 1.0).
Usage: fetch.py [out dir] [--venues FILE] [--extra-qids FILE] [--limit N]
  out dir   default ~/Projects/backups/spx-stats/raw/osm_venues/<today> ($SPX_RAW_DIR replaces the root; outside the repo)
  --venues  a TSV with the header "qid<TAB>name<TAB>lat<TAB>lon" instead of the venues we hold (production's public view
            api.venue_place, read with the site's public read-only key; no credentials). A rerun may pass a longer list.
  --extra-qids  more venues, one Wikidata id per line (for example the world stadiums:
            select distinct venue_wikidata_id from core.soccer_match where venue_wikidata_id is not null). Their name and coordinates (P625)
            are read from Wikidata (CC0, wbgetentities, 50 ids a request, wikidata/coords-*.json); an id with no coordinates is left out and said.
  --limit   stop after N new requests (for a test)
Requests, one at a time, at least 8 s apart, with a User-Agent naming this project (a venue = a Wikidata id with the coordinates we hold):
  1. wikidata/ids-<hash>.json, one request per 40 venues: every node, way or relation tagged wikidata=<qid> for those ids;
  2. overpass/batch-<hash>.json, one request per 4 venues (manifest.jsonl names them), everything in a 400 m box round each one's coordinates:
     ways and relations tagged leisure=stadium or building=stadium; leisure=pitch or leisure=ice_rink ways and relations with sport baseball,
     american_football, canadian_football, soccer, ice_hockey or basketball; wall, fence or retaining_wall ways tagged sport=baseball or softball
     (a mapped outfield wall).
Deciding which of these belong to which venue is done later, by load.py, on the saved files; nothing is filtered here. (Files named
overpass/<qid>.json, from an earlier version of this script, hold one venue's search and are merged by load.py the same way.)
Overpass usage policy (wiki.openstreetmap.org/wiki/Overpass_API): a one-off use is fine below 10,000 queries and 1 GB a day and
10 minutes of processing in all; a regular use should stay below about 100 queries and 10 MB a day. This is a yearly run of about 100
queries (about 30 MB, run once on one day), one at a time; HTTP 429/406 waits at least 30 s, 502/503/504 waits longer each time.
Resumable: a file that exists is kept, so a rerun only fetches what is missing. <out>/venues.tsv and <out>/manifest.jsonl
(file, url, query, sha256, bytes, fetched_at, osm_base, venues) are written next to the responses."""
import hashlib, json, math, os, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import date, datetime, timezone

UA = {"User-Agent": "spx-stats/1.0 (https://spxn.com; john@spxis.com)"}
ENDPOINT = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter")   # OVERPASS_URL=https://lambert.openstreetmap.de/api/interpreter is the same service's own announced endpoint (api/status), for when the gateway answers 504
GAP = 8.0          # seconds between two requests (the policy asks for no parallel use; we leave a pause on top)
CHUNK = 40         # venues per wikidata request
PER = 4            # venues per 400 m search request
RADIUS = 400       # metres
SPORTS = "baseball|american_football|canadian_football|soccer|ice_hockey|basketball"
REST = "https://njpvfrceahkvnrduerkk.supabase.co/rest/v1/"
KEY = "sb_publishable_FmeiL6oX9_Mrb8psQZFSQg_YO_O4afC"   # Supabase's publishable key, public by design (web/src/lib/api/config.ts)

args = sys.argv[1:]
venues_file, limit = None, None
if "--venues" in args:
    i = args.index("--venues"); venues_file = os.path.expanduser(args[i + 1]); del args[i:i + 2]
extra_file = None
if "--extra-qids" in args:
    i = args.index("--extra-qids"); extra_file = os.path.expanduser(args[i + 1]); del args[i:i + 2]
if "--limit" in args:
    i = args.index("--limit"); limit = int(args[i + 1]); del args[i:i + 2]
out = os.path.expanduser(args[0] if args else os.environ.get("SPX_RAW_DIR", "~/Projects/backups/spx-stats/raw") + f"/osm_venues/{date.today().isoformat()}")
os.makedirs(out + "/overpass", exist_ok=True)
os.makedirs(out + "/wikidata", exist_ok=True)


def venues():
    """{qid: (name, lat, lon)}"""
    if venues_file:
        rows = [l.rstrip("\n").split("\t") for l in open(venues_file, encoding="utf-8")][1:]
        return {r[0]: (r[1], float(r[2]), float(r[3])) for r in rows if len(r) >= 4 and r[0].startswith("Q")}
    got, start = [], 0
    while True:
        req = urllib.request.Request(REST + "venue_place?select=wikidata_id,home_venue,latitude,longitude&order=wikidata_id", headers={
            "apikey": KEY, "Accept-Profile": "api", "Range": f"{start}-{start + 999}", **UA})
        page = json.load(urllib.request.urlopen(req, timeout=60))
        got += page
        if len(page) < 1000:
            break
        start += 1000
    res = {}
    for r in got:
        if r["wikidata_id"] and r["latitude"] is not None:
            res.setdefault(r["wikidata_id"], (r["home_venue"], float(r["latitude"]), float(r["longitude"])))
    return res


def query_ids(ids):
    return ('[out:json][timeout:120][maxsize:268435456];\n(\n' + "".join(f'  nwr["wikidata"="{i}"];\n' for i in ids) + ');\nout geom meta;\n')


def query(batch):
    """One query for several venues: batch is a list of (lat, lon)."""
    parts = []
    for lat, lon in batch:
        dy = RADIUS / 111195.0                      # a box of 400 m each way: much cheaper for Overpass than "around"; load.py keeps what is within 400 m
        dx = dy / math.cos(math.radians(lat))
        a = f"({lat - dy:.5f},{lon - dx:.5f},{lat + dy:.5f},{lon + dx:.5f})"
        parts.append(f'  way["leisure"="stadium"]{a};  rel["leisure"="stadium"]{a};\n'
                     f'  way["building"="stadium"]{a};  rel["building"="stadium"]{a};\n'
                     f'  way["leisure"~"^(pitch|ice_rink)$"]["sport"~"{SPORTS}"]{a};\n'
                     f'  rel["leisure"~"^(pitch|ice_rink)$"]["sport"~"{SPORTS}"]{a};\n'
                     f'  way["barrier"~"^(wall|fence|retaining_wall)$"]["sport"~"^(baseball|softball)$"]{a};\n')
    return '[out:json][timeout:180][maxsize:536870912];\n(\n' + "".join(parts) + ');\nout geom meta;\n'


def post(q):
    """The response bytes; waits and retries on 429/406/502/503/504 and network errors."""
    for n in range(12):
        try:
            req = urllib.request.Request(ENDPOINT, data=urllib.parse.urlencode({"data": q}).encode(), headers=UA)
            return urllib.request.urlopen(req, timeout=180).read()
        except urllib.error.HTTPError as e:
            print("HTTP", e.code, file=sys.stderr, flush=True)
            if e.code not in (429, 406, 502, 503, 504):
                raise
            time.sleep(max(30, int(e.headers.get("Retry-After") or 0)) + 30 * min(n, 3))
        except urllib.error.URLError as e:
            print("ERR", e, file=sys.stderr, flush=True); time.sleep(30 + 30 * n)
    raise SystemExit("gave up on a request")


def wikidata_places(qids):
    """{qid: (label, lat, lon)} read from Wikidata for ids we hold no coordinates for."""
    res = {}
    qids = sorted(qids)
    for i in range(0, len(qids), 50):
        chunk = qids[i:i + 50]
        name = f"wikidata/coords-{hashlib.sha1(','.join(chunk).encode()).hexdigest()[:10]}.json"
        path = os.path.join(out, name)
        if not os.path.exists(path):
            time.sleep(2.5)
            url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({"action": "wbgetentities", "ids": "|".join(chunk), "props": "claims|labels",
                                                                                   "languages": "en", "format": "json"})
            body = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
            json.loads(body)
            open(path, "wb").write(body)
        for q_, e in json.load(open(path))["entities"].items():
            for c in e.get("claims", {}).get("P625", []):
                v = c["mainsnak"].get("datavalue", {}).get("value")
                if v and c.get("rank") != "deprecated":
                    res[q_] = (e.get("labels", {}).get("en", {}).get("value") or q_, round(v["latitude"], 6), round(v["longitude"], 6))
                    break
            else:
                print("no coordinates on Wikidata:", q_, file=sys.stderr)
    return res


vs = venues()
if extra_file:
    want = {l.strip() for l in open(extra_file) if l.strip().startswith("Q")} - set(vs)
    vs.update(wikidata_places(want))
with open(out + "/venues.tsv", "w", encoding="utf-8") as f:
    f.write("qid\tname\tlat\tlon\n")
    for q, (nm, la, lo) in sorted(vs.items()):
        f.write(f"{q}\t{nm}\t{la}\t{lo}\n")
print(len(vs), "venues ->", out, flush=True)
manifest = open(out + "/manifest.jsonl", "a")
done = 0


def request(name, q, label, venues_=None):
    """Save the response to <out>/<name> unless it is there; True if a request was made."""
    global done
    path = os.path.join(out, name)
    if os.path.exists(path) or (limit is not None and done >= limit):
        return False
    time.sleep(GAP)
    body = post(q)
    d = json.loads(body)          # fails (and saves nothing) on anything but JSON
    if "elements" not in d:
        raise SystemExit(f"{name}: no elements in the response: {body[:200]!r}")
    if d.get("remark"):
        raise SystemExit(f"{name}: Overpass remark (query cut short?): {d['remark']}")
    with open(path, "wb") as f:
        f.write(body)
    manifest.write(json.dumps({"file": name, "url": ENDPOINT, "query": q, "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body),
                               "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                               "osm_base": d.get("osm3s", {}).get("timestamp_osm_base"), **({"venues": venues_} if venues_ else {})}) + "\n")
    manifest.flush()
    done += 1
    print(f"{label}: {len(d['elements'])} elements, {len(body)} bytes", flush=True)
    return True


ids = sorted(vs)
for i in range(0, len(ids), CHUNK):
    chunk = ids[i:i + CHUNK]
    request(f"wikidata/ids-{hashlib.sha1(','.join(chunk).encode()).hexdigest()[:10]}.json", query_ids(chunk), f"{len(chunk)} ids from {chunk[0]}")
covered = {os.path.basename(f)[:-5] for f in os.listdir(out + "/overpass") if f.startswith("Q")}   # files from an earlier version: one venue each
for line in open(out + "/manifest.jsonl"):
    covered |= set(json.loads(line).get("venues", []))
todo = [q_ for q_ in ids if q_ not in covered]
for i in range(0, len(todo), PER):
    chunk = todo[i:i + PER]
    request(f"overpass/batch-{hashlib.sha1(','.join(chunk).encode()).hexdigest()[:10]}.json", query([(vs[q_][1], vs[q_][2]) for q_ in chunk]),
            f"{len(chunk)} venues from {chunk[0]}", chunk)
print("done:", done, "new requests ->", out)

"""Download the Wikidata (CC0) items of venues that games are played at but core.venue does not hold yet, and the places up their
P131 (located in) chain, for scripts/game_venue/load.py.
Usage: fetch.py <qids.txt> <out dir>        qids.txt: venue item ids, whitespace separated (db/seed/*.csv list them; see README.md)
Writes <out>/wikidata/venues-<hash>.json (50 items each: labels, sitelinks and the claims load.py reads), chain-LEVEL-<hash>.json (the
P131 and P17 targets of the level before) and labels-<hash>.json (labels of the P31 classes); the hash is of the ids in the file. Keeps
files that exist, so a rerun only fetches batches it has not seen. Action API, one request per 2.5 s, User-Agent with a contact address, backing off on 429/503."""
import hashlib, json, os, sys, time, urllib.error, urllib.parse, urllib.request
UA = {"User-Agent": "spx-stats/1.0 (https://spxn.com; john@spxis.com)"}
ids_file, out = sys.argv[1], sys.argv[2]
os.makedirs(f"{out}/wikidata", exist_ok=True)

def get(url):
    for n in range(40):
        try:
            time.sleep(2.5)
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503, 504):
                raise
            time.sleep(int(e.headers.get("Retry-After") or 20) + 10 * (n % 6))
        except Exception as e:
            print("ERR", e, file=sys.stderr, flush=True); time.sleep(20)
    raise SystemExit("gave up: " + url[:90])

KEEP = {"P31", "P131", "P17", "P300", "P297", "P625", "P1083", "P571", "P576", "P1619", "P3999"}   # the claims load.py reads

def fetch(path, url):
    """Download once; the file keeps labels, sitelinks and only the claims we read (a country item alone is megabytes)."""
    p = f"{out}/{path}"
    if os.path.exists(p):
        return json.load(open(p))
    d = json.loads(get(url))
    for e in d.get("entities", {}).values():
        if "claims" in e:
            e["claims"] = {k: v for k, v in e["claims"].items() if k in KEEP}
    open(p, "w").write(json.dumps(d, separators=(",", ":"), ensure_ascii=False, sort_keys=True))
    return d

def wd(**kw):
    return "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({**kw, "format": "json"})

def tag(ids):
    """File name part for a batch of ids: the same ids always give the same file, so a changed list never reads a stale one."""
    return hashlib.md5(" ".join(ids).encode()).hexdigest()[:10]

def targets(ents, props):
    s = set()
    for e in ents:
        for p in props:
            for c in e.get("claims", {}).get(p, []):
                v = c["mainsnak"].get("datavalue", {}).get("value")
                if isinstance(v, dict) and "id" in v:
                    s.add(v["id"])
    return s

qids = sorted({q for q in open(ids_file).read().split() if q.startswith("Q")})
print(len(qids), "venues")
seen, classes, level_ents = set(qids), set(), []
cur = []
for i in range(0, len(qids), 50):
    r = fetch(f"wikidata/venues-{tag(qids[i:i + 50])}.json",
              wd(action="wbgetentities", ids="|".join(qids[i:i + 50]), props="claims|labels|sitelinks", languages="en", sitefilter="enwiki"))
    cur += list(r["entities"].values())
classes |= targets(cur, ["P31"])
for level in range(1, 7):                      # up the located-in chain
    nxt = sorted(targets(cur, ["P131", "P17"]) - seen)     # the next place up, and the country (P17) for its ISO code
    if not nxt:
        break
    seen |= set(nxt)
    cur = []
    for i in range(0, len(nxt), 50):
        r = fetch(f"wikidata/chain-{level}-{tag(nxt[i:i + 50])}.json",
                  wd(action="wbgetentities", ids="|".join(nxt[i:i + 50]), props="claims|labels", languages="en"))
        cur += list(r["entities"].values())
    classes |= targets(cur, ["P31"])
classes = sorted(classes)
for i in range(0, len(classes), 50):
    fetch(f"wikidata/labels-{tag(classes[i:i + 50])}.json",
          wd(action="wbgetentities", ids="|".join(classes[i:i + 50]), props="labels", languages="en", languagefallback=1))
print("done:", len(qids), "venues,", len(seen) - len(qids), "places,", len(classes), "classes ->", out)

"""Download the raw material for the spring training parks (ticket "Spring training parks: Cactus and Grapefruit, current and past").
Usage: fetch.py <out dir>        e.g. fetch.py ~/Projects/backups/spx-stats/raw/spring_training/2026-10-13

Writes, under <out dir> (a file that exists is kept, so a rerun only fetches what is missing; delete it to refresh):
  wikipedia/list.json       English Wikipedia "List of Major League Baseball spring training ballparks" (CC BY-SA 4.0): wikitext + revision id
  wikipedia/spring.json     English Wikipedia "Spring training" (the Cactus League and Grapefruit League articles redirect to it): wikitext + revision id
  wikipedia/parks-<hash>.json   the articles of the Florida and Arizona parks the list names (wikitext + revision id + Wikidata item id), 25 per file
  wikidata/venues-<hash>.json   Wikidata (CC0) items of those parks: labels, sitelinks and the claims load.py reads
  wikidata/chain-N-<hash>.json  the places up the P131 (located in) chain and the countries
  wikidata/labels-<hash>.json   labels of the P31 classes
Only English Wikipedia and Wikidata, through their APIs (https://www.mediawiki.org/wiki/API:Etiquette): one request at a time, 2.5 s apart, a
User-Agent naming this project and a contact address, backing off on 429/503. Nothing else is read; no Sports Reference, no ESPN."""
import hashlib, json, os, sys, time, urllib.error, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import parse_list

UA = {"User-Agent": "spx-stats/1.0 (https://spxn.com; john@spxis.com)"}
out = os.path.expanduser(sys.argv[1])
os.makedirs(f"{out}/wikipedia", exist_ok=True)
os.makedirs(f"{out}/wikidata", exist_ok=True)
LIST_TITLE = "List of Major League Baseball spring training ballparks"


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
            print("ERR", e, file=sys.stderr, flush=True)
            time.sleep(20)
    raise SystemExit("gave up: " + url[:90])


def tag(ids):
    return hashlib.md5(" ".join(ids).encode()).hexdigest()[:10]


def fetch(path, url, keep=None):
    p = f"{out}/{path}"
    if os.path.exists(p):
        return json.load(open(p))
    d = json.loads(get(url))
    if keep:
        for e in d.get("entities", {}).values():
            if "claims" in e:
                e["claims"] = {k: v for k, v in e["claims"].items() if k in keep}
    open(p, "w").write(json.dumps(d, separators=(",", ":"), ensure_ascii=False, sort_keys=True))
    return d


def wp(**kw):
    return "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
        {"action": "query", "prop": "revisions|pageprops", "ppprop": "wikibase_item", "rvprop": "ids|timestamp|content", "rvslots": "main",
         "redirects": 1, "format": "json", "formatversion": 2, **kw})


def wd(**kw):
    return "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({**kw, "format": "json"})


def wikitext(d):
    return d["query"]["pages"][0]["revisions"][0]["slots"]["main"]["content"]


lst = fetch("wikipedia/list.json", wp(titles=LIST_TITLE))
fetch("wikipedia/spring.json", wp(titles="Spring training"))
rev = lst["query"]["pages"][0]["revisions"][0]
print("list article revision", rev["revid"], rev["timestamp"])

titles = []
for p in parse_list.parks(wikitext(lst)):
    if p["link"] and (p["section"] or p["state_name"] in ("Florida", "Arizona")) and p["link"] not in titles:
        titles.append(p["link"])
print(len(titles), "park articles")
qids = set()
for i in range(0, len(titles), 25):
    batch = titles[i:i + 25]
    d = fetch(f"wikipedia/parks-{tag(batch)}.json", wp(titles="|".join(batch)))
    for pg in d["query"]["pages"]:
        q = pg.get("pageprops", {}).get("wikibase_item")
        if q:
            qids.add(q)
qids = sorted(qids)
print(len(qids), "Wikidata items")

KEEP = {"P31", "P131", "P17", "P300", "P297", "P625", "P1083", "P571", "P576", "P1619", "P3999", "P1448", "P2561", "P466"}


def targets(ents, props):
    s = set()
    for e in ents:
        for p in props:
            for c in e.get("claims", {}).get(p, []):
                v = c["mainsnak"].get("datavalue", {}).get("value")
                if isinstance(v, dict) and "id" in v:
                    s.add(v["id"])
    return s


seen, classes, cur = set(qids), set(), []
for i in range(0, len(qids), 50):
    r = fetch(f"wikidata/venues-{tag(qids[i:i + 50])}.json",
              wd(action="wbgetentities", ids="|".join(qids[i:i + 50]), props="claims|labels|sitelinks", languages="en", sitefilter="enwiki"), KEEP)
    cur += list(r["entities"].values())
classes |= targets(cur, ["P31"])
for level in range(1, 7):
    nxt = sorted(targets(cur, ["P131", "P17"]) - seen)
    if not nxt:
        break
    seen |= set(nxt)
    cur = []
    for i in range(0, len(nxt), 50):
        r = fetch(f"wikidata/chain-{level}-{tag(nxt[i:i + 50])}.json",
                  wd(action="wbgetentities", ids="|".join(nxt[i:i + 50]), props="claims|labels", languages="en"), KEEP)
        cur += list(r["entities"].values())
    classes |= targets(cur, ["P31"])
classes = sorted(classes)
for i in range(0, len(classes), 50):
    fetch(f"wikidata/labels-{tag(classes[i:i + 50])}.json",
          wd(action="wbgetentities", ids="|".join(classes[i:i + 50]), props="labels", languages="en", languagefallback=1))
print("done:", len(qids), "parks,", len(seen) - len(qids), "places,", len(classes), "classes ->", out)

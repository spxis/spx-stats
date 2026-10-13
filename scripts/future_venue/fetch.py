"""Download the raw material for the future venues (ticket "Venues: future stadiums (planned and under construction)").
Usage: fetch.py <out dir>        e.g. fetch.py ~/Projects/backups/spx-stats/raw/future_venue/2026-10-13

Writes, under <out dir> (a file that exists is kept, so a rerun only fetches what is missing; use a new dated folder to refresh):
  wikipedia/list-<league>.json  the five league venue lists (CC BY-SA 4.0): wikitext + revision id (nfl, mlb, nba, nhl, cfl)
  wikipedia/venues-<hash>.json  the articles the lists link from their future tables (wikitext + revision id + Wikidata item id), 20 per file
  wikipedia/clubs-<hash>.json   the clubs' articles: page properties only (the Wikidata item id)
  wikipedia/replaced-<hash>.json  the articles a venue's lead says it replaces ("will replace the Scotiabank Saddledome"): page properties only
  wikidata/search-<hash>.json   for a list row with a club but no article: a Wikidata search of its name (an item is taken only when its label is exactly the name)
  wikidata/venues-<hash>.json   Wikidata (CC0) items of those venues: labels, sitelinks and the claims load.py reads
  wikidata/clubs-<hash>.json    Wikidata items of the clubs (id, label, current home venue P115)
  wikidata/chain-N-<hash>.json  the places up the P131 (located in) chain and the countries
  wikidata/labels-<hash>.json   labels of the P31 / P5817 classes
  wikidata/sparql-state.json    every Wikidata sports venue in the United States or Canada whose state of use (P5817) is under construction,
                                under reconstruction, proposed, on hold or cancelled (discovery and cross-check; kept as returned)
Only English Wikipedia and Wikidata, through their APIs (https://www.mediawiki.org/wiki/API:Etiquette): one request at a time, 2.5 s apart, a
User-Agent naming this project and a contact address, backing off on 429/503. Nothing else is read; no Sports Reference, no ESPN."""
import hashlib, json, os, sys, time, urllib.error, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import parse_lists

UA = {"User-Agent": "spx-stats/1.0 (https://spxn.com; john@spxis.com)"}
out = os.path.expanduser(sys.argv[1])
os.makedirs(f"{out}/wikipedia", exist_ok=True)
os.makedirs(f"{out}/wikidata", exist_ok=True)


def get(url, headers=None):
    for n in range(40):
        try:
            time.sleep(2.5)
            return urllib.request.urlopen(urllib.request.Request(url, headers={**UA, **(headers or {})}), timeout=120).read()
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


def fetch(path, url, keep=None, headers=None):
    p = f"{out}/{path}"
    if os.path.exists(p):
        return json.load(open(p))
    d = json.loads(get(url, headers))
    if keep:
        for e in d.get("entities", {}).values():
            if "claims" in e:
                e["claims"] = {k: v for k, v in e["claims"].items() if k in keep}
    open(p, "w").write(json.dumps(d, separators=(",", ":"), ensure_ascii=False, sort_keys=True))
    return d


def wp(content=True, **kw):
    prop = "revisions|pageprops" if content else "pageprops"
    q = {"action": "query", "prop": prop, "ppprop": "wikibase_item", "redirects": 1, "format": "json", "formatversion": 2, **kw}
    if content:
        q.update({"rvprop": "ids|timestamp|content", "rvslots": "main"})
    return "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(q)


def wd(**kw):
    return "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({**kw, "format": "json"})


def wikitext(d):
    return d["query"]["pages"][0]["revisions"][0]["slots"]["main"]["content"]


venue_titles, club_titles, unlinked = [], [], []
for league, title in parse_lists.LISTS:
    d = fetch(f"wikipedia/list-{league}.json", wp(titles=title))
    rev = d["query"]["pages"][0]["revisions"][0]
    rows = parse_lists.future_rows(league, wikitext(d))
    print(league, title, "revision", rev["revid"], rev["timestamp"], len(rows), "future rows")
    for r in rows:
        if r["link"] and r["link"] not in venue_titles:
            venue_titles.append(r["link"])
        if not r["link"] and r["clubs"] and r["name"] not in unlinked:
            unlinked.append(r["name"])        # a row with a club but no article: look for a Wikidata item of exactly that label
        for c in r["clubs"]:
            if c["link"] and c["link"] not in club_titles:
                club_titles.append(c["link"])

qids = {"venues": set(), "clubs": set(), "replaced": set()}


def pull(kind, titles, content):
    for i in range(0, len(titles), 20):
        batch = titles[i:i + 20]
        d = fetch(f"wikipedia/{kind}-{tag(batch)}.json", wp(content, titles="|".join(batch)))
        for pg in d["query"]["pages"]:
            q = pg.get("pageprops", {}).get("wikibase_item")
            if q:
                qids[kind].add(q)
            if kind == "venues" and "revisions" in pg:     # the venue each article says it replaces (its lead): read the page properties of that article too
                t = parse_lists.lead_replaces(pg["revisions"][0]["slots"]["main"]["content"])
                if t and t not in replaced_titles:
                    replaced_titles.append(t)


replaced_titles = []
pull("venues", venue_titles, True)
pull("clubs", club_titles, False)
pull("replaced", replaced_titles, False)
for name in unlinked:
    d = fetch(f"wikidata/search-{tag([name])}.json", wd(action="wbsearchentities", search=name, language="en", limit=5))
    for hit in d.get("search", []):
        if hit.get("label", "").lower() == name.lower():
            qids["venues"].add(hit["id"])
print(len(venue_titles), "venue articles,", len(club_titles), "club articles;", len(qids["venues"]), "venue items,", len(qids["clubs"]), "club items")

KEEP = {"P31", "P131", "P17", "P300", "P297", "P625", "P1083", "P571", "P576", "P580", "P1619", "P5817", "P1365", "P1366", "P466", "P115", "P1448", "P137", "P118"}


def targets(ents, props):
    s = set()
    for e in ents:
        for p in props:
            for c in e.get("claims", {}).get(p, []):
                v = c["mainsnak"].get("datavalue", {}).get("value")
                if isinstance(v, dict) and "id" in v:
                    s.add(v["id"])
    return s


seen, classes, cur = set(), set(), []
for kind in ("venues", "clubs"):
    ids = sorted(qids[kind])
    seen |= set(ids)
    for i in range(0, len(ids), 50):
        r = fetch(f"wikidata/{kind}-{tag(ids[i:i + 50])}.json",
                  wd(action="wbgetentities", ids="|".join(ids[i:i + 50]), props="claims|labels|sitelinks|descriptions", languages="en", sitefilter="enwiki"), KEEP)
        if kind == "venues":
            cur += list(r["entities"].values())
        classes |= targets(r["entities"].values(), ["P31"])
# the venues' own links to other items (the venue it replaces, the club's home venue) and the places up the chain
seen |= set()
extra = sorted((targets(cur, ["P1365", "P1366"]) | qids["replaced"]) - seen)
for i in range(0, len(extra), 50):
    r = fetch(f"wikidata/chain-0-{tag(extra[i:i + 50])}.json",
              wd(action="wbgetentities", ids="|".join(extra[i:i + 50]), props="claims|labels|sitelinks", languages="en", sitefilter="enwiki"), KEEP)
seen |= set(extra)
for level in range(1, 7):
    nxt = sorted(targets(cur, ["P131", "P17", "P5817"]) - seen)
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

SPARQL = """SELECT ?item ?itemLabel ?state ?stateLabel ?countryLabel ?cityLabel ?plan ?inc WHERE {
  VALUES ?state { wd:Q12377751 wd:Q63187954 wd:Q64728694 wd:Q811683 wd:Q97317113 wd:Q30108381 }
  ?item wdt:P5817 ?state . ?item wdt:P31/wdt:P279* wd:Q1076486 . ?item wdt:P17 ?country . FILTER(?country IN (wd:Q30, wd:Q16))
  OPTIONAL { ?item wdt:P131 ?city } OPTIONAL { ?item wdt:P1619 ?plan } OPTIONAL { ?item wdt:P571 ?inc }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } ORDER BY ?itemLabel"""
fetch("wikidata/sparql-state.json", "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": SPARQL, "format": "json"}),
      headers={"Accept": "application/sparql-results+json"})
print("done ->", out)

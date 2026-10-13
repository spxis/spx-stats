#!/usr/bin/env python3
"""Download the English Wikipedia article (wikitext and revision id) of every stadium in db/seed/soccer_venue_ids.csv, for pitch_size.py.
Usage: fetch_wikipedia.py <out dir> <kyogijo grounds.data.json> <raw dir with wikidata/venues-*.json> [<another raw dir> ...]
Writes <out>/wikipedia/pages-<hash>.json.gz (10 articles each: title, pageid, revid, timestamp, wikitext, as the API gave them). The article title of an item
is its English sitelink in the venues-*.json files scripts/game_venue/fetch.py saved. A ground that kyogijo already read at a named revision with a
published pitch size (42 of them) is not fetched again: pitch_size.py reuses kyogijo's figure and revision. Keeps files that exist.
Action API, one request per 2.5 s, User-Agent with a contact address, backing off on 429/503. Wikipedia text is CC BY-SA 4.0."""
import csv, glob, gzip, hashlib, json, os, sys, time, urllib.error, urllib.parse, urllib.request
UA = {"User-Agent": "spx-stats/1.0 (https://spxn.com; john@spxis.com)"}
out = os.path.expanduser(sys.argv[1])
kyo = json.load(open(os.path.expanduser(sys.argv[2]), encoding="utf-8"))
raws = [os.path.expanduser(a) for a in sys.argv[3:]]
os.makedirs(f"{out}/wikipedia", exist_ok=True)

ids = [r["qid"] for r in csv.DictReader(open("db/seed/soccer_venue_ids.csv", newline="", encoding="utf-8"))]
skip = {g["wikidata"] for g in kyo if g.get("pitchSize") == "published"}
titles = {}
for raw in raws:
    for p in glob.glob(f"{raw}/wikidata/venues-*.json"):
        for q, e in json.load(open(p))["entities"].items():
            t = e.get("sitelinks", {}).get("enwiki", {}).get("title")
            if t:
                titles[q] = t
have = set()
for p in glob.glob(f"{out}/wikipedia/pages-*.json.gz"):
    have |= set(json.load(gzip.open(p, "rt", encoding="utf-8"))["spx_qids"].values())
want = [q for q in ids if q not in skip and q not in have and q in titles]
print(len(ids), "items;", len(skip & set(ids)), "read by kyogijo;", len(want), "to fetch;", len([q for q in ids if q not in titles]), "with no English article")


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
    raise SystemExit("gave up")


for i in range(0, len(want), 10):
    batch = want[i:i + 10]
    tag = hashlib.md5(" ".join(batch).encode()).hexdigest()[:10]
    path = f"{out}/wikipedia/pages-{tag}.json.gz"
    if os.path.exists(path):
        continue
    url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "formatversion": 2, "redirects": 1, "prop": "revisions", "rvprop": "ids|timestamp|content", "rvslots": "main",
        "titles": "|".join(titles[q] for q in batch)})
    d = json.loads(get(url))
    d["spx_qids"] = {titles[q]: q for q in batch}      # which item asked for which title (before redirects)
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
print("done ->", out)

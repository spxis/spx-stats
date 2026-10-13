#!/usr/bin/env python3
"""Fetch the venue items of every club's home venue from Wikidata (CC0), then each venue's English Wikipedia article (CC BY-SA 4.0).
Every response is saved byte for byte under <out>/ with a line in <out>/manifest.jsonl (file, url, sha256, bytes, fetched_at).
Usage: fetch.py [out dir]      default ~/Projects/backups/spx-stats/raw/wikidata_venues/<today> ($SPX_RAW_DIR replaces the root; outside the repo)
The venue ids come from the database named by PG* variables: the home venues of legacy_team_brand.team_place (--qids FILE
reads one Q-id per line instead). Wikidata: wbgetentities, 50 ids a request, one request every 2.5 s; Wikipedia: 20 titles a
request, one every 2.5 s; both back off on 429/503. Resumable: a file that exists is kept, so a rerun only fetches what is missing."""
import hashlib, json, os, subprocess, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import date, datetime, timezone

UA = {"User-Agent": "spx-stats/1.0 (https://spxn.com; john@spxis.com)"}
args = [a for a in sys.argv[1:]]
qids_file = None
if "--qids" in args:
    i = args.index("--qids"); qids_file = args[i + 1]; del args[i:i + 2]
out = os.path.expanduser(args[0] if args else os.environ.get("SPX_RAW_DIR", "~/Projects/backups/spx-stats/raw") + f"/wikidata_venues/{date.today().isoformat()}")
os.makedirs(out, exist_ok=True)
manifest = open(os.path.join(out, "manifest.jsonl"), "a")


def get(url):
    for n in range(40):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
        except urllib.error.HTTPError as e:
            print("HTTP", e.code, url[:80], file=sys.stderr, flush=True)
            if e.code not in (429, 503, 504):
                raise
            time.sleep(int(e.headers.get("Retry-After") or 20) + 10 + (n % 5) * 10)
        except urllib.error.URLError as e:
            print("ERR", e, file=sys.stderr, flush=True); time.sleep(20)
    raise SystemExit("gave up: " + url[:90])


def fetch(name, url):
    """Save the response to <out>/<name> unless it is there; return the parsed JSON."""
    path = os.path.join(out, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        time.sleep(2.5)
        body = get(url)
        with open(path, "wb") as f:
            f.write(body)
        manifest.write(json.dumps({"file": name, "url": url, "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body),
                                   "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}) + "\n")
        manifest.flush()
    return json.load(open(path))


def wd(**p):
    return "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({**p, "format": "json"})


if qids_file:
    qids = sorted({l.strip() for l in open(qids_file) if l.strip()})
else:
    q = ("select distinct place_qid from legacy_team_brand.team_place "
         "where kind = 'home_venue' and coalesce(rank, '') <> 'deprecated' and label is not null order by 1")
    qids = subprocess.run(["psql", "-At", "-v", "ON_ERROR_STOP=1", "-c", q], check=True, capture_output=True, text=True).stdout.split()
print(len(qids), "venues")

titles, refs, streets = [], set(), set()
for i in range(0, len(qids), 50):
    r = fetch(f"wikidata/entities-{i // 50 + 1:03d}.json",
              wd(action="wbgetentities", ids="|".join(qids[i:i + 50]), props="claims|labels|sitelinks", languages="en", sitefilter="enwiki"))
    for e in r["entities"].values():
        t = e.get("sitelinks", {}).get("enwiki", {}).get("title")
        if t:
            titles.append(t)
        for c in e.get("claims", {}).get("P669", []):   # located on street: the street item, with the house number (P670) as a qualifier
            v = c["mainsnak"].get("datavalue", {}).get("value")
            if isinstance(v, dict) and "id" in v:
                streets.add(v["id"])
        for p in ("P127", "P765", "P31", "P84", "P138"):
            for c in e.get("claims", {}).get(p, []):
                v = c["mainsnak"].get("datavalue", {}).get("value")
                if isinstance(v, dict) and "id" in v:
                    refs.add(v["id"])

refs = sorted(refs)
for i in range(0, len(refs), 50):
    fetch(f"wikidata/labels-{i // 50 + 1:03d}.json",
          wd(action="wbgetentities", ids="|".join(refs[i:i + 50]), props="labels", languages="en", languagefallback=1))

streets = sorted(streets)   # their own files, so a folder fetched before P669 was read only gains these
for i in range(0, len(streets), 50):
    fetch(f"wikidata/streets-{i // 50 + 1:03d}.json",
          wd(action="wbgetentities", ids="|".join(streets[i:i + 50]), props="labels", languages="en", languagefallback=1))

titles = sorted(set(titles))
for i in range(0, len(titles), 20):
    fetch(f"wikipedia/pages-{i // 20 + 1:03d}.json",
          "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({
              "action": "query", "prop": "revisions", "rvprop": "ids|timestamp|content", "rvslots": "main", "redirects": 1,
              "titles": "|".join(titles[i:i + 20]), "format": "json", "formatversion": 2}))
print("done:", len(qids), "venues,", len(refs), "linked items,", len(streets), "streets,", len(titles), "articles ->", out)

#!/usr/bin/env python3
"""Fetch the Wikidata item (CC0) of every city in db/seed/city.csv: the human settlements with that English label inside that
state or province (P131 chain to the item whose ISO 3166-2 code, P300, is the city's region), with coordinates (P625) and population (P1082).
Every response is saved byte for byte under <out>/<slug>.json with a line in <out>/manifest.jsonl (file, url, sha256, bytes, fetched_at).
Usage: fetch.py [out dir [slug ...]]      default ~/Projects/backups/spx-stats/raw/wikidata_city/<today> ($SPX_RAW_DIR replaces the root; outside the repo)
Slugs given: only those cities (a few new ones); none: every city.
One request every 2.5 s with the project's User-Agent; backs off on 429/503. Resumable: a file that exists is kept.
Run from the repo root. make_seed.py turns the raw files into db/seed/city_place.csv."""
import csv, hashlib, json, os, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import date, datetime, timezone

UA = {"User-Agent": "spx-stats/1.0 (https://spxn.com; john@spxis.com)", "Accept": "application/sparql-results+json"}
# Wikidata's English label where it is not the city's usual name.
LABEL = {"new-york": "New York City"}
# Cities that the label and region search does not find (Wikidata gives the item's region through a chain that stops short of the state):
# the item is found by the title of its English Wikipedia article instead, which is exact.
TITLE = {"east-rutherford": "East Rutherford, New Jersey", "jacksonville": "Jacksonville, Florida", "tampa": "Tampa, Florida",
         "canton": "Canton, Ohio", "hammond": "Hammond, Indiana", "haileybury": "Haileybury, Ontario", "la-rue": "La Rue, Ohio", "orange": "Orange, New Jersey",
         "tonawanda": "Tonawanda, New York"}
ENDPOINT ="https://query.wikidata.org/sparql"

out = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SPX_RAW_DIR", "~/Projects/backups/spx-stats/raw") + f"/wikidata_city/{date.today().isoformat()}")
os.makedirs(out, exist_ok=True)
manifest = open(os.path.join(out, "manifest.jsonl"), "a")


def get(url):
    for n in range(20):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
        except urllib.error.HTTPError as e:
            print("HTTP", e.code, url[:90], file=sys.stderr, flush=True)
            if e.code not in (429, 500, 502, 503, 504):
                raise
            time.sleep(int(e.headers.get("Retry-After") or 20) + 10 + (n % 5) * 10)
        except urllib.error.URLError as e:
            print("ERR", e, file=sys.stderr, flush=True)
            time.sleep(20)
    raise SystemExit("gave up: " + url[:90])


def query_title(title):
    return f"""SELECT ?c ?cLabel ?coord ?pop ?article WHERE {{
  ?article schema:about ?c; schema:isPartOf <https://en.wikipedia.org/>; schema:name "{title}"@en .
  ?c wdt:P625 ?coord .
  OPTIONAL {{ ?c wdt:P1082 ?pop }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}"""


def query(label, region):
    label = label.replace('"', '\\"')
    return f"""SELECT ?c ?cLabel ?coord ?pop ?article WHERE {{
  ?c rdfs:label "{label}"@en; wdt:P625 ?coord; wdt:P131+ ?r .
  ?r wdt:P300 "{region}" .
  ?c wdt:P31/wdt:P279* wd:Q486972 .
  OPTIONAL {{ ?c wdt:P1082 ?pop }}
  OPTIONAL {{ ?article schema:about ?c; schema:isPartOf <https://en.wikipedia.org/> }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}"""


with open("db/seed/city.csv", newline="", encoding="utf-8") as f:
    cities = [c for c in csv.DictReader(f) if len(sys.argv) < 3 or c["slug"] in sys.argv[2:]]
print(len(cities), "cities")
for c in cities:
    path = os.path.join(out, c["slug"] + ".json")
    if os.path.exists(path):
        continue
    url = ENDPOINT + "?" + urllib.parse.urlencode({"format": "json", "query": query_title(TITLE[c["slug"]]) if c["slug"] in TITLE else query(LABEL.get(c["slug"], c["name"]), c["region"])})
    time.sleep(2.5)
    body = get(url)
    with open(path, "wb") as g:
        g.write(body)
    manifest.write(json.dumps({"file": c["slug"] + ".json", "url": url, "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body),
                               "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}) + "\n")
    manifest.flush()
    print("fetched", c["slug"], len(json.loads(body)["results"]["bindings"]), "rows", flush=True)
print("raw files in", out)

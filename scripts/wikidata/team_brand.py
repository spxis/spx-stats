"""Collect team colours and logo files for one league from Wikidata (CC0) and
Wikimedia Commons, keeping every raw answer compact and dated.
Usage: team_brand.py <league code: nhl|nba|mlb|nfl|cfl> <out dir>
Writes <out>/<league>_teams.json (SPARQL), <league>_entities.json (Wikidata
claims we use), <league>_colours.json (colour items), <league>_commons.json
(Commons file info). Query service: wait 65 s between queries; Action API:
one request per 2 s."""
import json, os, sys, time, urllib.parse, urllib.request
UA = {"User-Agent": "spx-stats/0.1 (https://github.com/spxis/spx-stats)"}
LEAGUES = {"nhl": "Q1215892", "nba": "Q155223", "mlb": "Q1163715", "nfl": "Q1215884", "cfl": "Q1032175"}
league, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)

def get(url, tries=80):
    for n in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
        except urllib.error.HTTPError as e:
            print("HTTP", e.code, url[:80], file=sys.stderr)
            if e.code not in (429, 503, 504): raise
            # query service: at least 65 s; other APIs: what the server asks for, plus a margin
            wait = 65 if "query.wikidata.org" in url else int(e.headers.get("Retry-After") or 20) + 5 + (n % 5) * 5
            time.sleep(wait)
    raise SystemExit("gave up: " + url[:80])

def api(**p):
    time.sleep(2)
    return json.loads(get("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({**p, "format": "json"})))

q = """SELECT ?team ?teamLabel ?inception ?dissolved WHERE {
  ?team wdt:P118 wd:%s .
  ?team wdt:P31/wdt:P279* wd:Q12973014 .
  OPTIONAL { ?team wdt:P571 ?inception }
  OPTIONAL { ?team wdt:P576 ?dissolved }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}""" % LEAGUES[league]
tf = f"{out}/{league}_teams.json"
if not os.path.exists(tf):
    d = json.loads(get("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"})))
    rows = [{k: v["value"] for k, v in b.items()} for b in d["results"]["bindings"]]
    json.dump(rows, open(tf, "w"), indent=0)
rows = json.load(open(tf))
ids = sorted({r["team"].rsplit("/", 1)[1] for r in rows})
print(league, len(ids), "teams")

def time_of(c):
    try: return c["mainsnak"]["datavalue"]["value"]["time"]
    except KeyError: return None
def qual(c, p):
    for s in c.get("qualifiers", {}).get(p, []):
        v = s.get("datavalue", {}).get("value")
        if v: return v.get("time") if isinstance(v, dict) and "time" in v else v.get("amount") if isinstance(v, dict) else v
    return None

ef = f"{out}/{league}_entities.json"
if not os.path.exists(ef):
    ents = {}
    for i in range(0, len(ids), 50):
        r = api(action="wbgetentities", ids="|".join(ids[i:i+50]), props="labels|claims", languages="en")
        for qid, e in r["entities"].items():
            cl = e.get("claims", {})
            ents[qid] = {
                "label": e.get("labels", {}).get("en", {}).get("value"),
                "colours": [{"id": c["mainsnak"]["datavalue"]["value"]["id"], "ordinal": qual(c, "P1545"), "rank": c["rank"]}
                            for c in cl.get("P462", []) if "datavalue" in c["mainsnak"]],
                "logos": [{"file": c["mainsnak"]["datavalue"]["value"], "start": qual(c, "P580"), "end": qual(c, "P582"), "rank": c["rank"]}
                          for c in cl.get("P154", []) if "datavalue" in c["mainsnak"]],
                "leagues": [{"id": c["mainsnak"]["datavalue"]["value"]["id"], "start": qual(c, "P580"), "end": qual(c, "P582")}
                            for c in cl.get("P118", []) if "datavalue" in c["mainsnak"]],
            }
    json.dump(ents, open(ef, "w"), indent=0)
ents = json.load(open(ef))

cf = f"{out}/{league}_colours.json"
if not os.path.exists(cf):
    cids = sorted({c["id"] for e in ents.values() for c in e["colours"]})
    cols = {}
    for i in range(0, len(cids), 50):
        r = api(action="wbgetentities", ids="|".join(cids[i:i+50]), props="labels|claims", languages="en")
        for qid, e in r["entities"].items():
            hx = [c["mainsnak"]["datavalue"]["value"] for c in e.get("claims", {}).get("P465", []) if "datavalue" in c["mainsnak"]]
            cols[qid] = {"label": e.get("labels", {}).get("en", {}).get("value"), "hex": hx}
    json.dump(cols, open(cf, "w"), indent=0)

mf = f"{out}/{league}_commons.json"
if not os.path.exists(mf):
    files = sorted({l["file"] for e in ents.values() for l in e["logos"]})
    info = {}
    for i in range(0, len(files), 40):
        titles = "|".join("File:" + f for f in files[i:i+40])
        time.sleep(2)
        r = json.loads(get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
            "action": "query", "titles": titles, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 120,
            "iiextmetadatafilter": "LicenseShortName|License|Restrictions|UsageTerms", "format": "json"})))
        for p in r["query"]["pages"].values():
            ii = (p.get("imageinfo") or [{}])[0]
            md = ii.get("extmetadata", {})
            info[p["title"][5:]] = {"thumb": ii.get("thumburl"), "url": ii.get("url"), "page": ii.get("descriptionurl"),
                "licence": md.get("LicenseShortName", {}).get("value"), "licence_code": md.get("License", {}).get("value"),
                "restrictions": md.get("Restrictions", {}).get("value"), "missing": "missing" in p}
        norm = {n["from"][5:]: n["to"][5:] for n in r["query"].get("normalized", [])}
        for a, b in norm.items():
            if b in info: info[a] = info[b]
    json.dump(info, open(mf, "w"), indent=0)
print("done", league)

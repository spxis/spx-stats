"""Collect franchise facts for one league from Wikidata (CC0): the team items, then
every place, venue and owner they point at, and the labels of the classes,
surfaces and time zones those use.
Usage: fetch.py <league code: nhl|nba|mlb|nfl|cfl> <out dir>
Writes <out>/<league>_teams.json (SPARQL), <league>_team_entities.json,
<league>_places.json (venues, cities, regions, countries, owners) and
<league>_labels.json. Each file is compact JSON; claims are reduced to the
properties we use, with their rank and the start/end/point-in-time qualifiers.
Query service: wait 65 s between queries. Action API: one request per 2.5 s,
backing off when the server says 429. Resumable: a file that exists is kept."""
import json, os, sys, time, urllib.parse, urllib.request, urllib.error
UA = {"User-Agent": "spx-stats/0.1 (https://github.com/spxis/spx-stats)"}
LEAGUES = {"nhl": "Q1215892", "nba": "Q155223", "mlb": "Q1163715", "nfl": "Q1215884", "cfl": "Q1032175"}
league, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)

TEAM_PROPS = ["P115", "P159", "P131", "P17", "P127", "P571", "P576", "P1448", "P1813", "P749", "P118", "P31", "P1366", "P1365", "P155", "P156"]
PLACE_PROPS = ["P625", "P6375", "P281", "P1083", "P571", "P1619", "P576", "P3999", "P421", "P131", "P17", "P765", "P31",
               "P1448", "P2561", "P300", "P297", "P84", "P2130", "P1107", "P6687", "P856", "P1365", "P1366", "P580", "P582"]
LABEL_PROPS = ["P6687", "P297", "P300"]

def get(url, tries=60):
    for n in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
        except urllib.error.HTTPError as e:
            print("HTTP", e.code, url[:90], file=sys.stderr, flush=True)
            if e.code not in (429, 503, 504): raise
            wait = 65 if "query.wikidata.org" in url else int(e.headers.get("Retry-After") or 20) + 15 + (n % 6) * 10
            time.sleep(wait)
        except Exception as e:
            print("ERR", e, file=sys.stderr, flush=True); time.sleep(20)
    raise SystemExit("gave up: " + url[:90])

def api(**p):
    time.sleep(2.5)
    return json.loads(get("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({**p, "format": "json"})))

def dump(path, obj):
    with open(path, "w") as f: json.dump(obj, f, separators=(",", ":"), ensure_ascii=False, sort_keys=True)

def val(dv):
    """A snak's datavalue reduced to something small."""
    if not dv: return None
    t, v = dv["type"], dv["value"]
    if t == "wikibase-entityid": return v["id"]
    if t == "time": return {"t": v["time"], "p": v["precision"]}
    if t == "quantity": return {"a": v["amount"], "u": v.get("unit", "").rsplit("/", 1)[-1]}
    if t == "globecoordinate": return {"lat": v["latitude"], "lon": v["longitude"]}
    if t == "monolingualtext": return {"x": v["text"], "l": v["language"]}
    return v

def claims_of(cl, props):
    res = {}
    for p in props:
        rows = []
        for c in cl.get(p, []):
            if c["mainsnak"].get("snaktype") != "value": continue
            r = {"v": val(c["mainsnak"].get("datavalue")), "r": c["rank"][0]}
            q = {}
            for qp in ("P580", "P582", "P585", "P1107", "P642", "P518", "P276", "P6375"):
                for s in c.get("qualifiers", {}).get(qp, []):
                    if s.get("snaktype") == "value": q.setdefault(qp, []).append(val(s["datavalue"]))
            if q: r["q"] = q
            rows.append(r)
        if rows: res[p] = rows
    return res

def entities(ids, props, claim_props):
    res = {}
    ids = sorted(ids)
    for i in range(0, len(ids), 50):
        r = api(action="wbgetentities", ids="|".join(ids[i:i+50]), props=props, languages="en")
        for qid, e in r["entities"].items():
            if "missing" in e: res[qid] = {"missing": True}; continue
            d = {"label": e.get("labels", {}).get("en", {}).get("value")}
            al = [a["value"] for a in e.get("aliases", {}).get("en", [])]
            if al: d["aliases"] = al
            if "sitelinks" in e and "enwiki" in e["sitelinks"]: d["enwiki"] = e["sitelinks"]["enwiki"]["title"]
            if e.get("descriptions", {}).get("en"): d["desc"] = e["descriptions"]["en"]["value"]
            if claim_props: d["claims"] = claims_of(e.get("claims", {}), claim_props)
            res[qid] = d
    return res

def ids_in(ents, props):
    out = set()
    for e in ents.values():
        for p in props:
            for c in e.get("claims", {}).get(p, []):
                if isinstance(c["v"], str) and c["v"].startswith("Q"): out.add(c["v"])
    return out

# A. team list (SPARQL)
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
    dump(tf, [{k: v["value"] for k, v in b.items()} for b in d["results"]["bindings"]])
teams = sorted({r["team"].rsplit("/", 1)[1] for r in json.load(open(tf))})
print(league, len(teams), "teams", flush=True)

# B. team entities
ef = f"{out}/{league}_team_entities.json"
if not os.path.exists(ef): dump(ef, entities(teams, "labels|aliases|descriptions|sitelinks|claims", TEAM_PROPS))
tents = json.load(open(ef))

# C. places: follow the location chain (P131, P17) from venues, headquarters and located-in places
pf = f"{out}/{league}_places.json"
if not os.path.exists(pf):
    places, todo = {}, ids_in(tents, ["P115", "P159", "P131", "P17"])
    for depth in range(6):
        todo -= set(places)
        if not todo: break
        got = entities(todo, "labels|aliases|descriptions|sitelinks|claims", PLACE_PROPS)
        places.update(got)
        todo = ids_in(got, ["P131", "P17"])
        print("places", len(places), flush=True)
    owners = ids_in(tents, ["P127"]) | ids_in(places, ["P127"])
    owners -= set(places)
    places.update(entities(owners, "labels|descriptions", []))
    dump(pf, places)
places = json.load(open(pf))

# D. labels of classes, surfaces, time zones, architects
lf = f"{out}/{league}_labels.json"
if not os.path.exists(lf):
    ids = ids_in(places, ["P31", "P765", "P421", "P84"]) | ids_in(tents, ["P31"])
    dump(lf, entities(ids - set(places), "labels|descriptions|claims", LABEL_PROPS))
print("done", league, flush=True)

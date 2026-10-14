#!/usr/bin/env python3
"""Fetch the players of one league's teams from Wikidata (CC0), raw first: who played for the league's clubs (P54), when, and the
facts the site shows about them (birth, birthplace, citizenship, height, position, hand).

  wd_fetch.py <nba|cfl> <raw dir>

Stages (a file that exists is never fetched again, so a stopped run resumes):
  1. players.json     SPARQL on query.wikidata.org: every item with a "member of sports team" (P54) statement for a club of the league
                      (clubs: P118 league = the league, or a club that item replaced or was replaced by), with the club's English label.
  2. persons-NNN.json the player items (wbgetentities, 50 a call), keeping only the allow-listed claims (scripts/people/fetch.py KEEP/QUAL).
  3. items-NNN.json   the places, countries, positions and hands those items name; countries-NNN.json their countries.
At most one Action API request every 2 seconds, with the project's User-Agent; the query service is asked once and backed off on 429/5xx.

Privacy: the pruning of scripts/people/fetch.py drops everything but KEEP before anything is written. Nothing about ethnicity,
religion, health, sex or gender, family or politics is fetched or stored."""
import importlib.util, json, os, sys, time, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("people_fetch", os.path.join(HERE, "..", "people", "fetch.py"))
pf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pf)

# league item on Wikidata (the same ones scripts/wikidata/team_brand.py uses)
LEAGUES = {"nba": "Q155223", "cfl": "Q1032175"}

QUERY = """SELECT DISTINCT ?p ?t ?tLabel WHERE {
  { ?t wdt:P118 wd:%(lg)s } UNION { ?t p:P118/ps:P118 wd:%(lg)s } UNION
  { ?cur wdt:P118 wd:%(lg)s . ?t (wdt:P1365|wdt:P1366)+ ?cur . ?t wdt:P31/wdt:P279* wd:Q12973014 }
  ?p wdt:P54 ?t .
  ?p wdt:P31 wd:Q5 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}"""

def sparql(q, tries=6):
    delay = 65
    for _ in range(tries):
        req = urllib.request.Request("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"}),
                                     headers={"User-Agent": pf.UA, "Accept": "application/sparql-results+json"})
        try:
            with urllib.request.urlopen(req, timeout=170, context=pf.CTX) as r:
                d = json.loads(r.read())
            return [{k: v["value"] for k, v in b.items()} for b in d["results"]["bindings"]]
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ConnectionError) as e:
            print("query service:", e, file=sys.stderr)
            time.sleep(delay)
    raise SystemExit("Wikidata did not answer")

def qid(uri): return uri.rsplit("/", 1)[1]

PERSONS = ("persons", "personswp")   # personswp-*: players found through Wikipedia rosters (wp_fetch.py persons)

def entities_new(ids, base, raw):
    """wbgetentities for the ids not already in a file <base>-NNN.json of the raw dir; each call is saved under the next free number, so a rerun
    with a longer list only fetches what is new (scripts/people/fetch.py entities() numbers by position, which shifts when the list grows)."""
    done = set(pf.qids_from(raw, base))
    for f in os.listdir(raw):   # ids asked for and answered as merged or missing count as done too
        if f.startswith(base + "-"):
            d = json.load(open(f"{raw}/{f}", encoding="utf-8")); done |= set(d.get("requested", []))
    todo = [i for i in ids if i not in done]
    n = len([f for f in os.listdir(raw) if f.startswith(base + "-")])
    for b in pf.batches(todo):
        n += 1
        p = f"{raw}/{base}-{n:03d}.json"
        q = urllib.parse.urlencode({"action": "wbgetentities", "ids": "|".join(b), "props": "labels|claims|sitelinks", "languages": "en",
                                    "sitefilter": "enwiki", "format": "json", "formatversion": "2"})
        d = pf.get("https://www.wikidata.org/w/api.php?" + q)
        if "error" in d: raise RuntimeError(json.dumps(d["error"])[:300])
        ents = d.get("entities") or {}
        if isinstance(ents, list): ents = {e["id"]: e for e in ents}
        doc = {"requested": b, "entities": {k: pf.prune(v) for k, v in ents.items()}}
        redir = {r["from"]: r["to"] for e in (d.get("entities") or {}).values() if isinstance(e, dict) for r in [e.get("redirects")] if r}
        if redir: doc["redirects"] = redir
        pf.save(p, doc); print(p, len(doc["entities"]), flush=True)

def fetch_items(raw):
    """The places, countries and positions the person files name (items-*), then the countries of those places (countries-*)."""
    ents = pf.qids_from(raw, *PERSONS)
    have = set(ents)
    want = sorted(pf.refs(ents, ["P19", "P27", "P413", "P741", "P423"]) - have, key=lambda x: int(x[1:]))
    print(len(want), "places, countries, positions", flush=True)
    entities_new(want, "items", raw)
    items = pf.qids_from(raw, "items")
    more = sorted(pf.refs(items, ["P17"]) - have - set(items), key=lambda x: int(x[1:]))
    print(len(more), "countries", flush=True)
    entities_new(more, "countries", raw)

def main(league, raw):
    os.makedirs(raw, exist_ok=True)
    pj = f"{raw}/players.json"
    if not os.path.exists(pj):
        rows = sparql(QUERY % {"lg": LEAGUES[league]})
        doc = {"league": league, "league_qid": LEAGUES[league], "queried_on": time.strftime("%Y-%m-%d"),
               "rows": [{"player": qid(r["p"]), "team": qid(r["t"]), "team_label": r.get("tLabel")} for r in rows]}
        pf.save(pj, doc)
    doc = json.load(open(pj, encoding="utf-8"))
    ids = sorted({r["player"] for r in doc["rows"]}, key=lambda x: int(x[1:]))
    print(len(doc["rows"]), "player-club pairs,", len(ids), "players,", len({r["team"] for r in doc["rows"]}), "clubs", flush=True)
    entities_new(ids, "persons", raw)
    fetch_items(raw)

if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in LEAGUES:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])

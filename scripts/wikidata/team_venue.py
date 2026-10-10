"""Collect each team's home venue (P115, with P580/P582), headquarters (P159) and
located-in place (P131), and the label and coordinates (P625) of each, from
Wikidata (CC0). Run after team_brand.py for the same league.
Usage: team_venue.py <league> <out dir>. Writes <out>/<league>_venues.json
(per team) and <out>/<league>_places.json (per place). Action API: one request
per 2 s, backing off on 429."""
import json, sys, time, urllib.parse, urllib.request, os
UA = {"User-Agent": "spx-stats/0.1 (https://github.com/spxis/spx-stats)"}
league, out = sys.argv[1], sys.argv[2]
def api(**p):
    time.sleep(2)
    for n in range(80):
        try:
            return json.loads(urllib.request.urlopen(urllib.request.Request(
                "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({**p, "format": "json"}), headers=UA), timeout=120).read())
        except urllib.error.HTTPError as e:
            print("HTTP", e.code, file=sys.stderr)
            if e.code not in (429, 503, 504): raise
            time.sleep(int(e.headers.get("Retry-After") or 20) + 5 + (n % 5) * 5)
    raise SystemExit("gave up")
def qual(c, p):
    for s in c.get("qualifiers", {}).get(p, []):
        v = s.get("datavalue", {}).get("value")
        if isinstance(v, dict) and "time" in v: return v["time"]
    return None
def ids_of(cl, p):
    out = []
    for c in cl.get(p, []):
        v = c["mainsnak"].get("datavalue", {}).get("value")
        if isinstance(v, dict) and "id" in v:
            out.append({"id": v["id"], "start": qual(c, "P580"), "end": qual(c, "P582"), "rank": c["rank"]})
    return out
teams = sorted({r["team"].rsplit("/", 1)[1] for r in json.load(open(f"{out}/{league}_teams.json"))})
vf = f"{out}/{league}_venues.json"
if not os.path.exists(vf):
    ven = {}
    for i in range(0, len(teams), 50):
        r = api(action="wbgetentities", ids="|".join(teams[i:i+50]), props="claims")
        for qid, e in r["entities"].items():
            cl = e.get("claims", {})
            ven[qid] = {"home": ids_of(cl, "P115"), "hq": ids_of(cl, "P159"), "located_in": ids_of(cl, "P131")}
    json.dump(ven, open(vf, "w"), indent=0)
ven = json.load(open(vf))
pf = f"{out}/{league}_places.json"
if not os.path.exists(pf):
    pids = sorted({x["id"] for v in ven.values() for k in v.values() for x in k})
    pl = {}
    for i in range(0, len(pids), 50):
        r = api(action="wbgetentities", ids="|".join(pids[i:i+50]), props="labels|claims", languages="en", languagefallback=1)
        for qid, e in r["entities"].items():
            co = [c["mainsnak"]["datavalue"]["value"] for c in e.get("claims", {}).get("P625", []) if "datavalue" in c["mainsnak"]]
            pl[qid] = {"label": e.get("labels", {}).get("en", {}).get("value"),
                       "lat": co[0]["latitude"] if co else None, "lon": co[0]["longitude"] if co else None}
    json.dump(pl, open(pf, "w"), indent=0)
print("done venues", league)

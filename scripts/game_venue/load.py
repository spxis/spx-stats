"""Raw Wikidata files (scripts/game_venue/fetch.py) -> SQL for legacy_game_venue.venue (migration 067).
Usage: load.py <raw dir> <YYYY-MM-DD> --sql-out FILE        (apply FILE with scripts/mac/ds1-apply.sh; --dry-run first)
Rerunnable: upserts by Wikidata id. Reads only the files; no network, no database."""
import glob, json, os, sys
raw, day = sys.argv[1], sys.argv[2]
assert sys.argv[3] == "--sql-out"
out = os.path.expanduser(sys.argv[4])
ents, chain, labels = {}, {}, {}
for p in sorted(glob.glob(f"{raw}/wikidata/venues-*.json")):
    ents.update(json.load(open(p))["entities"])
for p in sorted(glob.glob(f"{raw}/wikidata/chain-*.json")):
    chain.update(json.load(open(p))["entities"])
for p in sorted(glob.glob(f"{raw}/wikidata/labels-*.json")):
    for q, e in json.load(open(p))["entities"].items():
        labels[q] = e.get("labels", {}).get("en", {}).get("value")
ALL = {**chain, **ents}
CITY_WORDS = ("city", "town", "municipality", "village", "borough", "commune", "township", "hamlet", "locality", "ward", "census-designated place")
NOT_CITY = ("county", "state", "province", "country", "metropolitan", "region", "district of", "territory", "prefecture")

def label(e):
    return e.get("labels", {}).get("en", {}).get("value")

def claims(e, p):
    """Statements of property p that are not deprecated, preferred first."""
    cs = [c for c in e.get("claims", {}).get(p, []) if c.get("rank") != "deprecated" and c["mainsnak"].get("snaktype") == "value"]
    return sorted(cs, key=lambda c: c["rank"] != "preferred")

def ids(e, p):
    return [c["mainsnak"]["datavalue"]["value"]["id"] for c in claims(e, p)]

def types(e):
    return [labels.get(t) or t for t in ids(e, "P31")]

def day_of(e, p):
    for c in claims(e, p):
        t = c["mainsnak"]["datavalue"]["value"]
        if t.get("precision", 0) >= 11 and not t["time"].startswith("-"):
            return t["time"][1:11].replace("-00", "-01")
    return None

def first_literal(e, p):
    for c in claims(e, p):
        v = c["mainsnak"]["datavalue"]["value"]
        if isinstance(v, str) and v != "FX":     # FX is metropolitan France's retired second code; the item also has FR
            return v

def q(v):
    if v is None:
        return "null"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def up(e):
    """The places above an item, nearest first (first P131 each time)."""
    res, seen, cur = [], set(), e
    for _ in range(8):
        nxt = ids(cur, "P131")
        if not nxt or nxt[0] in seen or nxt[0] not in ALL:
            break
        seen.add(nxt[0]); cur = ALL[nxt[0]]
        res.append((nxt[0], cur))
    return res

rows = []
for qid, e in sorted(ents.items()):
    if "missing" in e:
        continue
    ch = up(e)
    city = region = country = None
    # the nearest place that is a city (a borough or commune only when nothing above it is one); venue_city.csv corrects the rest
    for words in (("city",), CITY_WORDS):
        for cq, ce in ch:
            t = [x.lower() for x in types(ce)]
            if city is None and any(w in x for x in t for w in words) and not all(any(n in x for n in NOT_CITY) for x in t):
                city = label(ce)
    for cq, ce in ch:
        if region is None:
            region = first_literal(ce, "P300")
        if country is None:
            country = first_literal(ce, "P297")
    if country is None:
        for cid in ids(e, "P17"):
            if cid in ALL:
                country = first_literal(ALL[cid], "P297")
                break
    if country is None:
        for cq, ce in ch:
            for cid in ids(ce, "P17"):
                if cid in ALL and country is None:
                    country = first_literal(ALL[cid], "P297")
    lat = lon = None
    for c in claims(e, "P625"):
        v = c["mainsnak"]["datavalue"]["value"]
        lat, lon = round(v["latitude"], 6), round(v["longitude"], 6)
        break
    cap = None
    for c in claims(e, "P1083"):
        a = c["mainsnak"]["datavalue"]["value"]["amount"]
        cap = int(float(a))
        break
    title = e.get("sitelinks", {}).get("enwiki", {}).get("title")
    chain_json = json.dumps([{"qid": cq, "label": label(ce), "types": types(ce)} for cq, ce in ch], ensure_ascii=False)
    rows.append(f"({q(qid)}, {q(label(e))}, {q('{' + ','.join(json.dumps(t) for t in types(e)) + '}')}, {q(title)}, {q(lat)}, {q(lon)}, {q(cap)}, "
                f"{q(day_of(e, 'P1619') or day_of(e, 'P571'))}, {q(day_of(e, 'P3999') or day_of(e, 'P576'))}, {q(city)}, {q(region)}, {q(country)}, {q(chain_json)}::jsonb, {q(day)})")
with open(out, "w") as fo:
    fo.write("begin;\n")
    fo.write("insert into legacy_game_venue.venue (qid, label, instance_of, wikipedia_title, latitude, longitude, capacity, opened_on, closed_on, city, region, country_code, chain, fetched_on) values\n")
    fo.write(",\n".join(rows))
    fo.write("\non conflict (qid) do update set label = excluded.label, instance_of = excluded.instance_of, wikipedia_title = excluded.wikipedia_title,\n"
             "  latitude = excluded.latitude, longitude = excluded.longitude, capacity = excluded.capacity, opened_on = excluded.opened_on,\n"
             "  closed_on = excluded.closed_on, city = excluded.city, region = excluded.region, country_code = excluded.country_code,\n"
             "  chain = excluded.chain, fetched_on = excluded.fetched_on;\ncommit;\n")
print("wrote", out, len(rows), "venues;", sum(1 for r in rows if ", null, null, null, null" in r), "rows with no city/region/country (check)")

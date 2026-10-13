"""Raw files (scripts/future_venue/fetch.py) -> SQL for the legacy_future_venue tables (migration 074). No network, no database.
Usage: load.py <raw dir> <YYYY-MM-DD> --sql-out FILE        (apply FILE with scripts/mac/ds1-apply.sh; --dry-run first)
Rerunnable: the file empties the legacy_future_venue tables and fills them again in one transaction.

What it reads:
  wikipedia/list-<league>.json   the five league lists: one row per row of the "future" tables (legacy_future_venue.list_row, list_club)
  wikipedia/venues-*.json        each future venue's article: the infobox (groundbreaking, opened, capacity, coordinates) and the lead's "replaces"
  wikipedia/replaced-*.json, wikipedia/clubs-*.json   page properties: the Wikidata item of the replaced venue and of each club's article
  wikidata/*.json                the venues' Wikidata items (CC0): coordinates, capacity, dates, state of use, places, "replaces"
  wikidata/sparql-state.json     discovery list (legacy_future_venue.wikidata_state)
Nothing is guessed: a value the sources do not hold stays null, and db/build/203_future_venue.sql logs it in meta.data_issue."""
import glob, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import parse_lists as P

raw, day = os.path.expanduser(sys.argv[1]), sys.argv[2]
assert sys.argv[3] == "--sql-out"
out = os.path.expanduser(sys.argv[4])

# a Wikidata item an article is linked to that is another thing (checked against the item's own statements)
IGNORE_ITEM = {"Q21413764": "Wikidata item Q21413764 is CalgaryNEXT, the 2015 plan Scotia Place replaced (inception 2012), not Scotia Place"}

US = {"Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
      "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS", "Kentucky": "KY",
      "Louisiana": "LA", "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO",
      "Montana": "MT", "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
      "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI",
      "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
      "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY", "D.C.": "DC", "District of Columbia": "DC"}
CA = {"Alberta": "AB", "British Columbia": "BC", "Manitoba": "MB", "New Brunswick": "NB", "Newfoundland and Labrador": "NL", "Nova Scotia": "NS",
      "Ontario": "ON", "Prince Edward Island": "PE", "Quebec": "QC", "Saskatchewan": "SK"}


def q(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def qj(v):
    return q(json.dumps(v, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def qa(vs):
    return "array[" + ",".join(q(x) for x in vs) + "]::text[]" if vs else "null"


def location(text):
    """'Nashville, Tennessee' -> (city, state word, ISO 3166-2, country). 'TBD' and a place with no state give nulls."""
    if not text or text.strip().upper() == "TBD" or "," not in text:
        return (None if (not text or text.strip().upper() == "TBD") else text.strip()), None, None, None
    city, state = [x.strip() for x in text.rsplit(",", 1)]
    if state in US:
        return city, state, "US-" + US[state], "US"
    if state in CA:
        return city, state, "CA-" + CA[state], "CA"
    return city, state, None, None


# ---------------------------------------------------------------- Wikipedia
pages, redir = {}, {}
for kind in ("venues", "replaced", "clubs"):
    for p in sorted(glob.glob(f"{raw}/wikipedia/{kind}-*.json")):
        d = json.load(open(p))
        for pg in d["query"]["pages"]:
            pages[pg["title"]] = pg
        for r in d["query"].get("normalized", []) + d["query"].get("redirects", []):
            redir[r["from"]] = r["to"]


def page_of(title):
    t = title
    for _ in range(4):
        t = redir.get(t, t)
    return pages.get(t)


def qid_of(title):
    pg = page_of(title) if title else None
    return pg.get("pageprops", {}).get("wikibase_item") if pg else None


# ---------------------------------------------------------------- Wikidata
ents, chain = {}, {}
for p in sorted(glob.glob(f"{raw}/wikidata/venues-*.json")):
    ents.update(json.load(open(p))["entities"])
for p in sorted(glob.glob(f"{raw}/wikidata/chain-*.json")):
    chain.update(json.load(open(p))["entities"])
labels = {}
for p in sorted(glob.glob(f"{raw}/wikidata/labels-*.json")):
    for qid, e in json.load(open(p))["entities"].items():
        labels[qid] = e.get("labels", {}).get("en", {}).get("value")
ALL = {**chain, **ents}
searched = {}
for p in sorted(glob.glob(f"{raw}/wikidata/search-*.json")):
    d = json.load(open(p))
    for hit in d.get("search", []):
        searched.setdefault(hit.get("label", "").lower(), hit["id"])


def label(e):
    return e.get("labels", {}).get("en", {}).get("value")


def claims(e, p):
    cs = [c for c in e.get("claims", {}).get(p, []) if c.get("rank") != "deprecated" and c["mainsnak"].get("snaktype") == "value"]
    return sorted(cs, key=lambda c: c["rank"] != "preferred")


def ids(e, p):
    return [c["mainsnak"]["datavalue"]["value"]["id"] for c in claims(e, p)]


def year_of(e, p):
    for c in claims(e, p):
        t = c["mainsnak"]["datavalue"]["value"]
        if t.get("precision", 0) >= 9 and not t["time"].startswith("-"):
            return int(t["time"][1:5])
    return None


def first_literal(e, p):
    for c in claims(e, p):
        v = c["mainsnak"]["datavalue"]["value"]
        if isinstance(v, str):
            return v


CITY_WORDS = ("city", "town", "municipality", "village", "borough", "census-designated place", "township", "hamlet", "locality")


def places(e):
    res, seen, cur = [], set(), e
    for _ in range(8):
        nxt = ids(cur, "P131")
        if not nxt or nxt[0] in seen or nxt[0] not in ALL:
            break
        seen.add(nxt[0])
        cur = ALL[nxt[0]]
        res.append(cur)
    return res


sql = ["begin;"]
for t in ("wikidata_state", "wikidata_venue", "article", "list_club", "list_row", "source_page"):
    sql.append(f"delete from legacy_future_venue.{t};")

# ---------------------------------------------------------------- list rows
list_rows, src_rows = [], []
for league, title in P.LISTS:
    d = json.load(open(f"{raw}/wikipedia/list-{league}.json"))
    pg = d["query"]["pages"][0]
    rev = pg["revisions"][0]
    src_rows.append((pg["title"], rev["revid"], rev["timestamp"], pg.get("pageprops", {}).get("wikibase_item")))
    for r in P.future_rows(league, rev["slots"]["main"]["content"]):
        list_rows.append({**r, "league": league, "list_title": pg["title"], "list_revision": rev["revid"]})

row_sql, club_sql, used_articles = [], [], {}
for n, r in enumerate(list_rows, 1):
    pg = page_of(r["link"]) if r["link"] else None
    qid, ignored = qid_of(r["link"]) if pg else None, None
    if qid in IGNORE_ITEM:
        qid, ignored = None, IGNORE_ITEM[qid]
    if qid is None and not r["link"] and r["clubs"]:
        qid = searched.get(r["name"].lower())                 # an item whose label is exactly the name (fetch.py kept only those searches)
    city, state, region, country = location(r["location"])
    if pg and "revisions" in pg:
        used_articles[pg["title"]] = pg
    row_sql.append(f"({n}, {q(r['league'])}, {q(r['table'])}, {q(r['name'])}, {q(r['link'])}, {q(pg['title'] if pg else None)}, {q(qid)}, {q(ignored)}, "
                   f"{q(r['location'])}, {q(city)}, {q(state)}, {q(region)}, {q(country)}, {q(r['capacity'])}, {q(r['opening_text'])}, {q(r['opening_year'])}, "
                   f"{q(r['status_text'])}, {q(r['roof'])}, {q(r['surface'])}, {q(r['list_title'])}, {r['list_revision']}, {qj(r['cells'])})")
    for c in r["clubs"]:
        club_sql.append(f"({n}, {q(c['text'])}, {q(c['link'])}, {q(qid_of(c['link']))})")
    r["qid"] = qid

for t, pg in sorted(used_articles.items()):
    src_rows.append((pg["title"], pg["revisions"][0]["revid"], pg["revisions"][0]["timestamp"], pg.get("pageprops", {}).get("wikibase_item")))
sql.append("insert into legacy_future_venue.source_page (title, revision_id, revision_at, wikidata_id, fetched_on) values\n"
           + ",\n".join(f"({q(t)}, {rv}, {q(ts)}, {q(w)}, {q(day)})" for t, rv, ts, w in src_rows) + ";")
sql.append("insert into legacy_future_venue.list_row (row_no, league, table_caption, name, article, resolved_article, wikidata_id, wikidata_ignored, location_text, "
           "city, state_name, region, country_code, capacity, opening_text, opening_year, status_text, roof, surface, list_title, list_revision, cells) values\n"
           + ",\n".join(row_sql) + ";")
if club_sql:
    sql.append("insert into legacy_future_venue.list_club (row_no, club_text, club_link, club_wikidata_id) values\n" + ",\n".join(club_sql) + ";")

# ---------------------------------------------------------------- articles
art_sql = []
for t, pg in sorted(used_articles.items()):
    text = pg["revisions"][0]["slots"]["main"]["content"]
    ib = P.infobox(text)
    c = P.coord(ib.get("coordinates"))
    cap_t = P.plain(ib.get("capacity"))
    rep = P.lead_replaces(text)
    rep_pg = page_of(rep) if rep else None
    qid = pg.get("pageprops", {}).get("wikibase_item")
    art_sql.append(f"({q(t)}, {pg['revisions'][0]['revid']}, {q(None if qid in IGNORE_ITEM else qid)}, {q(P.plain(ib.get('location')) or None)}, "
                   f"{q(c[0] if c else None)}, {q(c[1] if c else None)}, {q(P.plain(ib.get('groundbreaking')) or None)}, {q(P.plain(ib.get('opened')) or None)}, "
                   f"{q(cap_t or None)}, {q(P.to_int(cap_t) if cap_t.upper() != 'TBD' else None)}, {q(rep_pg['title'] if rep_pg else rep)}, "
                   f"{q(rep_pg.get('pageprops', {}).get('wikibase_item') if rep_pg else None)})")
if art_sql:
    sql.append("insert into legacy_future_venue.article (title, revision_id, wikidata_id, location_text, latitude, longitude, groundbreaking_text, opened_text, "
               "capacity_text, capacity, replaces_title, replaces_wikidata) values\n" + ",\n".join(art_sql) + ";")

# ---------------------------------------------------------------- Wikidata venues
ven_sql, done = [], set()
for r in list_rows:
    qid = r["qid"]
    if not qid or qid in done or qid not in ents or "missing" in ents[qid]:
        continue
    done.add(qid)
    e = ents[qid]
    ch = places(e)
    city = region = country = None
    for ce in ch:
        t = [(labels.get(x) or "").lower() for x in ids(ce, "P31")]
        if city is None and any(w in x for x in t for w in CITY_WORDS):
            city = label(ce)
        if region is None:
            region = first_literal(ce, "P300")
        if country is None:
            country = first_literal(ce, "P297")
    if country is None:
        for cid in ids(e, "P17"):
            if cid in ALL:
                country = first_literal(ALL[cid], "P297")
                break
    lat = lon = None
    for c in claims(e, "P625"):
        v = c["mainsnak"]["datavalue"]["value"]
        lat, lon = round(v["latitude"], 6), round(v["longitude"], 6)
        break
    cap = None
    for c in claims(e, "P1083"):
        cap = int(float(c["mainsnak"]["datavalue"]["value"]["amount"]))
        break
    title = e.get("sitelinks", {}).get("enwiki", {}).get("title")
    ven_sql.append(f"({q(qid)}, {q(label(e))}, {q(e.get('descriptions', {}).get('en', {}).get('value'))}, {qa([labels.get(x) or x for x in ids(e, 'P31')])}, "
                   f"{q(title)}, {q(lat)}, {q(lon)}, {q(cap)}, {q(year_of(e, 'P571'))}, {q(year_of(e, 'P1619'))}, {q(year_of(e, 'P580'))}, "
                   f"{qa([labels.get(x) or ALL.get(x, {}).get('labels', {}).get('en', {}).get('value') or x for x in ids(e, 'P5817')])}, "
                   f"{q(city)}, {q(region)}, {q(country)}, {qa(ids(e, 'P1365'))}, "
                   f"{qa([(label(ALL[x]) if x in ALL else None) or '' for x in ids(e, 'P1365')])}, {q(day)})")
if ven_sql:
    sql.append("insert into legacy_future_venue.wikidata_venue (wikidata_id, label, description, instance_of, wikipedia_title, latitude, longitude, capacity, "
               "inception_year, planned_open_year, construction_start_year, state_of_use, city, region, country_code, replaces, replaces_names, fetched_on) values\n"
               + ",\n".join(ven_sql) + ";")

# ---------------------------------------------------------------- Wikidata state-of-use discovery
st_sql, seen = [], set()
for b in json.load(open(f"{raw}/wikidata/sparql-state.json"))["results"]["bindings"]:
    qid = b["item"]["value"].rsplit("/", 1)[1]
    if qid in seen:
        continue
    seen.add(qid)

    def dt(k):
        return b[k]["value"][:10] if k in b else None
    st_sql.append(f"({q(qid)}, {q(b.get('itemLabel', {}).get('value'))}, {q(b['stateLabel']['value'])}, {q(b.get('countryLabel', {}).get('value'))}, "
                  f"{q(b.get('cityLabel', {}).get('value'))}, {q(dt('plan'))}, {q(dt('inc'))}, {q(day)})")
if st_sql:
    sql.append("insert into legacy_future_venue.wikidata_state (wikidata_id, label, state_of_use, country, city, planned_open, inception, fetched_on) values\n"
               + ",\n".join(st_sql) + ";")
sql.append("commit;")
open(out, "w").write("\n".join(sql) + "\n")
print("wrote", out, len(list_rows), "list rows,", len(club_sql), "club rows,", len(art_sql), "articles,", len(ven_sql), "Wikidata venues,", len(st_sql), "state-of-use items")

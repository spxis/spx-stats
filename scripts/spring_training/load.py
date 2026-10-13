"""Raw files (scripts/spring_training/fetch.py) -> SQL for the legacy_spring_training tables (migration 070). No network, no database.
Usage: load.py <raw dir> <YYYY-MM-DD> --sql-out FILE        (apply FILE with scripts/mac/ds1-apply.sh; --dry-run first)
Rerunnable: the file empties the legacy_spring_training tables and fills them again in one transaction.

What it reads:
  wikipedia/list.json     the list of spring training ballparks: one row per park (legacy_spring_training.park_row) and one per club and
                          span of years (legacy_spring_training.occupant), exactly as the tables show them (parse_list.py)
  wikipedia/parks-*.json  each park's article: the infobox gives the fence distances (fence) and the former names (park_name)
  wikidata/*.json         each park's Wikidata item (CC0): name, coordinates, capacity, opened and closed, the city/state/country up the P131
                          chain, and its dated official names (venue, park_name)
Nothing is guessed: a value the sources do not hold stays null, and db/build/201_spring_training.sql logs it in meta.data_issue."""
import glob, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import parse_list

raw, day = os.path.expanduser(sys.argv[1]), sys.argv[2]
assert sys.argv[3] == "--sql-out"
out = os.path.expanduser(sys.argv[4])


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


# ---------------------------------------------------------------- Wikipedia
lst = json.load(open(f"{raw}/wikipedia/list.json"))
lpage = lst["query"]["pages"][0]
lrev = lpage["revisions"][0]
list_rows = parse_list.parks(lrev["slots"]["main"]["content"])

pages, redir = {}, {}
for p in sorted(glob.glob(f"{raw}/wikipedia/parks-*.json")):
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


# ---------------------------------------------------------------- Wikidata
ents, chain, labels = {}, {}, {}
for p in sorted(glob.glob(f"{raw}/wikidata/venues-*.json")):
    ents.update(json.load(open(p))["entities"])
for p in sorted(glob.glob(f"{raw}/wikidata/chain-*.json")):
    chain.update(json.load(open(p))["entities"])
for p in sorted(glob.glob(f"{raw}/wikidata/labels-*.json")):
    for qid, e in json.load(open(p))["entities"].items():
        labels[qid] = e.get("labels", {}).get("en", {}).get("value")
ALL = {**chain, **ents}
CITY_WORDS = ("city", "town", "municipality", "village", "borough", "census-designated place", "township", "hamlet", "locality")
NOT_CITY = ("county", "state", "province", "country", "metropolitan", "region", "district of", "territory", "prefecture")


def label(e):
    return e.get("labels", {}).get("en", {}).get("value")


def claims(e, p):
    cs = [c for c in e.get("claims", {}).get(p, []) if c.get("rank") != "deprecated" and c["mainsnak"].get("snaktype") == "value"]
    return sorted(cs, key=lambda c: c["rank"] != "preferred")


def ids(e, p):
    return [c["mainsnak"]["datavalue"]["value"]["id"] for c in claims(e, p)]


def types(e):
    return [labels.get(t) or t for t in ids(e, "P31")]


def year_of_time(t):
    """A Wikidata time value -> its year, only when the precision is a year or finer."""
    if t.get("precision", 0) >= 9 and not t["time"].startswith("-"):
        return int(t["time"][1:5])
    return None


def year_of(e, *props):
    for p in props:
        for c in claims(e, p):
            y = year_of_time(c["mainsnak"]["datavalue"]["value"])
            if y:
                return y
    return None


def day_of(e, *props):
    for p in props:
        for c in claims(e, p):
            t = c["mainsnak"]["datavalue"]["value"]
            if t.get("precision", 0) >= 11 and not t["time"].startswith("-"):
                return t["time"][1:11].replace("-00", "-01")
    return None


def first_literal(e, p):
    for c in claims(e, p):
        v = c["mainsnak"]["datavalue"]["value"]
        if isinstance(v, str) and v != "FX":
            return v


def up(e):
    res, seen, cur = [], set(), e
    for _ in range(8):
        nxt = ids(cur, "P131")
        if not nxt or nxt[0] in seen or nxt[0] not in ALL:
            break
        seen.add(nxt[0])
        cur = ALL[nxt[0]]
        res.append((nxt[0], cur))
    return res


def qual_year(c, prop):
    for s in c.get("qualifiers", {}).get(prop, []):
        v = s.get("datavalue", {}).get("value")
        if isinstance(v, dict) and "time" in v:
            return year_of_time(v)
    return None


# ---------------------------------------------------------------- infobox
def balanced_end(t, i):
    depth, n = 0, len(t)
    while i < n:
        if t.startswith("{{", i):
            depth += 1
            i += 2
        elif t.startswith("}}", i):
            depth -= 1
            i += 2
            if depth == 0:
                return i
        else:
            i += 1
    return n


def infobox(text):
    m = re.search(r"\{\{\s*Infobox", text, re.I)
    if not m:
        return {}
    body = text[m.start() + 2:balanced_end(text, m.start()) - 2]
    parts, depth, cur, i = [], 0, "", 0
    while i < len(body):
        two = body[i:i + 2]
        if two in ("{{", "[["):
            depth += 1; cur += two; i += 2
        elif two in ("}}", "]]"):
            depth -= 1; cur += two; i += 2
        elif body[i] == "|" and depth == 0:
            parts.append(cur); cur = ""; i += 1
        else:
            cur += body[i]; i += 1
    parts.append(cur)
    res = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            res[k.strip().lower()] = v.strip()
    return res


def flat(v):
    """Infobox text -> plain text with one entry per line: references dropped, convert templates read as 'N ft', list templates unwrapped."""
    v = re.sub(r"<ref[^>]*/>", "", v)
    v = re.sub(r"<ref[^>]*>.*?</ref>", "", v, flags=re.S)
    v = re.sub(r"<!--.*?-->", "", v, flags=re.S)
    v = re.sub(r"\{\{\s*(?:convert|cvt)\s*\|\s*([\d.,]+)\s*\|\s*(ft|feet)\b[^{}]*\}\}", r"\1 ft", v, flags=re.I)
    v = re.sub(r"\{\{\s*(?:convert|cvt)\s*\|\s*([\d.,]+)\s*\|\s*(m|yd)\b[^{}]*\}\}", r"\1 \2", v, flags=re.I)
    for _ in range(3):
        v = re.sub(r"\{\{\s*(?:ubl|plainlist|unbulleted list|flatlist|nowrap|small)\s*\|", "", v, flags=re.I)
    v = v.replace("}}", "").replace("{{", "")
    v = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", v)
    v = v.replace("&nbsp;", " ").replace("&ndash;", "-").replace("&mdash;", "-").replace("–", "-").replace("—", "-").replace("−", "-")
    v = v.replace("'''", "").replace("''", "")
    return re.sub(r"[ \t]+", " ", re.sub(r"<br\s*/?>|\n|\|", "\n", v))


FENCE = {"left": "left", "left field": "left", "left field line": "left", "left field pole": "left", "left line": "left", "lf": "left",
         "center": "center", "center field": "center", "centre field": "center", "cf": "center",
         "right": "right", "right field": "right", "right field line": "right", "right field pole": "right", "right line": "right", "rf": "right"}


def fences(dimensions):
    """left/centre/right fence distances in feet from an infobox 'dimensions' value. The last figure for a label wins (Payne Park lists two
    eras, the later last); 'Foul lines' sets both lines when no line is given."""
    res = {}
    foul = None
    for seg in flat(dimensions).split("\n"):
        m = re.match(r"^\W*([A-Za-z][A-Za-z \-]*?)\s*[:\-]+\s*(\d{3})\s*(?:ft|feet|’|')", seg.strip())
        if not m:
            continue
        lab, n = m.group(1).strip().lower(), int(m.group(2))
        if not 200 <= n <= 560:
            continue
        if lab in FENCE:
            res[FENCE[lab]] = n
        elif lab in ("foul lines", "foul line"):
            foul = n
    if foul:
        res.setdefault("left", foul)
        res.setdefault("right", foul)
    return res


def former_names(v):
    """'Knology Park (2004-2008)<br>Tradition Field (2004-2009; 2012-2016)' -> [(name, from, to)]; a name with no years has none."""
    out = []
    for seg in flat(v).split("\n"):
        seg = seg.strip(" *")
        if not seg:
            continue
        m = re.match(r"^(.*?)\s*\(((?:\d{4}\s*(?:-\s*(?:\d{4}|present))?\s*[,;]?\s*)+)\)\s*$", seg)
        if m:
            for part in re.split(r"\s*[,;]\s*", m.group(2).strip(" ,;")):
                r = re.fullmatch(r"(\d{4})\s*(?:-\s*(\d{4}|present))?", part.strip())
                if r:
                    a = int(r.group(1))
                    b = a if r.group(2) is None else (None if r.group(2) == "present" else int(r.group(2)))
                    out.append((m.group(1).strip(), a, b))
        else:
            name = re.sub(r"\s*\(.*?\)\s*$", "", seg).strip()
            if name:
                out.append((name, None, None))
    return out


# ---------------------------------------------------------------- build the rows
sql = ["begin;"]
for t in ("park_name", "fence", "venue", "occupant", "park_row"):
    sql.append(f"delete from legacy_spring_training.{t};")
sql.append(f"delete from legacy_spring_training.source_page;")

# source_page: the revisions the rows below were read from
sql.append("insert into legacy_spring_training.source_page (title, revision_id, revision_at, wikidata_id, fetched_on) values")
src_rows = [(lpage["title"], lrev["revid"], lrev["timestamp"], None)]
sp = json.load(open(f"{raw}/wikipedia/spring.json"))["query"]["pages"][0]
src_rows.append((sp["title"], sp["revisions"][0]["revid"], sp["revisions"][0]["timestamp"], None))
for t, pg in sorted(pages.items()):
    if "revisions" in pg:
        src_rows.append((pg["title"], pg["revisions"][0]["revid"], pg["revisions"][0]["timestamp"], pg.get("pageprops", {}).get("wikibase_item")))
sql.append(",\n".join(f"({q(t)}, {r}, {q(ts)}, {q(w)}, {q(day)})" for t, r, ts, w in src_rows) + ";")

park_sql, occ_sql, fence_sql, name_sql, ven_sql = [], [], [], [], []
qid_of = {}
for n, p in enumerate(list_rows, 1):
    pg = page_of(p["link"]) if p["link"] else None
    qid = pg.get("pageprops", {}).get("wikibase_item") if pg else None
    qid_of[n] = qid
    title = pg["title"] if pg else None
    state = p["state_name"]
    league = p["section"] or {"Florida": "grapefruit", "Arizona": "cactus"}.get(state)
    park_sql.append(f"({n}, {q(p['status'])}, {q(league)}, {q(p['name'])}, {q(p['link'])}, {q(title)}, {q(qid)}, {q(p['opened'])}, {q(p['last_used'])}, "
                    f"{q(p['city_text'])}, {q(p['city_link'])}, {q(state)}, {q(p['capacity'])}, {q(p['status_text'])}, {lrev['revid']}, {qj(p['cells'])})")
    for kind, occs in (("current", p["occupants"] if p["status"] == "current" else []), ("former", p["occupants_former"] if p["status"] == "current" else p["occupants"])):
        for o in occs:
            spans = o["years"] or [(None, None)]
            for a, b in spans:
                occ_sql.append(f"({n}, {q(kind)}, {q(o['club_text'])}, {q(o['club_link'])}, {q(a)}, {q(b)}, {q(o['years_text'])}, {q(o['raw'])})")

# a rebuilt park shares one Wikidata item between two rows: write the item once
done = set()
for n, p in enumerate(list_rows, 1):
    qid = qid_of[n]
    if not qid or qid in done:
        continue
    done.add(qid)
    pg = page_of(p["link"])
    e = ents.get(qid)
    if not e or "missing" in e:
        continue
    ch = up(e)
    city = region = country = None
    for words in (("city",), CITY_WORDS):
        for cq, ce in ch:
            t = [x.lower() for x in types(ce)]
            if city is None and any(w in x for x in t for w in words) and not all(any(nc in x for nc in NOT_CITY) for x in t):
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
    lat = lon = None
    for c in claims(e, "P625"):
        v = c["mainsnak"]["datavalue"]["value"]
        lat, lon = round(v["latitude"], 6), round(v["longitude"], 6)
        break
    cap = None
    for c in claims(e, "P1083"):
        cap = int(float(c["mainsnak"]["datavalue"]["value"]["amount"]))
        break
    rev = pg["revisions"][0]["revid"] if pg and "revisions" in pg else None
    title = e.get("sitelinks", {}).get("enwiki", {}).get("title") or (pg["title"] if pg else None)
    chain_json = [{"qid": cq, "label": label(ce), "types": types(ce)} for cq, ce in ch]
    ven_sql.append(f"({q(qid)}, {q(label(e))}, {q('{' + ','.join(json.dumps(t) for t in types(e)) + '}')}, {q(title)}, {q(rev)}, {q(lat)}, {q(lon)}, {q(cap)}, "
                   f"{q(year_of(e, 'P1619', 'P571'))}, {q(year_of(e, 'P3999', 'P576'))}, {q(city)}, {q(region)}, {q(country)}, {qj(chain_json)}, {q(day)})")
    # fence distances and former names from the infobox
    ib = infobox(pg["revisions"][0]["slots"]["main"]["content"]) if pg and "revisions" in pg else {}
    dims = ib.get("dimensions") or ib.get("field_dimensions") or ""
    f = fences(dims) if dims else {}
    segs = []
    for s in flat(dims).split("\n"):
        if "=" in s:                      # the next infobox field, read into this one by an unclosed template
            break
        if s.strip():
            segs.append(s.strip())
    fence_sql.append(f"({q(qid)}, {q(title)}, {q(rev)}, {q('; '.join(segs) if segs else None)}, "
                     f"{q(f.get('left'))}, {q(f.get('center'))}, {q(f.get('right'))})")
    seen_names = set()
    for nm, a, b in former_names(ib.get("former_names", "")):
        if (nm, a, b) not in seen_names:
            seen_names.add((nm, a, b))
            name_sql.append(f"({q(qid)}, {q(nm)}, {q(a)}, {q(b)}, 'wikipedia', {q(rev)})")
    if label(e) and (label(e), None, None) not in seen_names:
        seen_names.add((label(e), None, None))
        name_sql.append(f"({q(qid)}, {q(label(e))}, null, null, 'wikidata', null)")
    for lp in list_rows:                  # the 'a.k.a.' names the list gives
        if page_of(lp["link"] or "") is pg and pg:
            for aka in re.findall(r"a\.k\.a\.\s*([^)]+)\)", lp["name"]):
                for nm in re.split(r"\s*(?:,|/|\sor\s)\s*", aka.strip()):
                    if nm and (nm, None, None) not in seen_names:
                        seen_names.add((nm, None, None))
                        name_sql.append(f"({q(qid)}, {q(nm)}, null, null, 'wikipedia list', {lrev['revid']})")
    for c in claims(e, "P1448"):
        v = c["mainsnak"]["datavalue"]["value"]
        if v.get("language") not in ("en", "mul"):
            continue
        a, b = qual_year(c, "P580"), qual_year(c, "P582")
        if (v["text"], a, b) not in seen_names:
            seen_names.add((v["text"], a, b))
            name_sql.append(f"({q(qid)}, {q(v['text'])}, {q(a)}, {q(b)}, 'wikidata', null)")

sql.append("insert into legacy_spring_training.park_row (row_no, status, league, name, article, resolved_article, wikidata_id, opened_year, last_used_year, "
           "city_text, city_link, state_name, capacity, status_text, list_revision, cells) values\n" + ",\n".join(park_sql) + ";")
sql.append("insert into legacy_spring_training.occupant (row_no, kind, club_text, club_link, from_year, to_year, years_text, raw) values\n" + ",\n".join(occ_sql) + ";")
sql.append("insert into legacy_spring_training.venue (wikidata_id, label, instance_of, wikipedia_title, wikipedia_revision, latitude, longitude, capacity, "
           "opened_year, closed_year, city, region, country_code, chain, fetched_on) values\n" + ",\n".join(ven_sql) + ";")
sql.append("insert into legacy_spring_training.fence (wikidata_id, wikipedia_title, wikipedia_revision, dimensions_text, left_ft, center_ft, right_ft) values\n"
           + ",\n".join(fence_sql) + ";")
sql.append("insert into legacy_spring_training.park_name (wikidata_id, name, from_year, to_year, source, wikipedia_revision) values\n" + ",\n".join(name_sql) + ";")
sql.append("commit;")
open(out, "w").write("\n".join(sql) + "\n")
print("wrote", out, len(list_rows), "list rows,", len(occ_sql), "occupant spans,", len(ven_sql), "venues,", len(name_sql), "names,",
      sum(1 for s in fence_sql if not s.endswith("null, null, null)")), "parks with fence distances")

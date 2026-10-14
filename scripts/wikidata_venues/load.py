#!/usr/bin/env python3
"""Load the raw files of scripts/wikidata_venues/fetch.py into legacy_wikidata_venues (migration 051).
Usage: load.py <raw dir> <YYYY-MM-DD> [--sql-out FILE] [--facts-only]     e.g. load.py ~/Projects/backups/spx-stats/raw/wikidata_venues/2026-10-12 2026-10-12
Reads PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD. With --sql-out the SQL is written to FILE instead of run (apply it with
scripts/mac/ds1-apply.sh). Rerunnable: every venue in the raw files is deleted and loaded again.
Names come from Wikidata P1448 (official name) and P2561 (name), with their P580/P582 start and end, and from the
"former names" of the English Wikipedia infobox. Facts: P1083 capacity, P1619/P571 opened, P3999/P576 closed, P127 owner,
P765 surface, P31 (retractable or domed) roof, P6375 address, P281 postal code (as Wikidata gives it; postal_check.py then
validates it, migration 058), P669 + P670 street address (street_address) and the street line of the Wikipedia infobox (wp_address),
migration 059. Migration 089 adds: P31 'destroyed building or structure' (destroyed), the infobox |closed=, |demolished= and |status= (a year only when
the text is one clean date, never a renovation or a temporary closing), the roof the first paragraph of the article names when the infobox has none,
and legacy_wikidata_venues.fact: every surface and roof statement with the years it carries (Wikidata P765 with P580/P582, and the lines of the
infobox surface and roof fields, "AstroTurf (1989-2004)<br>FieldTurf (2005-2010)").
--facts-only fills just those new columns and the fact table of venues already loaded (UPDATE and INSERT only): it leaves the names and the postal
checks (postal_check.py) as they are, so a folder loaded before migration 089 can be given the new facts without redoing them."""
import glob, html, json, os, re, subprocess, sys

argv = sys.argv[1:]
sql_out = None
if "--sql-out" in argv:
    i = argv.index("--sql-out"); sql_out = os.path.expanduser(argv[i + 1]); del argv[i:i + 2]
facts_only = "--facts-only" in argv
if facts_only:
    argv.remove("--facts-only")
raw, day = os.path.expanduser(argv[0]), argv[1]
q = lambda v: "null" if v is None else "'" + str(v).replace("'", "''") + "'"
n = lambda v: "null" if v is None else str(v)

ents, labels, pages = {}, {}, {}
for f in sorted(glob.glob(raw + "/wikidata/entities-*.json")):
    ents.update(json.load(open(f))["entities"])
for f in sorted(glob.glob(raw + "/wikidata/labels-*.json") + glob.glob(raw + "/wikidata/streets-*.json")):
    for k, e in json.load(open(f))["entities"].items():
        labels[k] = e.get("labels", {}).get("en", {}).get("value")
for f in sorted(glob.glob(raw + "/wikipedia/pages-*.json")):
    d = json.load(open(f))["query"]
    for p in d["pages"]:
        pages[p["title"]] = p


def when(c, p):
    """A claim's time qualifier as (date, precision); the date is the first of a month or year the value does not give."""
    for s in c.get("qualifiers", {}).get(p, []):
        v = s.get("datavalue", {}).get("value")
        if isinstance(v, dict) and "time" in v:
            return tv(v)
    return None, None


def tv(v):
    m = re.match(r"([+-])(\d{4})-(\d\d)-(\d\d)", v["time"])
    if not m or m.group(1) == "-" or m.group(2) == "0000":
        return None, None
    y, mo, d = int(m.group(2)), int(m.group(3)) or 1, int(m.group(4)) or 1
    return f"{y:04d}-{mo:02d}-{d:02d}", v["precision"]


def live(cl, p):
    return [c for c in cl.get(p, []) if c["rank"] != "deprecated" and c["mainsnak"].get("snaktype") == "value"]


def ids(cl, p):
    return [c["mainsnak"]["datavalue"]["value"]["id"] for c in live(cl, p)]


# ---- Wikipedia infobox "former names" -------------------------------------------------------------------------
LISTS = {"ubl", "ubll", "unbulleted list", "plainlist", "plain list", "hlist", "flatlist", "bulleted list", "bulletedlist", "unbulleted"}
KEEP = {"small", "nowrap", "nobr", "smaller", "big", "resize", "nowraplinks", "font", "sfn"}
MONTH = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?"


def unwrap(t):
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S)
    t = re.sub(r"<ref[^>]*?/>|<ref[^>]*>.*?</ref>", "", t, flags=re.S | re.I)
    def tmpl(m):
        name, *args = m.group(1).split("|")
        name = name.strip().lower()
        args = [re.sub(r"^\s*\d+\s*=", "", a) for a in args]
        if name in LISTS:
            return "\n" + "\n".join(a.strip() for a in args) + "\n"
        if name in KEEP:
            return "|".join(args)
        return ""
    for _ in range(6):
        t2 = re.sub(r"\{\{([^{}]*)\}\}", tmpl, t)
        if t2 == t:
            break
        t = t2
    t = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", t)
    return html.unescape(t)


def years(inner):
    """(from, until) years of a parenthesised date text, or None if it is not one. 'present' and 'pre-construction' leave a side open."""
    s = inner.lower().replace("−", "-").replace("–", "-").replace("—", "-").replace(" to ", "-").replace("c.", "").replace("circa", "")
    s = re.sub(MONTH + r"\s*(?:\d{1,2}(?!\d))?", "", s)
    s = re.sub(r"\b(present|current|now|pre-construction|since|until|from|planning)\b", lambda m: {"present": "~", "current": "~", "now": "~"}.get(m.group(1), " "), s)
    if re.search(r"[a-z]", s):
        return None
    ranges = [r for r in re.split(r"[,;]", s) if r.strip()]
    vals = []
    for r in ranges:
        parts = [x.strip() for x in re.split(r"-", r)]
        a = re.search(r"\d{4}", parts[0]) if parts[0] else None
        b = None
        if len(parts) > 1 and parts[1]:
            if parts[1] == "~":
                b = "open"
            else:
                m = re.search(r"\d{4}", parts[1]) or re.search(r"\d{2}", parts[1])
                if m:
                    b = int(m.group()) if len(m.group()) == 4 else int(str(int(a.group()))[:2] + m.group()) if a else None
        elif len(parts) == 1 and a:
            b = int(a.group())
        vals.append((int(a.group()) if a else None, b))
    if not vals or all(v == (None, None) for v in vals):
        return None
    frm = None if vals[0][0] is None else min(v[0] for v in vals if v[0] is not None)
    if any(v[1] == "open" for v in vals):
        return frm, None
    ends = [v[1] for v in vals if v[1] is not None]
    return frm, max(ends) if ends else None


def former_names(wikitext):
    m = re.search(r"\|\s*(?:former[ _]?names?)\s*=(.*?)(?=\n\s*\||\n\}\})", wikitext, re.I | re.S)
    if not m:
        return []
    out = []
    text = unwrap(m.group(1))
    for item in re.split(r"<br\s*/?>|\n|\*|•", text, flags=re.I):
        item = re.sub(r"<[^>]+>|'{2,}", "", item).strip(" \t,;-–")
        if not item or item.startswith("("):
            continue
        mm = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", item)
        name, span = (mm.group(1), years(mm.group(2))) if mm else (item, None)
        if mm and span is None:   # (planning), (2026 FIFA World Cup): not a date
            name = mm.group(1)
        name = re.sub(r"\s+", " ", name).strip(" ,;")
        if len(name) < 3 or len(name) > 120:
            continue
        out.append((name, span, item))
    return out


def infobox_raw(wikitext, field):
    m = re.search(r"\|\s*" + field + r"\s*=(.*?)(?=\n\s*\||\n\}\})", wikitext, re.I | re.S)
    return m.group(1) if m else None


def infobox(wikitext, field):
    r = infobox_raw(wikitext, field)
    return unwrap(r) if r is not None else None


def wp_surface(wikitext):
    t = infobox(wikitext, "surface")
    for item in re.split(r"<br\s*/?>|\n|\*", t or "", flags=re.I):
        item = re.sub(r"<[^>]+>|'{2,}|\(.*?\)", "", item).strip(" ,;")
        if 2 < len(item) < 60:
            return item
    return None


STREET = r"(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Way|Place|Pl|Plaza|Parkway|Pkwy|Highway|Hwy|Lane|Court|Walk|Square|Terrace|Broadway|Trail|Circle|Mile)"


def wp_address(wikitext):
    """The street line of the infobox's address (else location) field: a house number and a street ("600 West Amelia Street", "One Tropicana
    Drive" as "1 Tropicana Drive") or two crossing streets ("Findlay Street and Dalton Avenue"). The city, state and code after it are cut off.
    An area ("Manhattan"), a corner description or a block ("bounded by ...") is not an address and gives None; nothing is guessed."""
    for field in ("address", "location"):
        m = re.search(r"\|\s*" + field + r"\s*=(.*?)(?=\n\s*\||\n\}\})", wikitext, re.I | re.S)
        if not m:
            continue
        raw = m.group(1)
        links = re.findall(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", re.sub(r"<ref[^>]*?/>|<ref[^>]*>.*?</ref>", "", raw, flags=re.S | re.I))
        city = links[-1].split(",")[0].strip() if links else ""
        text = unwrap(raw)
        for line in re.split(r"<br\s*/?>|\n", text, flags=re.I):
            line = re.sub(r"<[^>]+>|'{2,}", "", line)
            line = re.sub(r"\s+", " ", line).strip(" \t,;")
            if not line:
                continue
            line = line.split(",")[0].strip()
            line = re.sub(r"\s*\([^)]*\)", "", line).strip()
            if city and line.endswith(" " + city):
                line = line[: -len(city)].strip()
            line = re.sub(r"^(One)\b", "1", line)
            cross = re.search(r"\s(?:&|and)\s", line) and re.search(r"\b" + STREET + r"\b", line) and not re.search(r"\b(bounded|corner|between|up to|near|at)\b", line, re.I)
            if len(line) <= 80 and (re.match(r"^\d[\d\u2013-]*\s+[A-Za-z]", line) or (cross and not re.match(r"^\d", line))):
                return line
            break   # only the first line of a field is the street
    return None


def wp_roof(wikitext):
    t = (infobox(wikitext, "roof") or "").lower()
    if "retract" in t:
        return "retractable"
    if re.search(r"fixed|dome|enclosed|teflon", t):
        return "dome"
    return "open" if re.search(r"\bopen\b|\bnone\b|^\s*no\b", t) else None


# ---- closing, demolition, status, surface periods, roof (migration 089) -------------------------------------------
NOISE = re.compile(r"renovat|temporar|repair|restor|collaps|began|start(?:ed)?\b|ongoing|construct|hurricane|upgrade|expansion|reopen|partial|\b(?:first|second|third|fourth|original|present|old|new) (?:stadium|arena|rink|building|park|grounds)", re.I)
YEAR = re.compile(r"(?<!\d)(1[6-9]\d\d|20\d\d)(?!\d|s\b)")
DASH = r"(?:-|–|—|&ndash;|\{\{ndash\}\}|\bto\b)"


def clean_wiki(t):
    """Infobox text without comments, references and the date templates ({{Start date and age|1996|10|24}} becomes 1996-10-24)."""
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S)
    t = re.sub(r"<ref[^>]*?/>|<ref[^>]*>.*?</ref>", "", t, flags=re.S | re.I)
    t = re.sub(r"\{\{\s*(?:start|end|date)[ _]date(?:[ _]and[ _]age)?\s*\|\s*(?:df\s*=\s*\w+\s*\|\s*)?(\d{4})(?:\s*\|\s*(\d{1,2}))?(?:\s*\|\s*(\d{1,2}))?[^{}]*\}\}",
               lambda m: "-".join(x for x in m.groups() if x), t, flags=re.I)
    # {{start date and age|September 21, 1961|br=y}}: the date is written out
    t = re.sub(r"\{\{\s*(?:start|end)[ _]date(?:[ _]and[ _]age)?\s*\|\s*([^|{}=]*\d{4}[^|{}=]*)(?:\|[^{}]*)?\}\}", lambda m: m.group(1), t, flags=re.I)
    return t


def one_year(text):
    """The year of an infobox date field when it names exactly one clean date; else None. Several lines (a renovation closing and a final game),
    a range, a renovation or a temporary closing give None, except that one line saying 'final' or 'last' is taken."""
    if not text:
        return None
    items = [re.sub(r"\s+", " ", unwrap(x)).strip(" ,;") for x in re.split(r"<br\s*/?>|\n|\*", clean_wiki(text), flags=re.I)]
    items = [x for x in items if x]
    final = [x for x in items if re.search(r"final|last", x, re.I) and YEAR.search(x)]
    if len(items) > 1 and final and len({y for x in final for y in YEAR.findall(x)}) == 1:
        items = final[:1]
    if len(items) != 1:
        return None
    it = items[0]
    ys = YEAR.findall(it)
    if NOISE.search(it) or len(set(ys)) > 1:   # a range, two dates or a renovation is not one closing
        return None
    return int(ys[0]) if ys else None


def surface_lines(text):
    """The statements of an infobox surface (or roof) field: [(raw text, [(from, until), ...])]. A parenthesis of years ("(1989-2004)", "(2016-present)",
    "(1977-2001, 2005-06)") dates a statement; a statement with none is undated (ranges = [])."""
    if not text:
        return []
    t = clean_wiki(text)
    t = re.sub(r"\{\{\s*(?:convert|cvt)\s*\|([^{}]*)\}\}", lambda m: " ".join(x for x in m.group(1).split("|") if not x.startswith("abbr")), t, flags=re.I)
    out = []
    for item in re.split(r"<br\s*/?>|\n|\*", unwrap(t), flags=re.I):
        item = re.sub(r"<[^>]+>|'{2,}", "", item)
        item = re.sub(r"\s+", " ", item).strip(" ,;-")
        if not item or len(item) > 160:
            continue
        ranges, name = [], item
        m = re.search(r"\(([^()]*)\)\s*$", item)
        if m and YEAR.search(m.group(1)):
            words = re.sub(r"present|current|now|until|since|from|jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*|and|season|seasons|to", "", m.group(1), flags=re.I)
            if not re.search(r"[A-Za-z]{3,}", words):
                name = item[:m.start()].strip(" ,;-")
                for piece in re.split(r"[,;]|\band\b", m.group(1)):
                    a = YEAR.search(piece)
                    if not a:
                        continue
                    rest = piece[a.end():]
                    b = None if re.search(r"present|current|now", rest, re.I) else int(a.group(1))
                    mm = re.match(r"\s*" + DASH + r"\s*(\d{4}|\d{2})?", rest)
                    if mm:
                        if mm.group(1) is None:
                            b = None                      # "2016-": still so
                        elif len(mm.group(1)) == 4:
                            b = int(mm.group(1))
                        else:
                            b = int(a.group(1)[:2] + mm.group(1))
                    ranges.append((int(a.group(1)), b))
        if name and re.search(r"[A-Za-z]", name):
            out.append((name, ranges))
    return out


def lead_roof(wikitext):
    """The roof the first paragraph of the article names ('retractable' or 'dome'), in plain words. Used only when the infobox has no roof."""
    body = clean_wiki(wikitext)
    for _ in range(8):   # drop templates from the inside out: the infobox first
        b2 = re.sub(r"\{\{[^{}]*\}\}", "", body)
        if b2 == body:
            break
        body = b2
    para = next((x for x in re.split(r"\n\s*\n", body) if "'''" in x), "")
    para = unwrap(para).lower()
    if re.search(r"\bformer(?:ly)?\b[^.]{0,60}retractable|had a retractable|was a [^.]{0,40}retractable", para):
        return None
    if re.search(r"non-?retractable", para):
        return "dome"
    if re.search(r"(?<![a-z])retractable[- ]roof|(?<![a-z])retractable[- ]dome|(?<![a-z])retractable-roofed", para):
        return "retractable"
    if re.search(r"\bdomed (?:stadium|arena)|fixed[- ]roof|inflatable dome|air-supported", para):
        return "dome"
    return None


# ---- build the rows -------------------------------------------------------------------------------------------------
sql = ["begin;"]
stats = {"venues": 0, "wd_names": 0, "wp_names": 0}
for qid, e in sorted(ents.items()):
    if "claims" not in e:
        continue
    cl = e["claims"]
    label = e.get("labels", {}).get("en", {}).get("value")
    title = e.get("sitelinks", {}).get("enwiki", {}).get("title")
    cap = None
    cs = live(cl, "P1083")
    cs = [c for c in cs if c["rank"] == "preferred"] or [c for c in cs if "P518" not in c.get("qualifiers", {})] or cs
    cs.sort(key=lambda c: when(c, "P585")[0] or "")
    if cs:
        v = float(cs[-1]["mainsnak"]["datavalue"]["value"]["amount"])
        cap = int(v) if v > 0 else None
    op = None
    for p in ("P1619", "P571"):
        ds = [tv(c["mainsnak"]["datavalue"]["value"]) for c in live(cl, p)]
        ds = sorted(d for d in ds if d[0])
        if ds:
            op = ds[0]; break
    cl_ = None
    for p in ("P3999", "P576"):
        ds = sorted(d for d in (tv(c["mainsnak"]["datavalue"]["value"]) for c in live(cl, p)) if d[0])
        if ds:
            cl_ = ds[-1]; break
    owner = "; ".join(dict.fromkeys(o for o in (labels.get(c["mainsnak"]["datavalue"]["value"]["id"]) for c in live(cl, "P127")
                                                  if not c.get("qualifiers", {}).get("P582")) if o)) or None
    surf = "; ".join(sorted({labels[i] for i in ids(cl, "P765") if labels.get(i)})) or None
    types = " ".join(labels.get(i) or "" for i in ids(cl, "P31")).lower()
    roof = "retractable" if "retractable" in types else "dome" if "domed" in types or " dome" in " " + types else None
    adr = next((c["mainsnak"]["datavalue"]["value"]["text"] for c in live(cl, "P6375") if c["mainsnak"]["datavalue"]["value"].get("language") in ("en", None)), None)
    pc = [c for c in live(cl, "P281") if str(c["mainsnak"]["datavalue"]["value"]).strip()]
    pc = [c for c in pc if c["rank"] == "preferred"] or pc
    # two different codes stay together and postal_check.py refuses them
    postal = "; ".join(dict.fromkeys(str(c["mainsnak"]["datavalue"]["value"]).strip() for c in pc)) or None
    street = None
    for c in sorted(live(cl, "P669"), key=lambda c: c["rank"] != "preferred"):
        sid = c["mainsnak"]["datavalue"]["value"]["id"]
        num = next((str(q["datavalue"]["value"]).strip() for q in c.get("qualifiers", {}).get("P670", []) if q.get("datavalue")), None)
        if labels.get(sid) and num and re.match(r"^\d", num):
            street = f"{num} {labels[sid]}"
            break
    pg = pages.get(title) if title else None
    rev = pg["revisions"][0] if pg and pg.get("revisions") else None
    sql.append(f"delete from legacy_wikidata_venues.fact where qid = {q(qid)};")
    if not facts_only:
        sql.append(f"delete from legacy_wikidata_venues.name where qid = {q(qid)};")
        sql.append(f"delete from legacy_wikidata_venues.venue where qid = {q(qid)};")
    content = rev["slots"]["main"]["content"] if rev else None
    destroyed = any("destroyed" in (labels.get(i) or "").lower() for i in ids(cl, "P31"))
    wp_closed_raw, wp_dem_raw = (infobox_raw(content, "closed"), infobox_raw(content, "demolished")) if rev else (None, None)
    wp_closed_raw, wp_dem_raw = (re.sub(r"\s+", " ", clean_wiki(x)).strip()[:200] or None if x else None for x in (wp_closed_raw, wp_dem_raw))
    wp_status = (re.sub(r"\s+", " ", unwrap(clean_wiki(infobox_raw(content, "status") or ""))).strip()[:60] or None) if rev else None
    wp_surf_raw = (re.sub(r"\s+", " ", unwrap(clean_wiki(infobox_raw(content, "surface") or ""))).strip()[:400] or None) if rev else None
    roof_lead = (lead_roof(content) if wp_roof(content) is None else None) if rev else None
    new_cols = (f"{'true' if destroyed else 'false'}, {n(one_year(infobox_raw(content, 'closed'))) if rev else 'null'}, {q(wp_closed_raw)}, {n(one_year(infobox_raw(content, 'demolished'))) if rev else 'null'}, {q(wp_dem_raw)}, "
                f"{q(wp_status)}, {q(roof_lead)}, {q(wp_surf_raw)}")
    if facts_only:
        sql.append("update legacy_wikidata_venues.venue set (destroyed, wp_closed_year, wp_closed_raw, wp_demolished_year, wp_demolished_raw, wp_status, wp_roof_lead, wp_surface_raw) = "
                   f"({new_cols}) where qid = {q(qid)};")
    else:
        sql.append("insert into legacy_wikidata_venues.venue (qid, label, wikipedia_title, wikipedia_revid, wikipedia_on, capacity, opened_on, opened_prec, closed_on, owner, surface, roof, address, wp_surface, wp_roof, fetched_on, postal_code, street_address, wp_address, "
                   "destroyed, wp_closed_year, wp_closed_raw, wp_demolished_year, wp_demolished_raw, wp_status, wp_roof_lead, wp_surface_raw) values "
                   f"({q(qid)}, {q(label)}, {q(title)}, {n(rev['revid']) if rev else 'null'}, {q(rev['timestamp'][:10]) if rev else 'null'}, {n(cap)}, "
                   f"{q(op[0]) if op else 'null'}, {n(op[1]) if op else 'null'}, {q(cl_[0]) if cl_ else 'null'}, {q(owner)}, {q(surf)}, {q(roof)}, {q(adr)}, "
                   f"{q(wp_surface(content)) if rev else 'null'}, {q(wp_roof(content)) if rev else 'null'}, {q(day)}, {q(postal)}, {q(street)}, {q(wp_address(content)) if rev else 'null'}, "
                   + new_cols + ");")

    # surface and roof statements with their years: Wikidata P765 (P580/P582), and the lines of the infobox fields
    for o, c in enumerate(live(cl, "P765")):
        lab = labels.get(c["mainsnak"]["datavalue"]["value"]["id"])
        s0, _ = when(c, "P580"); e0, _ = when(c, "P582")
        if lab:
            sql.append("insert into legacy_wikidata_venues.fact (qid, kind, ord, source, raw, from_year, until_year, dated) values "
                       f"({q(qid)}, 'surface', {o}, 'wikidata', {q(lab)}, {n(int(s0[:4]) if s0 else None)}, {n(int(e0[:4]) if e0 else None)}, {'true' if (s0 or e0) else 'false'}) on conflict do nothing;")
    if rev:
        for kind, field in (("surface", "surface"), ("roof", "roof")):
            o = 0
            for name, ranges in surface_lines(infobox_raw(content, field)):
                for a, b in (ranges or [(None, None)]):
                    sql.append("insert into legacy_wikidata_venues.fact (qid, kind, ord, source, raw, from_year, until_year, dated) values "
                               f"({q(qid)}, {q(kind)}, {o}, 'wikipedia', {q(name)}, {n(a)}, {n(b)}, {'true' if ranges else 'false'}) on conflict do nothing;")
                    o += 1
    stats["venues"] += 1
    if facts_only:
        continue
    for p, kind in (("P1448", "official"), ("P2561", "name")):
        for c in live(cl, p):
            v = c["mainsnak"]["datavalue"]["value"]
            if v.get("language") not in ("en", "mul", None):
                continue
            s, sp = when(c, "P580"); en, ep = when(c, "P582")
            fy = int(s[:4]) if s else None
            uy = int(en[:4]) if en else None
            sql.append("insert into legacy_wikidata_venues.name (qid, name, source, kind, from_year, until_year, starts_on, starts_prec, ends_on, ends_prec) values "
                       f"({q(qid)}, {q(v['text'])}, 'wikidata', {q(kind)}, {n(fy)}, {n(uy)}, {q(s)}, {n(sp)}, {q(en)}, {n(ep)}) on conflict do nothing;")
            stats["wd_names"] += 1
    if rev:
        for name, span, item in former_names(rev["slots"]["main"]["content"]):
            fy, uy = span if span else (None, None)
            sql.append("insert into legacy_wikidata_venues.name (qid, name, source, kind, from_year, until_year, raw) values "
                       f"({q(qid)}, {q(name)}, 'wikipedia', 'former', {n(fy)}, {n(uy)}, {q(item)}) on conflict do nothing;")
            stats["wp_names"] += 1
sql.append("commit;")
if sql_out:
    open(sql_out, "w").write("\n".join(sql) + "\n")
    print("wrote", sql_out, stats)
    raise SystemExit(0)
p = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], input="\n".join(sql), text=True, capture_output=True)
print(p.stdout[-500:], p.stderr[-2000:])
if p.returncode:
    raise SystemExit(1)
print("loaded", stats)

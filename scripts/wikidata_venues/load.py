#!/usr/bin/env python3
"""Load the raw files of scripts/wikidata_venues/fetch.py into legacy_wikidata_venues (migration 049).
Usage: load.py <raw dir> <YYYY-MM-DD> [--sql-out FILE]     e.g. load.py ~/spx-raw/wikidata_venues/2026-10-12 2026-10-12
Reads PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD. With --sql-out the SQL is written to FILE instead of run (apply it with
scripts/mac/ds1-apply.sh). Rerunnable: every venue in the raw files is deleted and loaded again.
Names come from Wikidata P1448 (official name) and P2561 (name), with their P580/P582 start and end, and from the
"former names" of the English Wikipedia infobox. Facts: P1083 capacity, P1619/P571 opened, P3999/P576 closed, P127 owner,
P765 surface, P31 (retractable or domed) roof, P6375 address."""
import glob, html, json, os, re, subprocess, sys

argv = sys.argv[1:]
sql_out = None
if "--sql-out" in argv:
    i = argv.index("--sql-out"); sql_out = os.path.expanduser(argv[i + 1]); del argv[i:i + 2]
raw, day = os.path.expanduser(argv[0]), argv[1]
q = lambda v: "null" if v is None else "'" + str(v).replace("'", "''") + "'"
n = lambda v: "null" if v is None else str(v)

ents, labels, pages = {}, {}, {}
for f in sorted(glob.glob(raw + "/wikidata/entities-*.json")):
    ents.update(json.load(open(f))["entities"])
for f in sorted(glob.glob(raw + "/wikidata/labels-*.json")):
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


def infobox(wikitext, field):
    m = re.search(r"\|\s*" + field + r"\s*=(.*?)(?=\n\s*\||\n\}\})", wikitext, re.I | re.S)
    return unwrap(m.group(1)) if m else None


def wp_surface(wikitext):
    t = infobox(wikitext, "surface")
    for item in re.split(r"<br\s*/?>|\n|\*", t or "", flags=re.I):
        item = re.sub(r"<[^>]+>|'{2,}|\(.*?\)", "", item).strip(" ,;")
        if 2 < len(item) < 60:
            return item
    return None


def wp_roof(wikitext):
    t = (infobox(wikitext, "roof") or "").lower()
    if "retract" in t:
        return "retractable"
    if re.search(r"fixed|dome|enclosed|teflon", t):
        return "dome"
    return "open" if re.search(r"\bopen\b|\bnone\b|^\s*no\b", t) else None


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
    pg = pages.get(title) if title else None
    rev = pg["revisions"][0] if pg and pg.get("revisions") else None
    sql.append(f"delete from legacy_wikidata_venues.name where qid = {q(qid)};")
    sql.append(f"delete from legacy_wikidata_venues.venue where qid = {q(qid)};")
    sql.append("insert into legacy_wikidata_venues.venue (qid, label, wikipedia_title, wikipedia_revid, wikipedia_on, capacity, opened_on, opened_prec, closed_on, owner, surface, roof, address, wp_surface, wp_roof, fetched_on) values "
               f"({q(qid)}, {q(label)}, {q(title)}, {n(rev['revid']) if rev else 'null'}, {q(rev['timestamp'][:10]) if rev else 'null'}, {n(cap)}, "
               f"{q(op[0]) if op else 'null'}, {n(op[1]) if op else 'null'}, {q(cl_[0]) if cl_ else 'null'}, {q(owner)}, {q(surf)}, {q(roof)}, {q(adr)}, "
               f"{q(wp_surface(rev['slots']['main']['content'])) if rev else 'null'}, {q(wp_roof(rev['slots']['main']['content'])) if rev else 'null'}, {q(day)});")
    stats["venues"] += 1
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

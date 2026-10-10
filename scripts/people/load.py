#!/usr/bin/env python3
"""Raw answers (fetch.py) -> legacy_people, replacing its rows, and the files themselves -> legacy_files.raw_archive.
Usage: load.py <raw dir> <wplinks.json>
Connects to the local working copy unless PGHOST is set (then libpq's PG* variables decide).
The archive rows are inserted by the database from the file's own bytes (pg_read_binary_file), so the stored sha256
is the file's; that needs a database server that can read <raw dir> (the local one can)."""
import datetime, json, os, re, subprocess, sys
CONN = [] if os.environ.get("PGHOST") else ["-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "spx_stats"]
FETCHED = "2026-10-10"

def q(s): return "'" + s.replace("'", "''") + "'"
def tsv(v):
    if v is None: return "\\N"
    return str(v).replace("\\", "\\\\").replace("\t", " ").replace("\n", " ").replace("\r", " ")

def when(v):
    m = re.match(r"^([+-])(\d+)-(\d\d)-(\d\d)T", v["time"])
    if not m or m.group(1) != "+": return None, None
    y, mo, d = int(m.group(2)), int(m.group(3)) or 1, int(m.group(4)) or 1
    if not 1000 <= y <= 2100: return None, None
    try: return datetime.date(y, mo, d).isoformat(), v.get("precision")
    except ValueError: return None, None

def qid_of(v): return v["id"]

def claim_row(qid, prop, n, c):
    sn = c["mainsnak"]
    if sn["snaktype"] != "value": return None
    dv = sn["datavalue"]; t = dv["type"]; v = dv["value"]
    r = dict(qid=qid, prop=prop, n=n, rank=c.get("rank"))
    if t == "wikibase-entityid": r["value_qid"] = v["id"]
    elif t == "time":
        r["value_on"], r["value_prec"] = when(v)
        if r["value_on"] is None: return None
    elif t == "quantity":
        r["value_num"] = v["amount"].lstrip("+"); r["unit_qid"] = (v.get("unit") or "").rsplit("/", 1)[-1] or None
        if r["unit_qid"] == "1": r["unit_qid"] = None
    elif t == "globecoordinate": r["value_lat"], r["value_lon"] = v["latitude"], v["longitude"]
    elif t == "string": r["value_text"] = v
    else: return None
    for k, cols in (("P580", ("start_on", "start_prec")), ("P582", ("end_on", "end_prec")), ("P585", ("point_on", "point_prec"))):
        for s in (c.get("qualifiers") or {}).get(k, [])[:1]:
            if s["snaktype"] == "value":
                r[cols[0]], r[cols[1]] = when(s["datavalue"]["value"])
    return r

CLAIM_COLS = ["qid", "prop", "n", "rank", "value_qid", "value_on", "value_prec", "value_num", "unit_qid", "value_lat", "value_lon", "value_text",
              "start_on", "start_prec", "end_on", "end_prec", "point_on", "point_prec"]

def main(raw, links):
    items, redirects, claims, titles = {}, {}, [], {}
    files = sorted(f for f in os.listdir(raw) if f.endswith(".json"))
    for f in files:
        d = json.load(open(f"{raw}/{f}", encoding="utf-8"))
        redirects.update(d.get("redirects") or {})
        for k, e in d["entities"].items():
            if e.get("missing") or not e.get("id"): continue
            qid = e["id"]
            if qid in items: continue
            items[qid] = (qid, (e.get("labels") or {}).get("en", {}).get("value"), (e.get("sitelinks") or {}).get("enwiki", {}).get("title"), FETCHED)
            if e.get("sitelinks"): titles[e["sitelinks"]["enwiki"]["title"]] = qid
            for prop, lst in (e.get("claims") or {}).items():
                for n, c in enumerate(lst):
                    r = claim_row(qid, prop, n, c)
                    if r: claims.append(r)
    wl = json.load(open(links, encoding="utf-8"))["rows"]
    def tkey(t): return t[:1].upper() + t[1:]
    tmap = {tkey(t): v for t, v in titles.items()}
    link_rows = [(c, n, t, tmap.get(tkey(t))) for c, n, t in wl]
    sql = ["begin;", "truncate legacy_people.item, legacy_people.redirect, legacy_people.claim, legacy_people.wikipedia_link;"]
    def copy(table, cols, rows):
        sql.append(f"copy {table} ({', '.join(cols)}) from stdin;")
        sql.extend("\t".join(tsv(x) for x in r) for r in rows); sql.append("\\.")
    copy("legacy_people.item", ["qid", "label", "enwiki_title", "fetched_on"], items.values())
    copy("legacy_people.redirect", ["from_qid", "to_qid"], redirects.items())
    copy("legacy_people.claim", CLAIM_COLS, ([r.get(c) for c in CLAIM_COLS] for r in claims))
    copy("legacy_people.wikipedia_link", ["award_code", "winner_name", "title", "qid"], link_rows)
    for f in files:
        name = f"people/{FETCHED}/{f}"
        sql.append(f"insert into legacy_files.raw_archive (name, saved_on, sha256, data) select {q(name)}, {q(FETCHED)}, encode(sha256(b), 'hex'), b "
                   f"from (select pg_read_binary_file({q(os.path.abspath(raw) + '/' + f)}) as b) x "
                   "on conflict (name) do update set saved_on = excluded.saved_on, sha256 = excluded.sha256, data = excluded.data;")
    sql.append("commit;")
    p = subprocess.run(["psql", *CONN, "-v", "ON_ERROR_STOP=1", "-q"], input="\n".join(sql) + "\n", text=True, capture_output=True)
    print(len(items), "items,", len(claims), "statements,", len(redirects), "redirects,", sum(1 for r in link_rows if r[3]), "of", len(link_rows), "links resolved,", len(files), "files archived", p.stderr.strip()[:500])
    if p.returncode: sys.exit(1)

main(sys.argv[1], sys.argv[2])

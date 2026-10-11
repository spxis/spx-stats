#!/usr/bin/env python3
"""Raw Wikidata answers (resume_fetch.py) -> legacy_people.resume_claim and resume_item, and the files -> legacy_files.raw_archive.

  resume_load.py <raw dir>

Replaces both tables' rows. The archive rows are inserted by the database from each file's own bytes
(pg_read_binary_file), so <raw dir> must be readable by the local server. Rerunnable."""
import datetime, json, os, re, subprocess, sys
CONN = ["psql", "-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "spx_stats", "-X", "-q", "-v", "ON_ERROR_STOP=1"]
SAVED = "2026-10-11"

def tsv(v):
    if v is None: return "\\N"
    if isinstance(v, list): return "{" + ",".join('"%s"' % x for x in v) + "}"
    return str(v).replace("\\", "\\\\").replace("\t", " ").replace("\n", " ").replace("\r", " ")

def when(v):
    m = re.match(r"^([+-])(\d+)-(\d\d)-(\d\d)T", v["time"])
    if not m or m.group(1) != "+": return None, None
    y, mo, d = int(m.group(2)), int(m.group(3)) or 1, int(m.group(4)) or 1
    if not 1000 <= y <= 2100: return None, None
    try: return datetime.date(y, mo, d).isoformat(), v.get("precision")
    except ValueError: return None, None

def first(e, prop, qual=None):
    return [c["mainsnak"]["datavalue"]["value"]["id"] for c in (e.get("claims") or {}).get(prop, [])
            if c["mainsnak"].get("datavalue", {}).get("type") == "wikibase-entityid"]

def main(raw):
    files = sorted(f for f in os.listdir(raw) if f.endswith(".json"))
    claims, items = [], {}
    for f in files:
        d = json.load(open(os.path.join(raw, f), encoding="utf-8"))
        for k, e in d["entities"].items():
            if e.get("missing") or not e.get("id"): continue
            qid = e["id"]
            if f.startswith("rpersons-"):
                for prop in ("P54", "P69", "P647"):
                    for n, c in enumerate((e.get("claims") or {}).get(prop, [])):
                        sn = c["mainsnak"]
                        if sn.get("snaktype") != "value" or sn["datavalue"]["type"] != "wikibase-entityid": continue
                        r = dict(qid=qid, prop=prop, n=n, rank=c.get("rank"), value_qid=sn["datavalue"]["value"]["id"])
                        for qk, cols in (("P580", ("start_on", "start_prec")), ("P582", ("end_on", "end_prec")), ("P585", ("point_on", "point_prec"))):
                            for s in (c.get("qualifiers") or {}).get(qk, [])[:1]:
                                if s["snaktype"] == "value": r[cols[0]], r[cols[1]] = when(s["datavalue"]["value"])
                        for s in (c.get("qualifiers") or {}).get("P1352", [])[:1]:
                            if s["snaktype"] == "value" and s["datavalue"]["type"] == "quantity": r["ranking"] = s["datavalue"]["value"]["amount"].lstrip("+")
                        for s in (c.get("qualifiers") or {}).get("P1545", [])[:1]:
                            if s["snaktype"] == "value" and s["datavalue"]["type"] == "string": r["ordinal"] = s["datavalue"]["value"]
                        claims.append(r)
            else:
                lab = (e.get("labels") or {}).get("en", {}).get("value")
                lg, sp, co = first(e, "P118"), first(e, "P641"), first(e, "P17")
                items[qid] = (qid, lab, first(e, "P31") + first(e, "P279"), lg[0] if lg else None, sp[0] if sp else None, co[0] if co else None)
    cols = ["qid", "prop", "n", "rank", "value_qid", "start_on", "start_prec", "end_on", "end_prec", "point_on", "point_prec", "ranking", "ordinal"]
    sql = ["begin;", "truncate legacy_people.resume_claim, legacy_people.resume_item;",
           "copy legacy_people.resume_claim (%s) from stdin;" % ", ".join(cols)]
    sql += ["\t".join(tsv(r.get(c)) for c in cols) for r in claims] + ["\\."]
    sql += ["copy legacy_people.resume_item (qid, label, kinds, league_qid, sport_qid, country_qid) from stdin;"]
    sql += ["\t".join(tsv(x) for x in v) for v in items.values()] + ["\\."]
    for f in files:
        name = "people/resume/%s/%s" % (SAVED, f)
        p = os.path.abspath(os.path.join(raw, f)).replace("'", "''")
        sql.append("insert into legacy_files.raw_archive (name, saved_on, sha256, data) select '%s', '%s', encode(sha256(b), 'hex'), b "
                   "from (select pg_read_binary_file('%s') as b) x where not exists (select 1 from legacy_files.raw_archive where name = '%s');" % (name, SAVED, p, name))
    sql.append("commit;")
    r = subprocess.run(CONN, input="\n".join(sql) + "\n", text=True, capture_output=True)
    print(len(claims), "statements,", len(items), "items,", len(files), "files archived", r.stderr.strip()[:500])
    if r.returncode: sys.exit(1)

if __name__ == "__main__":
    main(sys.argv[1])

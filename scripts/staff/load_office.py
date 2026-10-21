#!/usr/bin/env python3
"""Read the club-season articles already saved by fetch_wikipedia.py (no request) and write the general manager and president of the
infobox as SQL for legacy_staff.wikipedia_office (replaced whole, so it can be rerun). Needs migration 147 on the target first.

Usage: load_office.py [--raw DIR] [--out FILE] [--dry-run]
  --out FILE   write the SQL there; apply it with `bash scripts/mac/ds1-apply.sh FILE --force` (the coordinating session). Without it, only the counts print.
A president written "(vice)" is a vice president and is left out. Names are the infobox's own; a name with no link is not matched to anyone here (db/build/188 decides)."""
import argparse, glob, importlib.util, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("lw", os.path.join(HERE, "load_wikipedia.py"))
lw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lw)

OFFICE = {"general_manager": {"generalmanager", "gm", "generalmanger", "generalmanagers"}, "president": {"president", "presidents"}}

def lit(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=os.path.expanduser(os.environ.get("SPX_RAW_DIR", "~/Projects/backups/spx-stats/raw") + "/wikipedia_staff/2026-10-12"))
    ap.add_argument("--out")
    a = ap.parse_args()
    pages, redirect = {}, {}
    for f in sorted(glob.glob(a.raw + "/batch/*.json")):
        q = json.loads(open(f, "rb").read())["query"]
        for r in q.get("normalized", []) + q.get("redirects", []): redirect[r["from"]] = r["to"]
        for p in q["pages"]:
            rev = (p.get("revisions") or [None])[0]
            pages[p["title"]] = rev["slots"]["main"]["content"] if rev and not p.get("missing") else None
    def resolve(t):
        for _ in range(4): t = redirect.get(t, t)
        return t
    rows, seasons = [], {}
    for line in open(a.raw + "/targets.tsv"):
        lg, tsid, yr, title = line.rstrip("\n").split("\t")
        text = pages.get(resolve(title))
        box = lw.infobox(text) if text else None
        if box is None: continue
        pr = lw.params(box)
        for field, keys in OFFICE.items():
            names = [(n, t, nt) for k, v in pr.items() if k in keys for n, t, nt in lw.names(v) if not (nt and re.search(r"\bvice\b", nt, re.I))]
            for i, (n, t, nt) in enumerate(names, 1):
                rows.append((int(tsid), field, i, n, t, nt))
            if names: seasons[(lg, field)] = seasons.get((lg, field), 0) + 1
    for k in sorted(seasons): print(k, seasons[k], "club seasons")
    print(len(rows), "names")
    if not a.out: return
    with open(os.path.expanduser(a.out), "w") as o:
        o.write("delete from legacy_staff.wikipedia_office;\n")
        for r in rows:
            o.write("insert into legacy_staff.wikipedia_office (team_season_id, field, n, name, link_title, note) values (%d, %s, %d, %s, %s, %s);\n"
                    % (r[0], lit(r[1]), r[2], lit(r[3]), lit(r[4]), lit(r[5])))
        o.write("select field, count(*) from legacy_staff.wikipedia_office group by 1 order by 1;\n")

if __name__ == "__main__":
    main()

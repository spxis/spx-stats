"""Turn a mongoexport of a spx-stats pages collection into CSV rows for
legacy_mongo.player_season_stat: the parsed rows (data.rows) of the latest
snapshot of each page. Pages and HTML are not kept."""
import csv, json, sys
src, out, tag = sys.argv[1], sys.argv[2], sys.argv[3]
IDENT = {"id", "name", "unicodeName", "slug", "teamId"}

def date_of(v):
    return v.get("$date") if isinstance(v, dict) else v

latest = {}
for line in open(src, encoding="utf-8"):
    d = json.loads(line)
    data = d.get("data") or {}
    rows = data.get("rows")
    taken = date_of(d.get("timestamp")) or date_of(d.get("date"))
    if not d.get("key") or not rows or not taken:
        continue
    if d["key"] not in latest or taken > latest[d["key"]][0]:
        latest[d["key"]] = (taken, d, data, rows)

with open(out, "w", newline="") as f:
    w = csv.writer(f)
    for taken, d, data, rows in latest.values():
        year = data.get("year") if isinstance(data.get("year"), int) else d.get("year")
        for r in rows:
            if r.get("id") is None:
                continue
            stats = {k: v for k, v in r.items() if k not in IDENT}
            w.writerow([d.get("sportAbbName"), year, d.get("seasonType"), d.get("statType"), str(r["id"]),
                        r.get("unicodeName") or r.get("name"), r.get("teamId") or "", json.dumps(stats),
                        taken[:10], data.get("pageLastUpdated"), d.get("url"), "{" + tag + "}"])

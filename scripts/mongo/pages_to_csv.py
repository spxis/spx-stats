"""Turn a mongoexport of a pages collection (one JSON document per line,
relaxed extended JSON) into CSV for legacy_mongo.page_snapshot."""
import csv, json, sys
src, out, tag = sys.argv[1], sys.argv[2], sys.argv[3]

def date_of(v):
    return v.get("$date") if isinstance(v, dict) else v

with open(out, "w", newline="") as f:
    w = csv.writer(f)
    for line in open(src, encoding="utf-8"):
        d = json.loads(line)
        taken = date_of(d.get("timestamp")) or date_of(d.get("date"))
        if not d.get("key") or not taken:
            continue
        body = d.pop("body", None)
        d.pop("_id", None)
        q = (d.get("metadata") or {}).get("query") or {}
        year = d.get("year") if isinstance(d.get("year"), int) else q.get("year")
        row = [d["key"], taken, d.get("sourceId"), d.get("sportAbbName"), d.get("statType"), d.get("seasonType"),
               year if isinstance(year, int) else None, d.get("url"), json.dumps(d, ensure_ascii=False), body, "{" + tag + "}"]
        w.writerow(["\\N" if v is None else v for v in row])

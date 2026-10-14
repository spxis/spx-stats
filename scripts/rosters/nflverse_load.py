#!/usr/bin/env python3
"""nflverse season rosters (nflverse_fetch.py) -> one SQL file that loads legacy_nflverse.roster (migration 094) and archives the raw files.

  nflverse_load.py <raw dir> <out.sql> [YYYY-MM-DD]

The SQL is inline, so the coordinator applies it to DS1 with scripts/mac/ds1-apply.sh <out.sql>. It replaces the rows of every season the raw
dir holds. Each raw file is kept as gzip in legacy_files.raw_archive, named nflverse_rosters/<day>/roster_<season>.csv.gz (`gunzip` returns the
file exactly; the files are saved without other sites' id columns, see nflverse_fetch.py). <day> is the third argument, else the raw dir's name."""
import csv, datetime, gzip, hashlib, io, os, re, sys

def tsv(v):
    if v is None or v == "" or v == "NA": return "\\N"
    return str(v).replace("\\", "\\\\").replace("\t", " ").replace("\n", " ").replace("\r", " ")

def num(v):
    m = re.match(r"\s*(-?\d+)", v or "")
    return m.group(1) if m else None

def date(v):
    try: return datetime.date.fromisoformat(v).isoformat() if v else None
    except ValueError: return None

COLS = ["season", "row_no", "team", "position", "depth_position", "jersey_number", "status", "full_name", "first_name", "last_name", "birth_date",
        "height_in", "weight_lb", "college", "gsis_id", "years_exp", "entry_year", "rookie_year", "draft_club", "draft_number", "week", "game_type"]

def main(raw, out, day):
    files = sorted(f for f in os.listdir(raw) if re.fullmatch(r"roster_\d{4}\.csv", f))
    sql = ["begin;"]
    n = 0
    for f in files:
        season = int(f[7:11])
        sql.append(f"delete from legacy_nflverse.roster where season = {season};")
        sql.append(f"copy legacy_nflverse.roster ({', '.join(COLS)}) from stdin;")
        for i, r in enumerate(csv.DictReader(io.StringIO(open(f"{raw}/{f}", encoding="utf-8", newline="").read())), 1):
            if not r.get("full_name"): continue
            vals = [season, i, r["team"], r.get("position"), r.get("depth_chart_position"), num(r.get("jersey_number")), r.get("status"), r["full_name"],
                    r.get("first_name"), r.get("last_name"), date(r.get("birth_date")), num(r.get("height")), num(r.get("weight")), r.get("college"),
                    r.get("gsis_id"), num(r.get("years_exp")), num(r.get("entry_year")), num(r.get("rookie_year")), r.get("draft_club"),
                    num(r.get("draft_number")), num(r.get("week")), r.get("game_type")]
            sql.append("\t".join(tsv(v) for v in vals)); n += 1
        sql.append("\\.")
    for f in files:
        b = gzip.compress(open(f"{raw}/{f}", "rb").read(), mtime=0)
        sql.append("insert into legacy_files.raw_archive (name, saved_on, sha256, data) values "
                   f"('nflverse_rosters/{day}/{f}.gz', '{day}', '{hashlib.sha256(b).hexdigest()}', decode('{b.hex()}', 'hex')) "
                   "on conflict (name) do update set saved_on = excluded.saved_on, sha256 = excluded.sha256, data = excluded.data;")
    sql.append("select count(*) as rows, min(season) as first_season, max(season) as last_season from legacy_nflverse.roster;")
    sql.append("commit;")
    open(out, "w", encoding="utf-8").write("\n".join(sql) + "\n")
    print(n, "rows,", len(files), "seasons ->", out)

if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) < 2: sys.exit(__doc__)
    main(a[0].rstrip("/"), a[1], a[2] if len(a) > 2 else os.path.basename(a[0].rstrip("/")))

#!/usr/bin/env python3
"""Load SPX's 2004 European results capture (Data/efl/2004-regular/data/efl-2004-schedules.csv of the SportsInteractive folder) into
legacy_spx_extras.efl_result (migration 140). DS1 only, and only after John has decided about the file (its pages were ESPN Soccernet's).
Usage: efl.py <efl-2004-schedules.csv> <archive name> [--sql-out FILE]
       e.g. efl.py ~/Library/CloudStorage/Dropbox/Projects/SportsInteractive/Data/efl/2004-regular/data/efl-2004-schedules.csv spx-extras/2026-10-19/efl/efl-2004-schedules.csv --sql-out efl.sql
<archive name> is the name the same file has in legacy_files.raw_archive (scripts/archive_raw.py), so each row points back at its bytes.
Reads PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD and runs the SQL, or with --sql-out writes it to FILE (apply with scripts/mac/ds1-apply.sh).
Raw means raw: names are kept as the file has them (cp1252), a score of '-' or blank is null, nothing is matched to a club here."""
import csv, io, re, subprocess, sys


def parse(raw):
    """Rows of the file as dicts, and the lines it could not read (never guessed)."""
    text = raw.decode("cp1252", errors="replace")
    rows, bad = [], []
    for n, r in enumerate(csv.reader(io.StringIO(text)), 0):
        if n == 0:
            continue
        if len(r) not in (5, 7):
            bad.append((n, r)); continue
        m = re.fullmatch(r"(\d+)/(\d+)/(\d{4})(?: (\d{1,2}):(\d{2}))?", r[1].strip())
        if not m or not r[0].strip().isdigit():
            bad.append((n, r)); continue
        mo, d, y, hh, mm = m.groups()
        ts = f"{y}-{int(mo):02d}-{int(d):02d} {int(hh or 0):02d}:{mm or '00'}:00"
        score = lambda v: int(v) if v.strip().isdigit() else None
        away_s, home_s, status = (score(r[3]), score(r[5]), r[6].strip() or None) if len(r) == 7 else (None, None, None)
        rows.append(dict(line=n, team_page=int(r[0]), game_date=ts, away=r[2].strip(), away_score=away_s, home=r[4].strip(), home_score=home_s, status=status))
    return rows, bad


def sql(rows, name):
    q = lambda v: "null" if v is None else "'" + str(v).replace("'", "''") + "'"
    n = lambda v: "null" if v is None else str(v)
    out = [f"delete from legacy_spx_extras.efl_result where source_file = {q(name)};"]
    vals = [f"({q(name)}, {r['line']}, {r['team_page']}, {q(r['game_date'])}, {q(r['away'])}, {n(r['away_score'])}, {q(r['home'])}, {n(r['home_score'])}, {q(r['status'])})" for r in rows]
    for i in range(0, len(vals), 400):
        out.append("insert into legacy_spx_extras.efl_result (source_file, line, team_page, game_date, away_name, away_score, home_name, home_score, status) values\n"
                   + ",\n".join(vals[i:i + 400]) + ";")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    argv = sys.argv[1:]
    sql_out = None
    if "--sql-out" in argv:
        i = argv.index("--sql-out"); sql_out = argv[i + 1]; del argv[i:i + 2]
    path, name = argv[0], argv[1]
    rows, bad = parse(open(path, "rb").read())
    for n_, r in bad:
        print("unread line", n_, r, file=sys.stderr)
    text = sql(rows, name)
    if sql_out:
        open(sql_out, "w").write(text)
        print(f"wrote {len(rows)} rows, {len(bad)} unread lines -> {sql_out}")
    else:
        p = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-q", "-1", "-f", "-"], input=text, text=True, capture_output=True)
        if p.returncode:
            raise SystemExit(p.stderr[-500:])
        print(f"loaded {len(rows)} rows, {len(bad)} unread lines")

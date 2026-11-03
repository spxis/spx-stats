#!/usr/bin/env python3
"""nflverse games.csv files -> one rerunnable load file for legacy_nflverse.game (migration 009). Reads files only: no request, no database.

    python3 -I scripts/nflverse/games_load.py FILE [FILE ...] --out LOAD.sql

FILE is a games.csv of nflverse-data's `schedules` release (CC BY 4.0), the whole file or the season rows the daily job keeps (raw/nflverse/<day>/games-<season>.<sha>.csv).
Files are read in the order given; a game in a later file replaces the same game_id of an earlier one. Every column of a line goes into `row`, as published ("" and "NA" are
null), which is where db/build/242 reads the spread, total and money lines from. LOAD.sql creates a temp table, COPYs the rows in and upserts by game_id, touching only a
game whose values changed; a second run changes nothing. Apply it with `bash scripts/mac/ds1-apply.sh LOAD.sql --force` (the coordinating session; the file lives outside db/).
Archive first: the input files are already in Dropbox raw/nflverse/ and legacy_files.raw_archive (games.csv of the first load, the daily job's season files); a file that is not
there is archived with scripts/archive_raw.py before this load.
"""
import csv, json, sys

COLS = ("game_id", "season", "game_type", "week", "gameday", "gametime", "away_team", "away_score", "home_team", "home_score", "location", "overtime", "stadium", "row")


def null(v):
    return None if v in ("", "NA", None) else v


def cell(v):
    if v is None:
        return "\\N"
    return str(v).replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")


def line(r):
    return (r["game_id"], r["season"], r["game_type"], null(r["week"]), r["gameday"], null(r["gametime"]), r["away_team"], null(r["away_score"]), r["home_team"],
            null(r["home_score"]), null(r["location"]), {"1": "t", "0": "f"}.get(r["overtime"]), null(r.get("stadium")),
            json.dumps({k: null(v) for k, v in r.items()}))


def main(argv):
    if "--out" not in argv or len(argv) < 3:
        raise SystemExit(__doc__)
    i = argv.index("--out")
    out, files = argv[i + 1], argv[:i] + argv[i + 2:]
    games = {}
    for f in files:
        with open(f, newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                games[r["game_id"]] = r
    rows = [line(games[k]) for k in sorted(games)]
    cols = ", ".join(COLS)
    rest = [c for c in COLS if c != "game_id"]
    sets = ", ".join("%s = excluded.%s" % (c, c) for c in rest)
    old = ", ".join("legacy_nflverse.game." + c for c in rest)
    new = ", ".join("excluded." + c for c in rest)
    with open(out, "w", encoding="utf-8") as o:
        o.write("-- legacy_nflverse.game, %d games from %d file(s) (scripts/nflverse/games_load.py). Rerunnable: a game replaces itself by game_id, only when a value changed. DS1 only.\n" % (len(rows), len(files)))
        o.write("begin;\ncreate temp table _g (like legacy_nflverse.game) on commit drop;\ncopy _g (%s) from stdin;\n" % cols)
        for r in rows:
            o.write("\t".join(cell(v) for v in r) + "\n")
        o.write("\\.\n")
        o.write("insert into legacy_nflverse.game (%s) select %s from _g on conflict (game_id) do update set %s\n  where (%s) is distinct from (%s);\n" % (cols, cols, sets, old, new))
        o.write("select count(*) as games, count(*) filter (where row->>'spread_line' is not null or row->>'total_line' is not null) as with_a_line from legacy_nflverse.game;\ncommit;\n")
    print("%d games from %d file(s) -> %s" % (len(rows), len(files), out))


if __name__ == "__main__":
    main(sys.argv[1:])

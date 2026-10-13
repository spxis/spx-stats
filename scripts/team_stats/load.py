#!/usr/bin/env python3
"""Load the raw files saved by fetch.py into legacy_team_stats (replaced whole per source, so it can be rerun).

  load.py --source nhl|nflverse [--raw DIR]      connection from the PG* variables; migration 041 first.
"""
import argparse, csv, glob, io, json, os, subprocess, sys

def run(sql):
    p = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"], input=sql, text=True, capture_output=True)
    if p.returncode: sys.exit(p.stderr)

def csvtext(rows):
    b = io.StringIO()
    csv.writer(b, lineterminator="\n").writerows([["\\N" if c is None else c for c in r] for r in rows])
    return b.getvalue()

def num(v):
    try: return int(float(v))
    except (TypeError, ValueError): return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, choices=["nhl", "nflverse"])
    ap.add_argument("--raw")
    a = ap.parse_args()
    raw = a.raw or sorted(glob.glob(os.path.expanduser(os.environ.get("SPX_RAW_DIR", "~/Projects/backups/spx-stats/raw") + f"/team_stats_{a.source}/*")))[-1]
    if a.source == "nhl":
        rows = []
        for p in sorted(glob.glob(raw + "/*.json")):
            ep = os.path.basename(p).split("_")[0]
            for r in json.load(open(p))["data"]:
                rows.append([r["seasonId"], ep, r["teamId"], r["teamFullName"], json.dumps(r)])
        table, cols = "legacy_team_stats.nhl_team_season", "season_id, endpoint, team_id, team_name, row"
    else:
        rows = []
        for p in sorted(glob.glob(raw + "/stats_team_week_*.csv")):
            for r in csv.DictReader(open(p, encoding="utf-8")):
                rows.append([r["season"], r["week"], r["team"], r["season_type"], r["game_id"] or None, r["opponent_team"] or None,
                             num(r["passing_yards"]), num(r["rushing_yards"]), num(r["sack_yards_lost"])])
        table, cols = "legacy_team_stats.nflverse_team_week", "season, week, team, season_type, game_id, opponent_team, passing_yards, rushing_yards, sack_yards_lost"
    run(f"begin;\ntruncate {table};\n\\copy {table} ({cols}) from stdin with (format csv, null '\\N')\n{csvtext(rows)}\\.\ncommit;\n")
    print(table, len(rows), "rows")

if __name__ == "__main__":
    main()

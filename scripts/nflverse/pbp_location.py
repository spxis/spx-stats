"""nflverse play-by-play (nflverse-data release "pbp": play_by_play_<year>.csv.gz) -> the passes and runs, with where they went, for
legacy_nflverse.pbp_location (see db/migrations/080_legacy_pbp_location.sql and db/build/208_pass_run_location.sql).

Usage: python3 -I scripts/nflverse/pbp_location.py <folder of play_by_play_<year>.csv.gz> <out folder>
Writes pbp_location.csv, pbp_location_coverage.csv and load.sql (both tables emptied and filled with COPY ... FROM STDIN in one file,
for scripts/mac/ds1-apply.sh --force). Nothing is unpacked to disk.

Only the release "pbp" of github.com/nflverse/nflverse-data is used. A play is kept when it is a pass or a run (play_type 'pass' or 'run');
kicks, punts, kneel-downs, spikes, no-plays and plays that only carry a penalty are left out. Two-point tries are kept and flagged
(two_point), and the build leaves them out of the grids, as the league's own statistics do. posteam_type (home or away) says which of the
game's two sides has the ball: nflverse writes current team codes (LA, LV, LAC) in every season, so the code alone does not find the home or
away club of an older game. Other columns are copied as published: pass_location (left, middle, right), air_yards (yards the ball travelled
past the line of scrimmage, negative behind it), run_location and run_gap (end, tackle, guard; nflverse leaves the gap empty for a run up the
middle). Where the file has no value the column is null: 1999-2005 carry no air_yards at all, so the pass grid starts in 2006;
pbp_location_coverage shows it (a hole, not a zero).

nflverse's notice: "nflverse (CC BY 4.0), data from NFL.com". """
import csv, gzip, os, re, sys
from collections import Counter

N = lambda v: "\\N" if v in ("", "NA", None) else v
BOOL = lambda v: "\\N" if v in ("", "NA", None) else ("t" if v in ("1", "1.0", "TRUE", "true") else "f")


def INT(v):
    if v in ("", "NA", None):
        return "\\N"
    return str(int(float(v)))


COLS = ("game_id, play_id, season, week, season_type, posteam, defteam, posteam_type, play_type, pass_attempt, rush_attempt, sack, qb_scramble, two_point, "
        "pass_location, air_yards, yards_after_catch, complete_pass, interception, pass_touchdown, run_location, run_gap, yards_gained, "
        "rush_touchdown, yardline_100, passer_id, passer_name, receiver_id, receiver_name, rusher_id, rusher_name")
COV_COLS = "season, season_type, plays, pass_attempts, pass_located, runs, run_located"
SIDES = {"left", "middle", "right"}
GAPS = {"end", "tackle", "guard"}


def main():
    src, out = sys.argv[1:3]
    os.makedirs(out, exist_ok=True)
    files = sorted(f for f in os.listdir(src) if re.match(r"^play_by_play_\d{4}\.csv\.gz$", f))
    cov = Counter()      # (season, season_type, what)
    seen = set()
    nrows = 0
    with open(f"{out}/pbp_location.csv", "w", newline="") as fo:
        w = csv.writer(fo)
        for fn in files:
            with gzip.open(f"{src}/{fn}", "rt", encoding="utf-8", newline="") as fi:
                for r in csv.DictReader(fi):
                    pt = r["play_type"]
                    if pt not in ("pass", "run"):
                        continue
                    key = (r["game_id"], r["play_id"])
                    if key in seen:
                        print("duplicate play", key, file=sys.stderr)
                        continue
                    seen.add(key)
                    season, st = int(r["season"]), r["season_type"]
                    two = r["two_point_attempt"] in ("1", "1.0")
                    cov[(season, st, "plays")] += 1
                    pa = r["pass_attempt"] in ("1", "1.0") and pt == "pass"
                    ra = r["rush_attempt"] in ("1", "1.0") and pt == "run"
                    if not two:
                        if pa:
                            cov[(season, st, "pass_attempts")] += 1
                            if r["pass_location"] in SIDES and r["air_yards"] not in ("", "NA"):
                                cov[(season, st, "pass_located")] += 1
                        if ra:
                            cov[(season, st, "runs")] += 1
                            if r["run_location"] == "middle" or (r["run_location"] in SIDES and r["run_gap"] in GAPS):
                                cov[(season, st, "run_located")] += 1
                    w.writerow([r["game_id"], r["play_id"], season, INT(r["week"]), st, N(r["posteam"]), N(r["defteam"]), N(r["posteam_type"]), pt,
                                BOOL(r["pass_attempt"]), BOOL(r["rush_attempt"]), BOOL(r["sack"]), BOOL(r["qb_scramble"]), "t" if two else "f",
                                N(r["pass_location"]), INT(r["air_yards"]), INT(r["yards_after_catch"]), BOOL(r["complete_pass"]),
                                BOOL(r["interception"]), BOOL(r["pass_touchdown"]), N(r["run_location"]), N(r["run_gap"]), INT(r["yards_gained"]),
                                BOOL(r["rush_touchdown"]), INT(r["yardline_100"]), N(r["passer_player_id"]), N(r["passer_player_name"]),
                                N(r["receiver_player_id"]), N(r["receiver_player_name"]), N(r["rusher_player_id"]), N(r["rusher_player_name"])])
                    nrows += 1
            print(fn, flush=True, file=sys.stderr)
    with open(f"{out}/pbp_location_coverage.csv", "w", newline="") as fo:
        w = csv.writer(fo)
        for (season, st) in sorted({(s, t) for s, t, _ in cov}):
            w.writerow([season, st] + [cov[(season, st, c)] for c in ("plays", "pass_attempts", "pass_located", "runs", "run_located")])
    with open(f"{out}/load.sql", "w") as fo:
        for table, cols, name in (("pbp_location", COLS, "pbp_location.csv"), ("pbp_location_coverage", COV_COLS, "pbp_location_coverage.csv")):
            fo.write(f"delete from legacy_nflverse.{table};\ncopy legacy_nflverse.{table} ({cols}) from stdin with (format csv, null '\\N');\n")
            with open(f"{out}/{name}") as fi:
                for chunk in iter(lambda: fi.read(1 << 20), ""):
                    fo.write(chunk)
            fo.write("\\.\n")
    print(nrows, "passes and runs from", len(files), "files")


if __name__ == "__main__":
    main()

"""nflverse play-by-play (nflverse-data release "pbp": play_by_play_<year>.csv.gz) -> one row per drive, for legacy_nflverse.pbp_drive
(see db/migrations/164_game_field.sql and db/build/236_game_field_nfl.sql). The game page draws each drive on the football field.

Usage: python3 -I scripts/nflverse/pbp_drive.py <folder of play_by_play_<year>.csv.gz> <out folder>
Writes pbp_drive.csv and load.sql (the table emptied and filled with COPY ... FROM STDIN in one file, for scripts/mac/ds1-apply.sh --force).
Nothing is unpacked to disk. The same raw files as scripts/nflverse/pbp_location.py (archived under raw_archive as nflverse_pbp).

Only the release "pbp" of github.com/nflverse/nflverse-data is used. A drive is the plays that share nflverse's `drive` number in a game; its
club, quarter, clock, time of possession, play count, first downs and result are nflverse's own drive_* columns and fixed_drive_result, copied as
published. A play without a drive number (nflverse leaves a few pre-game and end-of-game rows with none) belongs to no drive. The line of scrimmage
of each pass, run, kneel-down, spike, field goal and punt (two-point tries, extra points, kick-offs and no-plays left out) is kept as `los`, in yards from
the opponent's end line, which is how nflverse writes yardline_100; the first is the drive's start. The end is where the drive ended: the goal line
for a touchdown, otherwise the last of those plays' line of scrimmage moved by the yards it gained when it was a pass or a run (a kick, a field goal
or a turnover ends at its line of scrimmage). A drive with no such play is left out.

nflverse's notice: "nflverse (CC BY 4.0), data from NFL.com". """
import csv, gzip, os, re, sys

SCRIMMAGE = {"pass", "run", "qb_kneel", "qb_spike", "field_goal", "punt"}
MISSING = ("", "NA", None)


def N(v):
    return "\\N" if v in MISSING else v


def INT(v):
    return "\\N" if v in MISSING else str(int(float(v)))


def secs(v):
    m = re.fullmatch(r"(\d+):(\d\d)", v or "")
    return "\\N" if not m else str(int(m.group(1)) * 60 + int(m.group(2)))


def flag(v):
    return "\\N" if v in MISSING else ("t" if v in ("1", "1.0", "TRUE", "true") else "f")


def drive_row(rows):
    first = rows[0]
    if first["posteam_type"] not in ("home", "away") or first["season_type"] not in ("REG", "POST"):
        return None
    los, last = [], None
    for r in rows:
        if r["play_type"] not in SCRIMMAGE or r["yardline_100"] in MISSING or r["two_point_attempt"] in ("1", "1.0"):
            continue
        los.append(int(float(r["yardline_100"])))
        last = r
    if not los:
        return None
    result = first["fixed_drive_result"]
    if result == "Touchdown":
        end = 0
    elif last["play_type"] in ("pass", "run") and last["yards_gained"] not in MISSING:
        end = max(0, min(100, los[-1] - int(float(last["yards_gained"]))))
    else:
        end = los[-1]
    return [first["game_id"], INT(first["drive"]), INT(first["season"]), INT(first["week"]), first["season_type"], N(first["posteam"]), N(first["defteam"]),
            first["posteam_type"], INT(first["drive_quarter_start"]), N(first["drive_game_clock_start"]), secs(first["drive_time_of_possession"]),
            INT(first["drive_play_count"]), INT(first["drive_first_downs"]), N(result), flag(first["drive_ended_with_score"]), str(los[0]), str(end),
            " ".join(str(x) for x in los)]


def main():
    src, out = sys.argv[1:3]
    os.makedirs(out, exist_ok=True)
    files = sorted(f for f in os.listdir(src) if re.match(r"^play_by_play_\d{4}\.csv\.gz$", f))
    n = 0
    with open(f"{out}/pbp_drive.csv", "w", newline="") as fo:
        w = csv.writer(fo)
        for fn in files:
            groups, order = {}, []
            with gzip.open(f"{src}/{fn}", "rt", encoding="utf-8", newline="") as fi:
                for r in csv.DictReader(fi):
                    if r["drive"] in MISSING:
                        continue
                    key = (r["game_id"], r["drive"])
                    if key not in groups:
                        groups[key] = []
                        order.append(key)
                    groups[key].append(r)
            for key in order:
                row = drive_row(groups[key])
                if row:
                    w.writerow(row)
                    n += 1
            print(fn, flush=True, file=sys.stderr)
    cols = ("game_id, drive, season, week, season_type, posteam, defteam, posteam_type, qtr, clock, top_secs, plays, first_downs, result, scored, "
            "start_yd, end_yd, los")
    with open(f"{out}/load.sql", "w") as fo:
        fo.write(f"delete from legacy_nflverse.pbp_drive;\ncopy legacy_nflverse.pbp_drive ({cols}) from stdin with (format csv, null '\\N');\n")
        with open(f"{out}/pbp_drive.csv") as fi:
            for chunk in iter(lambda: fi.read(1 << 20), ""):
                fo.write(chunk)
        fo.write("\\.\n")
    print(n, "drives from", len(files), "files")


if __name__ == "__main__":
    main()

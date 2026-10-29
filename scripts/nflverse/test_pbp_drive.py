"""Test of scripts/nflverse/pbp_drive.py on a hand-made play-by-play file (no network): python3 -I scripts/nflverse/test_pbp_drive.py"""
import csv, gzip, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
COLS = ("game_id drive season week season_type posteam defteam posteam_type drive_quarter_start drive_game_clock_start drive_time_of_possession drive_play_count "
        "drive_first_downs fixed_drive_result drive_ended_with_score play_type yardline_100 yards_gained two_point_attempt").split()


def play(game, drive, side, result, play_type, yd, gained, two="0", team=("AAA", "BBB")):
    posteam, defteam = team if side == "away" else team[::-1]
    return dict(zip(COLS, [game, drive, "2024", "1", "REG", posteam, defteam, side, "1", "15:00", "4:19", "5", "1", result, "1" if result in ("Touchdown", "Field goal") else "0",
                           play_type, yd, gained, two]))


ROWS = [
    # drive 1: a touchdown (the kick-off, a two-point try after it and the extra point are not lines of scrimmage; the end is the goal line)
    play("2024_01_AAA_BBB", "1", "away", "Touchdown", "kickoff", "35", "0"),
    play("2024_01_AAA_BBB", "1", "away", "Touchdown", "pass", "70", "8"),
    play("2024_01_AAA_BBB", "1", "away", "Touchdown", "run", "62", "62"),
    play("2024_01_AAA_BBB", "1", "away", "Touchdown", "pass", "3", "3", two="1"),
    play("2024_01_AAA_BBB", "1", "away", "Touchdown", "extra_point", "15", "0"),
    # drive 2: a punt (ends at the line of scrimmage of the punt; a no-play and a play with no line are skipped)
    play("2024_01_AAA_BBB", "2", "home", "Punt", "run", "80", "3"),
    play("2024_01_AAA_BBB", "2", "home", "Punt", "no_play", "77", "0"),
    play("2024_01_AAA_BBB", "2", "home", "Punt", "pass", "", "0"),
    play("2024_01_AAA_BBB", "2", "home", "Punt", "pass", "77", "-4"),
    play("2024_01_AAA_BBB", "2", "home", "Punt", "punt", "81", "0"),
    # drive 3: a lost fumble on a run (ends where the run ended)
    play("2024_01_AAA_BBB", "3", "away", "Turnover", "run", "40", "6"),
    # a row with no drive number belongs to no drive; a drive of no scrimmage play is left out
    play("2024_01_AAA_BBB", "", "away", "", "run", "40", "6"),
    play("2024_01_AAA_BBB", "4", "home", "End of half", "kickoff", "35", "0"),
    # a preseason game is not kept
    {**play("2024_00_AAA_BBB", "1", "away", "Punt", "run", "70", "2"), "season_type": "PRE"},
]


def main():
    with tempfile.TemporaryDirectory() as d:
        src, out = os.path.join(d, "src"), os.path.join(d, "out")
        os.makedirs(src)
        with gzip.open(os.path.join(src, "play_by_play_2024.csv.gz"), "wt", newline="") as f:
            w = csv.DictWriter(f, COLS)
            w.writeheader()
            w.writerows(ROWS)
        subprocess.run([sys.executable, "-I", os.path.join(HERE, "pbp_drive.py"), src, out], check=True, capture_output=True)
        got = list(csv.reader(open(os.path.join(out, "pbp_drive.csv"))))
        load = open(os.path.join(out, "load.sql")).read()
    want = [
        ["2024_01_AAA_BBB", "1", "2024", "1", "REG", "AAA", "BBB", "away", "1", "15:00", "259", "5", "1", "Touchdown", "t", "70", "0", "70 62"],
        ["2024_01_AAA_BBB", "2", "2024", "1", "REG", "BBB", "AAA", "home", "1", "15:00", "259", "5", "1", "Punt", "f", "80", "81", "80 77 81"],
        ["2024_01_AAA_BBB", "3", "2024", "1", "REG", "AAA", "BBB", "away", "1", "15:00", "259", "5", "1", "Turnover", "f", "40", "34", "40"],
    ]
    assert got == want, got
    assert load.startswith("delete from legacy_nflverse.pbp_drive;\ncopy legacy_nflverse.pbp_drive (") and load.rstrip().endswith("\\."), load[:200]
    print("ok: 3 drives; a touchdown ends at the goal line, a punt at its line, a lost fumble where the run ended; no-drive, no-line and preseason rows left out")


main()

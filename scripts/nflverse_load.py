"""nflverse games.csv -> CSV for legacy_nflverse.game. Usage: nflverse_load.py <games.csv> <out.csv>"""
import csv, json, sys
N = lambda v: "\\N" if v in ("", "NA", None) else v
with open(sys.argv[2], "w", newline="") as fo:
    w = csv.writer(fo)
    for r in csv.DictReader(open(sys.argv[1], encoding="utf-8")):
        w.writerow([r["game_id"], r["season"], r["game_type"], N(r["week"]), r["gameday"], N(r["gametime"]), r["away_team"], N(r["away_score"]),
                    r["home_team"], N(r["home_score"]), N(r["location"]), {"1": "t", "0": "f"}.get(r["overtime"], "\\N"), N(r.get("stadium")),
                    json.dumps({k: (None if v in ("", "NA") else v) for k, v in r.items()})])

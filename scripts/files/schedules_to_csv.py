"""SPX schedule files of the years before the database (1999-2001) -> CSV
rows for legacy_files.schedule_game. Two shapes are known:
  ScheduleID,SportID,AwayTeamID,HomeTeamID,GameDate   (SPX team ids)
  #team,date,where,opponent,time,teamgameid,oppgameid,network  (one row per team per game)
Usage: schedules_to_csv.py <out.csv> <tag> <league> <season> <file> [...]"""
import csv, datetime, sys
out, tag, league, season = sys.argv[1:5]
rows = {}
for path in sys.argv[5:]:
    lines = [l for l in open(path, encoding="latin-1").read().replace("\r", "\n").split("\n") if l.strip()]
    head = lines[0].lstrip("#").lower().split(",")
    for r in csv.reader(lines[1:]):
        d = dict(zip(head, [x.strip() for x in r]))
        if "awayteamid" in d:
            when = datetime.datetime.fromisoformat(d["gamedate"])
            key = (when, d["awayteamid"], d["hometeamid"]); net = None
        elif "where" in d:
            if d["where"] != "home":
                continue                      # each game is listed twice; the home row stands for it
            when = datetime.datetime.strptime(d["date"], "%m/%d/%Y")
            if d.get("time"):
                when = datetime.datetime.combine(when.date(), datetime.datetime.strptime(d["time"], "%I:%M %p").time())
            key = (when, d["opponent"], d["team"]); net = d.get("network") or None
        else:
            continue
        rows[key] = [league, season, key[0].isoformat(sep=" "), key[1], key[2], net or "\\N", path.rsplit("/", 1)[-1], "{" + tag + "}"]
with open(out, "w", newline="") as f:
    csv.writer(f).writerows(rows.values())
print(len(rows), "games")

"""spxn MongoDB (2013) exports -> CSV for legacy_mongo.game and
legacy_mongo.player_game_stat. Pages, HTML and scraper bookkeeping are skipped."""
import csv, json, sys
games_in, teamgames_in, players_in, outdir, tag = sys.argv[1:6]
NUL = "\\N"

def n(v):
    return NUL if v is None or v == "" else v

home = {}  # game id -> home team, from teamgames
for line in open(teamgames_in, encoding="utf-8"):
    d = json.loads(line)
    if d.get("game-id") and d.get("is-home-game") is True:
        home[d["game-id"]] = d["team"]

with open(f"{outdir}/game.csv", "w", newline="") as f:
    w = csv.writer(f)
    for line in open(games_in, encoding="utf-8"):
        d = json.loads(line)
        gid = d.get("_id", {})
        gid = gid.get("$oid") if isinstance(gid, dict) else gid
        if not d.get("source-gameid") or not d.get("team1"):
            continue
        h = home.get(gid)
        if h == d["team1"]:
            ht, at, hs, as_ = d["team1"], d["team2"], d.get("score1"), d.get("score2")
        else:  # spxn lists the visitor first; teamgames confirms when it has the game
            ht, at, hs, as_ = d["team2"], d["team1"], d.get("score2"), d.get("score1")
        w.writerow([d["sport"], d["season"], d["type"], d["source-gameid"], n(d.get("date")), ht, at, n(hs), n(as_),
                    n(d.get("status")), n(d.get("is-overtime")), n(d.get("is-shootout")), n(d.get("is-cancelled")),
                    n(d.get("source-uri")), "{" + tag + "}"])

with open(f"{outdir}/player_game_stat.csv", "w", newline="") as f:
    w = csv.writer(f)
    for line in open(players_in, encoding="utf-8"):
        d = json.loads(line)
        head = (d.get("header") or "").split(",")[6:]
        vals = (d.get("stats") or "").split(",")
        if not d.get("source-playerid"):
            continue
        if len(head) == len(vals):
            stats = {k: (None if v == "" else v) for k, v in zip(head, vals)}
        elif (d.get("stats") or "").startswith("#"):  # did not play, e.g. #"dnp - inactive"
            stats = {"note": d["stats"].lstrip("#").strip('"')}
        else:
            continue
        w.writerow([d["sport"], d["season"], d["type"], d["source-gameid"], n(d.get("gamedate")), n(d.get("team")),
                    n(d.get("opponent")), d["source-playerid"], n(d.get("name")), n(d.get("fullname")), json.dumps(stats),
                    n(d.get("source-boxuri")), "{" + tag + "}"])

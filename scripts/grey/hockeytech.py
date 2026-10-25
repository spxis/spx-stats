#!/usr/bin/env python3
"""HockeyTech league feeds (grey) for leagues other than the PWHL: the schedule and scores of a season into legacy_hockeytech.game.

    HOCKEYTECH_KEY_AHL=... python3 -I scripts/grey/hockeytech.py fetch ahl 68 [--raw-dir DIR] [--purpose daily|manual]
    python3 -I scripts/grey/hockeytech.py parse <raw file> --client ahl --fetched-on 2026-10-25 [--out load.sql]

Grey area (scripts/daily/sources.py "hockeytech"): no terms found; a backup or cross-check only, at most the registry's daily cap of requests a day, one at a time,
5 s apart, through the shared limiter. NEVER the PWHL: `client_code=pwhl` is refused here, and by the registry (the PWHL feed is red-confirm and is never stored).
Each league's feed key is public in that league's own site but is John's to supply: one environment variable per league, HOCKEYTECH_KEY_<CODE>; never printed or saved.
The answer's shape (SiteKit.Schedule, string numbers, "Final" status) was written from memory of the modulekit feed and tested only on a saved sample: the first real
run is watched, and a row the parser cannot read goes to the unparsed list.
"""
import json, os, sys, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as C

SOURCE = "hockeytech"
FEED = "https://lscluster.hockeytech.com/feed/index.php"
CLIENTS = ("ahl", "echl", "ohl", "whl", "lhjmq")      # leagues other than the PWHL; add a code only after reading that league's terms
COLS = ("client_code", "game_id", "season_id", "game_date", "home_team", "away_team", "home_goals", "away_goals", "status", "overtime", "shootout", "venue",
        "fetched_on", "source_key")


def feed_url(client, season_id, key):
    if client.lower() == "pwhl" or client.lower() not in CLIENTS:
        raise C.SRC.SourceRefused("hockeytech", "client_code %r is not one of %s (the PWHL is never fetched)" % (client, ", ".join(CLIENTS)))
    q = {"feed": "modulekit", "view": "schedule", "key": key, "fmt": "json", "client_code": client.lower(), "lang": "en", "season_id": str(season_id)}
    return FEED + "?" + urllib.parse.urlencode(q)


def team(g, side):
    full = g.get(side + "_team_name") or " ".join(x for x in (g.get(side + "_team_city"), g.get(side + "_team_nickname")) if x)
    return full or g.get(side + "_team") or None


def parse_schedule(body, client, fetched_on):
    """-> (rows, unparsed). A game without an id, a date or both teams is listed in `unparsed`."""
    data = json.loads(body.decode("utf-8") if isinstance(body, bytes) else body)
    games = (data.get("SiteKit") or {}).get("Schedule") if isinstance(data, dict) else None
    if not isinstance(games, list):
        return [], [{"reason": "no SiteKit.Schedule list", "item": str(data)[:200]}]
    rows, unparsed = [], []
    for g in games:
        gid = str(g.get("game_id") or g.get("id") or "").strip()
        day = (g.get("date_played") or g.get("GameDateISO8601") or "")[:10]
        home, away = team(g, "home"), team(g, "visiting")
        if not gid or len(day) != 10 or not home or not away:
            unparsed.append({"reason": "no id, date or team", "item": json.dumps(g)[:200]})
            continue
        status = (g.get("game_status") or "").strip()
        final = status.lower().startswith("final")
        rows.append(dict(
            client_code=client, game_id=gid, season_id=str(g.get("season_id") or ""), game_date=day, home_team=home, away_team=away,
            home_goals=C.to_int(g.get("home_goal_count")) if final else None, away_goals=C.to_int(g.get("visiting_goal_count")) if final else None,
            status=status or None, overtime=C.to_bool(g.get("overtime")), shootout=C.to_bool(g.get("shootout")), venue=g.get("venue_name") or None,
            fetched_on=fetched_on, source_key="hockeytech:%s:%s" % (client, gid)))
    return rows, unparsed


def load_sql(rows, client, fetched_on):
    head = "-- legacy_hockeytech.game for %s, fetched %s (scripts/grey/hockeytech.py). Rerunnable: a game replaces itself by league and id. DS1 only. Grey area.\nbegin;\n" % (client, fetched_on)
    return head + C.inserts("legacy_hockeytech.game", COLS, rows, ("client_code", "game_id")) + "commit;\n"


def fetch(client, season_id, raw_dir, purpose="manual", fetcher=None):
    key = os.environ.get("HOCKEYTECH_KEY_" + client.upper())
    if not key:
        raise SystemExit("NEED: HOCKEYTECH_KEY_%s in the environment (the league's public feed key; John supplies it)" % client.upper())
    url = feed_url(client, season_id, key)
    f = fetcher or C.Fetcher(SOURCE, purpose)
    status, body = f.get(url, {"Accept": "application/json"})
    day = C.today()
    return C.save_raw(raw_dir, SOURCE, day, "schedule-%s-%s.json" % (client.lower(), season_id), body, url), day


def main(argv):
    if not argv or argv[0] not in ("fetch", "parse"):
        print(__doc__)
        return 2
    opt = lambda name, default=None: argv[argv.index(name) + 1] if name in argv else default
    if argv[0] == "fetch":
        path, day = fetch(argv[1], argv[2], opt("--raw-dir", "~/Projects/backups/spx-stats/raw/grey"), opt("--purpose", "manual"))
        print("saved", path)
        return 0
    client = opt("--client", "")
    if client.lower() not in CLIENTS:
        raise SystemExit("--client must be one of: " + ", ".join(CLIENTS))
    rows, bad = parse_schedule(open(os.path.expanduser(argv[1]), "rb").read(), client.lower(), opt("--fetched-on", C.today()))
    if opt("--out"):
        open(os.path.expanduser(opt("--out")), "w", encoding="utf-8").write(load_sql(rows, client.lower(), opt("--fetched-on", C.today())))
    print("%d games, %d unparsed" % (len(rows), len(bad)))
    for b in bad:
        print("unparsed:", b["reason"], b["item"])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

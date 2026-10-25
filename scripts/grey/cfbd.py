#!/usr/bin/env python3
"""CollegeFootballData.com (green, a free key; credit, no bulk redistribution): the games of a college football season into legacy_cfbd.game.

    CFBD_API_KEY=... python3 -I scripts/grey/cfbd.py fetch 2025 [--type regular|postseason] [--raw-dir DIR]   one request, the raw answer saved first
    python3 -I scripts/grey/cfbd.py parse <raw file> --year 2025 --fetched-on 2026-10-25 [--out load.sql]     the rows as a rerunnable load file
    python3 -I scripts/grey/test_grey.py                                                                      the parsers and the fetcher gate on saved samples

The key is read from the environment only (never printed or saved; the saved URL has its query cut). Written against samples: no real answer has been
seen yet because the key is John's to create, so the first real run is watched. The answer's field names are read in both spellings (game_id / id,
home_team / homeTeam, season_type / seasonType) because the API has used both.
Terms (the source's registry row): a free key, credit "College football data from CollegeFootballData.com", no bulk redistribution of the data.
Raw first: scripts/archive_raw.py cfbd <raw dir>/cfbd/<day> <day> --sql-out ..., applied by the coordinating session; the load file is for ds1-apply.sh.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as C

SOURCE = "cfbd"
API = "https://api.collegefootballdata.com/games"
COLS = ("game_id", "season", "week", "season_type", "start_date", "completed", "neutral_site", "conference_game", "attendance", "venue_id", "venue",
        "home_id", "home_team", "home_conference", "home_points", "away_id", "away_team", "away_conference", "away_points", "fetched_on", "source_key")


def pick(d, *names):
    for n in names:
        if n in d and d[n] is not None:
            return d[n]
    return None


def parse_games(body, fetched_on):
    """-> (rows, unparsed). A game without an id, a season or both teams is listed in `unparsed` (never guessed)."""
    data = json.loads(body.decode("utf-8") if isinstance(body, bytes) else body)
    rows, unparsed = [], []
    if not isinstance(data, list):
        return rows, [{"reason": "not a list", "item": str(data)[:200]}]
    for g in data:
        gid, season = C.to_int(pick(g, "id", "game_id", "gameId")), C.to_int(pick(g, "season"))
        home, away = pick(g, "home_team", "homeTeam"), pick(g, "away_team", "awayTeam")
        if gid is None or season is None or not home or not away:
            unparsed.append({"reason": "no id, season or team", "item": json.dumps(g)[:200]})
            continue
        completed = C.to_bool(pick(g, "completed"))
        rows.append(dict(
            game_id=gid, season=season, week=C.to_int(pick(g, "week")), season_type=pick(g, "season_type", "seasonType"),
            start_date=pick(g, "start_date", "startDate"), completed=completed, neutral_site=C.to_bool(pick(g, "neutral_site", "neutralSite")),
            conference_game=C.to_bool(pick(g, "conference_game", "conferenceGame")), attendance=C.to_int(pick(g, "attendance")),
            venue_id=C.to_int(pick(g, "venue_id", "venueId")), venue=pick(g, "venue"),
            home_id=C.to_int(pick(g, "home_id", "homeId")), home_team=home, home_conference=pick(g, "home_conference", "homeConference"),
            home_points=C.to_int(pick(g, "home_points", "homePoints")) if completed else None,
            away_id=C.to_int(pick(g, "away_id", "awayId")), away_team=away, away_conference=pick(g, "away_conference", "awayConference"),
            away_points=C.to_int(pick(g, "away_points", "awayPoints")) if completed else None,
            fetched_on=fetched_on, source_key="cfbd:%d" % gid))
    return rows, unparsed


def load_sql(rows, season, fetched_on):
    head = "-- legacy_cfbd.game for season %s, fetched %s (scripts/grey/cfbd.py). Rerunnable: a game replaces itself by id. DS1 only.\nbegin;\n" % (season, fetched_on)
    return head + C.inserts("legacy_cfbd.game", COLS, rows, ("game_id",)) + "commit;\n"


def fetch(year, season_type, raw_dir, fetcher=None):
    key = os.environ.get("CFBD_API_KEY")
    if not key:
        raise SystemExit("NEED: CFBD_API_KEY in the environment (a free key from collegefootballdata.com; John creates it)")
    f = fetcher or C.Fetcher(SOURCE, "manual")
    url = "%s?year=%d&seasonType=%s" % (API, year, season_type)
    status, body = f.get(url, {"Authorization": "Bearer " + key, "Accept": "application/json"})
    day = C.today()
    return C.save_raw(raw_dir, SOURCE, day, "games-%d-%s.json" % (year, season_type), body, url), day


def main(argv):
    if not argv or argv[0] not in ("fetch", "parse"):
        print(__doc__)
        return 2
    opt = lambda name, default=None: argv[argv.index(name) + 1] if name in argv else default
    if argv[0] == "fetch":
        path, day = fetch(int(argv[1]), opt("--type", "regular"), opt("--raw-dir", "~/Projects/backups/spx-stats/raw/grey"))
        print("saved", path)
        return 0
    rows, bad = parse_games(open(os.path.expanduser(argv[1]), "rb").read(), opt("--fetched-on", C.today()))
    sql = load_sql(rows, opt("--year", "?"), opt("--fetched-on", C.today()))
    if opt("--out"):
        open(os.path.expanduser(opt("--out")), "w", encoding="utf-8").write(sql)
    print("%d games, %d unparsed" % (len(rows), len(bad)))
    for b in bad:
        print("unparsed:", b["reason"], b["item"])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

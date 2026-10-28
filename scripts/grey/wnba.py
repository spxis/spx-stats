#!/usr/bin/env python3
"""stats.wnba.com (RED-CONFIRM, John 2026-10-28): a read-only reader of the league game log. It stores nothing.

    python3 -I scripts/grey/wnba.py parse <saved leaguegamelog.json>   counts games and unparsed rows, prints no value, writes nothing
    python3 -I scripts/grey/wnba.py fetch ...                          refuses: this source is confirm-only

The WNBA Terms of Use (wnba.com/terms-of-use, section 9) bar using NBA Statistics in connection with any website, product or service that features a database, the
clause that made stats.nba.com confirm-only. John moved the source from grey to red-confirm on 2026-10-28 (scripts/daily/sources.py): it may be READ, only through the
shared limiter with purpose "confirm" (scripts/daily/limiter.py), to check a result other sources gave, and NEVER stored: no raw archive, no Dropbox copy, no legacy_* load,
no core row, no copied value; the only thing kept is an outcome (agrees, disagrees, unavailable). So this file has no load SQL and no fetch. parse_gamelog reads the shape of
the NBA stats API's league game log (resultSets[].headers / rowSet, one row per team per game; from memory, checked on the first real answer) and returns the games in memory for
a confirm check. Every game appears twice (once per team): the row whose MATCHUP reads "A vs. B" is the home team's. The empty table legacy_wnba_stats.game (migration 154) stays
unused; nothing may write it.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as C

SOURCE = "wnba_stats"
URL = "https://stats.wnba.com/stats/leaguegamelog"


def parse_gamelog(body, fetched_on):
    """-> (rows, unparsed). Two team rows of one GAME_ID make a game; a game with one row, no home side or no points is listed in `unparsed`."""
    data = json.loads(body.decode("utf-8") if isinstance(body, bytes) else body)
    sets = data.get("resultSets") if isinstance(data, dict) else None
    if not isinstance(sets, list) or not sets:
        return [], [{"reason": "no resultSets", "item": str(data)[:200]}]
    rs = sets[0]
    head = rs.get("headers") or []
    need = ("SEASON_ID", "TEAM_ABBREVIATION", "TEAM_NAME", "GAME_ID", "GAME_DATE", "MATCHUP", "PTS")
    if any(h not in head for h in need):
        return [], [{"reason": "missing columns: " + ",".join(h for h in need if h not in head), "item": ""}]
    ix = {h: head.index(h) for h in need}
    games = {}
    for r in rs.get("rowSet") or []:
        games.setdefault(r[ix["GAME_ID"]], []).append(r)
    rows, unparsed = [], []
    for gid, two in sorted(games.items()):
        home = [r for r in two if " vs. " in str(r[ix["MATCHUP"]])]
        away = [r for r in two if " @ " in str(r[ix["MATCHUP"]])]
        if len(home) != 1 or len(away) != 1:
            unparsed.append({"reason": "not one home row and one away row", "item": "%s: %d rows" % (gid, len(two))})
            continue
        h, a = home[0], away[0]
        hp, ap = C.to_int(h[ix["PTS"]]), C.to_int(a[ix["PTS"]])
        if hp is None or ap is None:
            unparsed.append({"reason": "no points", "item": gid})
            continue
        rows.append(dict(game_id=str(gid), season_id=str(h[ix["SEASON_ID"]]), game_date=str(h[ix["GAME_DATE"]])[:10],
                         home_abbr=h[ix["TEAM_ABBREVIATION"]], home_name=h[ix["TEAM_NAME"]], away_abbr=a[ix["TEAM_ABBREVIATION"]], away_name=a[ix["TEAM_NAME"]],
                         home_pts=hp, away_pts=ap, fetched_on=fetched_on, source_key="wnba_stats:%s" % gid))
    return rows, unparsed


def main(argv):
    if not argv or argv[0] not in ("fetch", "parse"):
        print(__doc__)
        return 2
    if argv[0] == "fetch":
        try:
            C.Fetcher(SOURCE, "manual").check(URL)
        except C.SRC.SourceRefused as e:
            raise SystemExit(str(e))
        raise SystemExit("stats.wnba.com is confirm-only: it is read only by a confirm check through scripts/daily/limiter.py, never stored")
    rows, bad = parse_gamelog(open(os.path.expanduser(argv[1]), "rb").read(), C.today())
    print("%d games, %d unparsed" % (len(rows), len(bad)))
    for b in bad:
        print("unparsed:", b["reason"], b["item"])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

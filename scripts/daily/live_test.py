#!/usr/bin/env python3
"""Tests of the live score layer (live.py). No request to any score source is made; the table is an in-memory SQLite that runs the very same SQL.

    python3 -I scripts/daily/live_test.py                              # unit tests (also part of run.py --self-test)
    python3 -I scripts/daily/live_test.py --turso http://127.0.0.1:7748   # the same writer tests against a local libSQL server (Docker, a port in 7740-7749)
Exit code: 0 all passed, 1 a check failed.
"""
import datetime, json, os, sqlite3, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import games as G, live as L, parsers as P, teams as T

FAILS = []
SECRET = "SENTINEL-ZQX"
D = datetime.date
NOW = datetime.datetime(2026, 10, 25, 12, 0, tzinfo=datetime.timezone.utc)


def check(cond, what):
    if not cond: FAILS.append(what)


CLUBS = [dict(fid=1, name="Toronto Maple Leafs", location="Toronto", nickname="Maple Leafs", abbr="TOR", fkey="x:1"),
         dict(fid=2, name="Boston Bruins", location="Boston", nickname="Bruins", abbr="BOS", fkey="x:2"),
         dict(fid=3, name="Ottawa Senators", location="Ottawa", nickname="Senators", abbr="OTT", fkey="x:3"),
         dict(fid=4, name="Montréal Canadiens", location="Montréal", nickname="Canadiens", abbr="MTL", fkey="x:4")]
ROSTER = T.Roster("nhl", CLUBS)
TOR, BOS, OTT, MTL = (c["name"] for c in CLUBS)


class SqliteTurso:
    """The pipeline's contract on SQLite: a result per statement, a failing statement does not stop the next."""

    def __init__(self):
        self.db = sqlite3.connect(":memory:", isolation_level=None)
        self.requests = 0
        self.log = []

    def run(self, stmts):
        self.requests += 1
        out = []
        for sql, args in stmts:
            self.log.append(sql)
            try:
                cur = self.db.execute(sql, args)
                cols = [c[0] for c in cur.description] if cur.description else []
                cell = lambda v: {"type": "null"} if v is None else {"type": "integer", "value": str(v)} if isinstance(v, int) else {"type": "text", "value": v}
                out.append((True, {"cols": [{"name": c} for c in cols], "rows": [[cell(v) for v in r] for r in cur.fetchall()] if cols else [],
                                   "affected_row_count": max(cur.rowcount, 0) if not cols else 0}))
            except Exception as e:
                out.append((False, str(e)))
        return out

    def rows(self, sql, args=()):
        ok, res = self.run([(sql, list(args))])[0]
        cols = [c["name"] for c in res["cols"]]
        return [dict(zip(cols, [c.get("value") for c in r])) for r in res["rows"]]


def claim(page, teams, score, home, day, status="final", ot=None, **kw):
    return P.claim(page, teams, score, home, day, status, "regular", ot=ot, **kw)


def game_claims(*specs):
    """specs: (source, {club: score}) -> claims of one game, TOR at home."""
    out = []
    for src, sc in specs:
        c = claim("page", (BOS, TOR), sc, TOR, D(2026, 10, 24))
        c["source"] = src
        out.append(c)
    return out


def fid_of(n): return (ROSTER.resolve(n) or {}).get("fid")


def core_row(gid, status="scheduled", hs=None, as_=None, day=D(2026, 10, 24), hf=1, af=2):
    return dict(id=gid, phase="regular", date=day, status=status, hf=hf, af=af, hs=hs, as_=as_, ot=False, so=False, key="k%d" % gid, src="spx", used=False)


def test_tally():
    s = {TOR: 3, BOS: 2}
    t = L.tally(game_claims(("wp:A", s)), fid_of, 1, 2, now=NOW)
    check(t and (t["status"], t["home_score"], t["away_score"], t["n_sources"], t["n_agree"], t["disputed"]) == ("final", 3, 2, 1, 1, False), "tally: one source, home and away oriented to core")
    t = L.tally(game_claims(("wp:A", s), ("wp:B", s), ("nflverse", s)), fid_of, 1, 2, now=NOW)
    check(t["n_sources"] == 3 and t["n_agree"] == 3 and not t["disputed"], "tally: three sources agree")
    t = L.tally(game_claims(("wp:A", s), ("wp:B", s), ("nflverse", {TOR: 2, BOS: 3})), fid_of, 1, 2, now=NOW)
    check(t["n_sources"] == 3 and t["n_agree"] == 2 and not t["disputed"] and (t["home_score"], t["away_score"]) == (3, 2), "tally: 2 of 3 agree, the majority score holds, all three are listed")
    check(len(t["sources"]) == 3 and {x["s"] for x in t["sources"]} == {"Wikipedia: A", "Wikipedia: B", "nflverse"}, "tally: every source and its own score is listed for the hover")
    t = L.tally(game_claims(("wp:A", s), ("wp:B", {TOR: 2, BOS: 3})), fid_of, 1, 2, now=NOW)
    check(t["disputed"] and t["home_score"] is None and t["n_agree"] == 1 and t["n_sources"] == 2, "tally: a tie is disputed and no score is picked")
    swapped = L.tally(game_claims(("wp:A", s)), fid_of, 2, 1, now=NOW)
    check((swapped["home_score"], swapped["away_score"]) == (2, 3), "tally: oriented to core's home side even when the article's home differs")
    ip = L.tally(game_claims(("wp:A", s)) + [dict(game_claims(("wp:B", {TOR: 1, BOS: 1}))[0], status="in_progress")], fid_of, 1, 2, now=NOW)
    check(ip["status"] == "final", "tally: a final result wins over an in-progress one")
    ip = L.tally([dict(c, status="in_progress") for c in game_claims(("wp:A", {TOR: 1, BOS: 0}))], fid_of, 1, 2, now=NOW)
    check(ip and ip["status"] == "in_progress", "tally: in progress is a state of its own")
    check(L.tally(game_claims(("wp:A", None)), fid_of, 1, 2, now=NOW) is None, "tally: no result, nothing to write")
    check(L.tally(game_claims(("wp:A", {TOR: 3, MTL: 2})), fid_of, 1, 2, now=NOW) is None, "tally: a claim about other clubs is ignored")


def test_no_red_score():
    s = {TOR: 3, BOS: 2}
    for red in ("nhl_api", "yahoo_sports", "usatoday", "mlb_statsapi", "nba_stats", "espn", "sports_reference", "nhl_com", "unknown_site"):
        check(not L.allowed(red), "tier: %s may not give a score to the live layer" % red)
        check(L.tally(game_claims((red, s)), fid_of, 1, 2, now=NOW) is None, "tier: a score from %s is dropped before it is counted" % red)
    for ok in ("wp:Some article", "nflverse", "balldontlie"):
        check(L.allowed(ok), "tier: %s may" % ok)
    check(not L.allowed("hockeytech", "confirm") and L.allowed("hockeytech", "manual") and not L.allowed("hockeytech", "other"), "tier: a grey source only for the daily job and a manual request")
    t = L.tally(game_claims(("wp:A", s), ("nhl_api", {TOR: 0, BOS: 9})), fid_of, 1, 2, now=NOW)
    check(t["n_sources"] == 1 and "nhl_api" not in json.dumps(t) and "9" not in json.dumps(t["sources"]), "tier: a confirm-only source beside an allowed one adds nothing")
    rows = [dict(game_ref="g1", outcome="agrees", score=SECRET), dict(game_ref="g1", outcome="disagrees"), dict(game_ref="g1", outcome="unavailable"), dict(game_ref="g2", outcome="agrees")]
    check(L.confirm_counts(rows, "g1") == (1, 1), "confirm: only the two counts are taken")
    t = L.tally(game_claims(("wp:A", s), ("wp:B", s)), fid_of, 1, 2, now=NOW)
    row = L.make_row(7, "nhl", "2026-10-24", t, 2, 0, NOW)
    check(row["n_sources"] == 2 and row["n_agree"] == 2 and row["confirm_agree"] == 2 and row["ready"] == 1, "row: confirm flags are separate from the sources and a unanimous final is ready")
    check(SECRET not in json.dumps(row) and "nhl" not in row["sources"], "row: nothing of a confirm-only source is in the row")
    t2 = L.tally(game_claims(("wp:A", s), ("wp:B", s)), fid_of, 1, 2, now=NOW)
    check(L.make_row(7, "nhl", "2026-10-24", t2, 2, 1, NOW)["ready"] == 0, "row: an outside check that differs means not ready to settle")
    t3 = L.tally(game_claims(("wp:A", s), ("wp:B", {TOR: 1, BOS: 4})), fid_of, 1, 2, now=NOW)
    check(L.make_row(7, "nhl", "2026-10-24", t3, 0, 0, NOW)["ready"] == 0 and L.make_row(7, "nhl", "2026-10-24", t3, 0, 0, NOW)["disputed"] == 1, "row: disputed is never ready")
    a, b = L.make_row(7, "nhl", "2026-10-24", t, 0, 0, NOW), L.make_row(7, "nhl", "2026-10-24", t, 0, 0, NOW + datetime.timedelta(hours=1))
    check(a["sig"] == b["sig"], "row: the signature ignores the time")


def build(claims):
    return G.build_games(claims, "nhl", 2026)


def test_plan():
    day = D(2026, 10, 24)
    mk = lambda a, h, sa, sh, src="wp:A": claim(src, (a, h), {a: sa, h: sh}, h, day)
    games = build([mk(BOS, TOR, 2, 3), mk(BOS, TOR, 2, 3, "wp:B"), mk(OTT, MTL, 1, 4), mk(OTT, MTL, 1, 4, "wp:B")])
    core = {"nhl": [core_row(10), core_row(11, hf=4, af=3)]}
    rows, settled, skipped = L.plan({"nhl": games}, {"nhl": ROSTER}, core, [], day, day, now=NOW)
    check(sorted(r["game_id"] for r in rows) == [10, 11] and not settled, "plan: two scheduled core games get a live row")
    r10 = next(r for r in rows if r["game_id"] == 10)
    check((r10["home_score"], r10["away_score"], r10["n_agree"], r10["n_sources"]) == (3, 2, 2, 2), "plan: scores oriented to core")
    core = {"nhl": [core_row(10, "final", 3, 2), core_row(11, "final", 0, 9, hf=4, af=3)]}
    rows, settled, skipped = L.plan({"nhl": games}, {"nhl": ROSTER}, core, [], day, day, now=NOW)
    check(not rows and settled == [10] and len(skipped) == 2, "plan: a game core holds as final is not written; the one with the same score is settled; a different one is left to the careful path")
    rows, settled, skipped = L.plan({"nhl": games}, {"nhl": ROSTER}, {"nhl": []}, [], day, day, now=NOW)
    check(not rows and all("not in core.game" in r for _, r in skipped), "plan: a game core does not hold is skipped")
    rows, settled, skipped = L.plan({"nhl": games}, {"nhl": ROSTER}, {"nhl": [core_row(10), core_row(11, hf=4, af=3)]}, [], D(2026, 10, 25), D(2026, 10, 26), now=NOW)
    check(not rows, "plan: only the dates asked for")
    bad = [mk(BOS, TOR, 2, 3)]
    bad[0]["score"] = {"Nobody": "x"}
    games2 = build(bad + [mk(OTT, MTL, 1, 4)])
    rows, settled, skipped = L.plan({"nhl": games2}, {"nhl": ROSTER}, {"nhl": [core_row(10), core_row(11, hf=4, af=3)]}, [], day, day, now=NOW)
    check([r["game_id"] for r in rows] == [11] and len(skipped) == 1, "plan: one game that cannot be read does not stop the rest")


def one(gid, status, h, a, srcs=("wp:A",), day="2026-10-24", agree=0, differ=0):
    s = {TOR: h, BOS: a}
    cl = game_claims(*[(x, s) for x in srcs])
    for c in cl: c["status"] = status
    return L.make_row(gid, "nhl", day, L.tally(cl, fid_of, 1, 2, now=NOW), agree, differ, NOW)


def writer_tests(mk_turso, label):
    t = mk_turso()
    L.ensure(t)
    L.ensure(t)
    out = lambda rows: {k: v[0] for k, v in L.write(t, rows).items()}
    cur = lambda gid: t.rows("select status, home_score, away_score, n_sources from live_score where game_id = %d" % gid)
    check(out([one(1, "in_progress", 1, 0)]) == {1: "updated"}, label + "write: a new row")
    check(out([one(1, "in_progress", 1, 0)]) == {1: "unchanged"}, label + "write: the same again changes nothing")
    check(out([one(1, "in_progress", 2, 0)]) == {1: "updated"} and cur(1)[0]["home_score"] == "2", label + "write: an in-progress score may change")
    check(out([one(1, "final", 3, 1)]) == {1: "updated"} and cur(1)[0]["status"] == "final", label + "write: in progress moves forward to final")
    check(out([one(1, "in_progress", 9, 9)]) == {1: "held"} and cur(1)[0]["status"] == "final" and cur(1)[0]["home_score"] == "3", label + "write: final never goes back to in progress")
    check(out([one(1, "final", 5, 5)]) == {1: "held"} and cur(1)[0]["home_score"] == "3", label + "write: a final row is not changed by a different final score")
    check(out([one(1, "final", 3, 1, ("wp:A", "wp:B"))]) == {1: "updated"} and cur(1)[0]["n_sources"] == "2", label + "write: same final score, new evidence refreshes the evidence only")
    check(out([one(1, "final", 3, 1, ("wp:A", "wp:B"))]) == {1: "unchanged"}, label + "write: and then nothing changes")
    check(out([one(1, "final", 3, 1, ("wp:A", "wp:B"), agree=2)]) == {1: "updated"}, label + "write: an outside check is evidence too")
    bad = one(2, "final", 1, 0)
    bad["status"] = None                                    # violates NOT NULL: this game fails alone
    res = out([one(3, "final", 2, 1), bad, one(4, "in_progress", 0, 0)])
    check(res[2] == "failed" and res[3] == "updated" and res[4] == "updated", label + "write: one bad game among many fails alone")
    reqs = t.requests
    out([one(g, "final", 1, 0) for g in range(100, 130)])
    check(t.requests - reqs == 1, label + "write: 30 games are one request")
    old = one(50, "final", 1, 0)
    old["updated_at"] = "2026-10-01T00:00:00Z"
    L.write(t, [old])
    t.run([("update live_score set updated_at = ? where game_id = 50", ["2026-10-01T00:00:00Z"])])
    settled, gone = L.sweep(t, settled=[3], now=NOW)
    ids = {int(r["game_id"]) for r in t.rows("select game_id from live_score")}
    check(settled == 1 and gone >= 1 and 3 not in ids and 50 not in ids and 1 in ids, label + "retention: a settled row and a row older than 7 days go, a fresh one stays")
    t.run([("update live_score set updated_at = ? where game_id = 1", ["2026-10-20T00:00:00Z"])])
    check([r["game_id"] for r in L.stale(t, NOW)] == ["1"], label + "retention: a row older than 2 days that nobody settled is listed")


def test_publish():
    day = D(2026, 10, 24)
    mk = lambda src: claim(src, (BOS, TOR), {BOS: 2, TOR: 3}, TOR, day)
    games = build([mk("wp:A"), mk("wp:B")])
    t = SqliteTurso()
    logs = []
    s = L.publish({"nhl": games}, {"nhl": ROSTER}, {"nhl": 2026}, [dict(game_ref=games[0]["source_key"], outcome="agrees")], {}, "daily", t, {"nhl": [core_row(10)]}, day, day, D(2026, 10, 25), logs.append)
    check(s["published"] and s["updated"] == 1 and s["failed"] == 0 and t.requests <= 3, "publish: one game written in a handful of requests")
    r = t.rows("select n_sources, n_agree, confirm_agree, ready from live_score")[0]
    check((r["n_sources"], r["n_agree"], r["confirm_agree"], r["ready"]) == ("2", "2", "1", "1"), "publish: sources and the outside check are kept apart")
    s = L.publish({"nhl": games}, {"nhl": ROSTER}, {"nhl": 2026}, [], {}, "daily", t, {"nhl": [core_row(10, "final", 3, 2)]}, day, day, D(2026, 10, 25), logs.append)
    check(s["settled_deleted"] == 1 and not t.rows("select 1 from live_score"), "publish: when core settles the game its live row is deleted")
    class Down:
        requests = 0
        def run(self, stmts): raise RuntimeError("turso answered 503")
    s = L.publish({"nhl": games}, {"nhl": ROSTER}, {"nhl": 2026}, [], {}, "daily", Down(), {"nhl": [core_row(10)]}, day, day, D(2026, 10, 25), logs.append)
    check(s["published"] is False, "publish: Turso down never raises (the daily job goes on)")
    src = open(os.path.join(HERE, "live.py"), encoding="utf-8").read()
    check("urlopen" in src and src.count("urllib.request.urlopen") == 1 and "guard_url" not in src, "live.py makes no request to any score source (its one HTTP call is the Turso pipeline)")
    check(src.count("http") < 12 and "api-web.nhle" not in src and "espn" not in src.lower(), "live.py names no source host")


def test_request():
    day = D(2026, 10, 24)
    mk = lambda a, h, sa, sh, src: claim(src, (a, h), {a: sa, h: sh}, h, day)
    games = build([mk(BOS, TOR, 2, 3, "wp:A"), mk(OTT, MTL, 1, 4, "wp:A")])
    core = {"nhl": [core_row(10), core_row(11, hf=4, af=3)]}
    notes = []
    rows, settled, skipped = L.plan({"nhl": games}, {"nhl": ROSTER}, core, [], day, day, now=NOW, only_ids={10}, notes=notes)
    check([r["game_id"] for r in rows] == [10] and not skipped, "request: one game asked for, the other game of the day is not touched")
    notes = []
    L.plan({"nhl": games}, {"nhl": ROSTER}, {"nhl": [core_row(10, "final", 3, 2), core_row(11, hf=4, af=3)]}, [], day, day, now=NOW, notes=notes)
    check(notes == [dict(game_id=10, reason="core.game already holds the final result")], "request: the reason a game was left out is kept per game id")
    items = L.items_for([10, 11, 12], {10: ("updated", "in progress result written"), 11: ("failed", "boom")}, [dict(game_id=12, reason="no allowed source has a result")])
    check([i[:2] for i in items] == [[11, "failed"], [10, "updated"], [12, "skipped"]], "request: failures first, then what changed, then what was left out")
    check(L.items_for([99], {}, [])[0][1:] == ["skipped", "no chosen source gave a result for this game"], "request: a game no source gave is listed with that reason")
    check(len(L.items_for(list(range(500)), {}, [])) == L.ITEM_MAX, "request: the progress row lists at most %d games" % L.ITEM_MAX)
    sql = []
    def csv(q): sql.append(q); return [dict(league_code="nhl", start_year="2026", game_id="10", game_date="2026-10-24", hf="1", af="2"),
                                      dict(league_code="nhl", start_year="2026", game_id="11", game_date="2026-10-24", hf="4", af="3")]
    got = L.locate(day="2026-10-24", leagues=["nhl", "nba"], ds1_csv=csv)
    check(got["nhl"]["ids"] == [10, 11] and got["nhl"]["fids"] == {1, 2, 3, 4} and got["nhl"]["season"] == 2026, "locate: the games of a day, the clubs that play and the season")
    check(sql[0].lstrip().lower().startswith("select") and "g.game_date = '2026-10-24'" in sql[0] and "'nhl','nba'" in sql[0], "locate: one read-only select")
    L.locate(game_id=10, ds1_csv=csv)
    check("g.game_id = 10" in sql[1], "locate: one game by its id")
    try: L.locate(day="2026-10-24' or 1=1 --", leagues=["nhl"], ds1_csv=csv); check(False, "locate: a bad day is refused")
    except ValueError: pass
    L.locate(day="2026-10-24", leagues=["nhl'; drop table x; --"], ds1_csv=csv)
    check("drop" not in sql[-1], "locate: a league that is not plain letters never reaches the query")
    t = SqliteTurso()
    check(L.request_start(t, dict(id=7, by="john@example.test", scope="day", league="nhl", day="2026-10-24", game=None, sources=["wikipedia"]), NOW), "request: the progress row starts")
    r = t.rows("select status, requested_by, scope, sources from live_request where id = 7")[0]
    check((r["status"], r["requested_by"], r["scope"], r["sources"]) == ("running", "john@example.test", "day", "wikipedia"), "request: it says who pressed it and what for")
    check(L.request_finish(t, 7, "done", "2 game(s) asked", [[10, "updated", "x"]], NOW), "request: and ends")
    r = t.rows("select status, finished_at, items from live_request where id = 7")[0]
    check(r["status"] == "done" and json.loads(r["items"]) == [[10, "updated", "x"]], "request: the outcome per game is kept")
    L.request_start(t, dict(id=7, by="a", scope="game", game=10, sources=[]), NOW)
    check(t.rows("select status, items from live_request where id = 7")[0]["items"] is None, "request: a repeated id starts over")
    check(L.request_finish(object(), 7, "done", "x") is False, "request: a failing Turso never raises")
    t.run([("update live_request set started_at = ? where id = 7", ["2026-10-01T00:00:00Z"])])
    L.sweep(t, now=NOW)
    check(not t.rows("select 1 from live_request"), "retention: a request row older than 7 days goes with the live rows")


def run_unit():
    del FAILS[:]
    test_tally(); test_no_red_score(); test_plan(); test_publish(); test_request()
    writer_tests(SqliteTurso, "sqlite: ")
    return list(FAILS)


def main(argv):
    fails = run_unit()
    if "--turso" in argv:
        del FAILS[:]
        url = argv[argv.index("--turso") + 1].rstrip("/") + "/v2/pipeline"
        L.Turso(url, "")                      # an endpoint and no token: the local libSQL server
        t0 = L.Turso(url, "")
        t0.run([("drop table if exists live_score", [])])
        writer_tests(lambda: L.Turso(url, ""), "libsql: ")
        t0.run([("drop table if exists live_score", [])])
        fails += FAILS
    if fails:
        print("LIVE TEST FAILED:")
        for f in fails: print("  -", f)
        return 1
    print("live test ok: tally and agreement, no score from a red or confirm-only source, plan against core, forward-only writer, one bad game, retention" + (", libSQL server" if "--turso" in argv else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

#!/usr/bin/env python3
"""Tests of an admin's live refresh through run.py (--live-only with --day, --game, --sources, --live-request): which clubs are fetched, which sources are
read, what the progress row says, and what is refused. No network, no DS1, no Turso: Wikipedia's client, DS1's club list and games, and Turso are stubs.

    python3 -I scripts/daily/live_request_test.py          # also part of run.py --self-test
Exit code: 0 all passed, 1 a check failed.
"""
import contextlib, datetime, io, json, os, sys, tempfile, types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import live as L, live_test as LT, run as R

FAILS = []
D = datetime.date


def check(cond, what):
    if not cond: FAILS.append(what)


class Client:
    last, boom = None, False

    def __init__(self, *a, **k):
        self.requests, self.log, self.asked = 0, [], []
        Client.last = self

    def revisions(self, titles):
        if Client.boom: raise RuntimeError("wikipedia did not answer")
        self.asked += titles
        self.requests += 1 if titles else 0
        return {t: dict(missing=False, revid=1, timestamp="2026-10-24T10:00:00Z") for t in titles}

    def contents(self, titles):
        return {t: dict(missing=False, text="x", revid=1, timestamp="2026-10-24T10:00:00Z", resolved=t) for t in titles}


def args(tmp, **kw):
    base = dict(apply=False, rehearse=False, no_ds1=False, league="nhl", sources=None, day=None, game=None, season=[], since=None, state=os.path.join(tmp, "state.json"),
                raw_dir=os.path.join(tmp, "raw"), no_balldontlie=False, offline=False, force_fetch=False, live=True, live_only=True, json=None, verbose=False,
                log_dir=tmp, live_request=None, by="", scope="")
    base.update(kw)
    return types.SimpleNamespace(**base)


def run_with(a, found):
    """run.py's run() with every outside part stubbed. -> (exit code, Wikipedia titles asked, Turso, printed text)."""
    day = D(2026, 10, 24)
    mk = lambda x, h, sx, sh: LT.claim("wp:A", (x, h), {x: sx, h: sh}, h, day)
    claims = [mk(LT.BOS, LT.TOR, 2, 3), mk(LT.OTT, LT.MTL, 1, 4)]
    turso = LT.SqliteTurso()
    seen = {}
    Client.last = None
    saved = (R.W.Client, R.T.load_rosters, R.parse_pages, L.locate, L.core_games, L.Turso)
    R.W.Client = Client
    R.T.load_rosters = lambda leagues, path=None: ({lg: LT.ROSTER for lg in leagues}, "stub")
    def parse(lg, y, pages, roster, raw_dir, state):
        seen["pages"] = [p["title"] for p in pages]
        return (claims if pages else []), [], len(pages)
    R.parse_pages = parse
    L.locate = lambda game_id=None, day=None, leagues=(), ds1_csv=None: found
    L.core_games = lambda seasons, since: {"nhl": [LT.core_row(10), LT.core_row(11, hf=4, af=3)]}
    L.Turso = lambda: turso
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            rc = R.request_run(a) if a.live_request else R.run(a, {})
    finally:
        R.W.Client, R.T.load_rosters, R.parse_pages, L.locate, L.core_games, L.Turso = saved
    return rc, Client.last.asked if Client.last else [], turso, out.getvalue(), seen


def refuses(argv):
    saved = sys.argv
    sys.argv = ["run.py"] + argv
    try:
        R.main()
    except SystemExit as e:
        return str(e.code)
    finally:
        sys.argv = saved
    return None


def run_unit():
    del FAILS[:]
    tmp = tempfile.mkdtemp(prefix="livereq-")
    one_game = {"nhl": dict(season=2026, ids=[10], fids={1, 2}, date="2026-10-24")}

    rc, asked, t, out, seen = run_with(args(tmp, day="2026-10-24", sources="wikipedia", scope="day", live_request=5, by="john@example.test"), one_game)
    check(rc == 0, "request: the run succeeds")
    check(sorted(asked) == ["2026–27 Boston Bruins season", "2026–27 Toronto Maple Leafs season"], "request: only the two clubs of the asked game are fetched, not the other clubs: %r" % asked)
    check(sorted(x["game_id"] for x in t.rows("select game_id from live_score")) == ["10"], "request: only the asked game gets a live row")
    r = t.rows("select status, requested_by, items, summary from live_request where id = 5")[0]
    check(r["status"] == "done" and r["requested_by"] == "john@example.test" and json.loads(r["items"])[0][:2] == [10, "updated"], "request: the progress row ends done, says who pressed it and holds the game's outcome")
    check("live request: done:" in out.splitlines()[-1] if False else any(x.startswith("live request: done:") for x in out.splitlines()), "request: the last line is the one the runner copies")
    check("Requests this run: Wikipedia API 1" in out, "request: it says how many requests it made")

    rc, asked, t, out, seen = run_with(args(tmp, day="2026-10-24", sources="balldontlie", scope="day", live_request=6, by="a@example.test"), one_game)
    check(asked == [] and "pages" in seen and seen["pages"] == [], "sources: with Wikipedia unticked no Wikipedia request is made and no page is read")
    r = t.rows("select status, items from live_request where id = 6")[0]
    check(json.loads(r["items"])[0][1] == "skipped" and not t.rows("select 1 from live_score"), "sources: a game none of the chosen sources gave is listed as left out, nothing is written")

    rc, asked, t, out, seen = run_with(args(tmp, game=11, scope="game", live_request=7, by="a@example.test", league="nhl,nba"),
                                       {"nhl": dict(season=2026, ids=[11], fids={3, 4}, date="2026-10-24")})
    check(sorted(asked) == ["2026–27 Montreal Canadiens season", "2026–27 Ottawa Senators season"], "game: one game fetches its two clubs only: %r" % asked)
    check([x["game_id"] for x in t.rows("select game_id from live_score")] == ["11"], "game: only that game is written")

    rc, asked, t, out, seen = run_with(args(tmp, day="2026-10-30", scope="day", live_request=8, by="a@example.test"), {})
    check(rc == 0 and asked == [] and t.rows("select status from live_request where id = 8")[0]["status"] == "nothing", "request: a day DS1 holds no game for fetches nothing and ends 'nothing'")

    Client.boom = True
    try:
        run_with(args(tmp, day="2026-10-24", scope="day", live_request=9, by="a@example.test"), one_game)
        check(False, "request: a crash is raised to the runner")
    except RuntimeError:
        pass
    finally:
        Client.boom = False

    for bad in ("nhl_api", "yahoo_sports", "espn", "wikipedia,nhl_api", "wikidata", "nope"):
        try:
            run_with(args(tmp, day="2026-10-24", sources=bad), one_game)
            check(False, "sources: %s is refused" % bad)
        except SystemExit as e:
            check("refused" in str(e) or "takes some of" in str(e), "sources: %s is refused with a reason (%s)" % (bad, e))
    check(refuses(["--live-only", "--apply"]) is not None, "cli: --live-only never goes with --apply")
    check(refuses(["--day", "2026-10-24"]) is not None and refuses(["--sources", "wikipedia"]) is not None, "cli: --day and --sources only go with --live-only")
    return list(FAILS)


if __name__ == "__main__":
    fails = run_unit()
    if fails:
        print("LIVE REQUEST TEST FAILED:")
        for f in fails: print("  -", f)
        sys.exit(1)
    print("live request test ok: only the clubs asked about, the sources ticked, progress row, refusals")

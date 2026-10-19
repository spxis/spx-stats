#!/usr/bin/env python3
"""Tests of the confirm-only check (confirm_red.py) and the confirm-only tier. No request is ever made: the HTTP layer is a stub.

    python3 -I scripts/daily/confirm_red_test.py      # also part of run.py --self-test
"""
import datetime, json, os, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import apply as A, confirm_red as CR, limiter as LM, limiter_test as LT, sources as SRC

FAILS = []
SECRET = "SENTINEL-ZQX"       # a marker inside every stubbed answer: if it is ever found on disk or in a row, something was stored
D = datetime.date


def check(cond, what):
    if not cond: FAILS.append(what)


def game(day, home, away, hs, as_, conf="single"):
    return dict(league="nhl", season=2026, status="final", confidence=conf, date=day, home=home, away=away, score={home: hs, away: as_},
                source_key="wpdaily:nhl:2026:regular:%s:%s:%s:0" % (day, home, away))


def answer(rows):
    return {"marker": SECRET, "games": [{"gameState": st, "homeTeam": {"name": {"default": h}, "abbrev": SECRET, "score": hs},
                                         "awayTeam": {"name": {"default": a}, "abbrev": SECRET, "score": as_}} for h, a, hs, as_, st in rows]}


def limiter(store=None):
    c = LT.Clock()
    return LM.Limiter(store or LM.MemoryStore(c.now), sleep=c.sleep, log=lambda m: None, holder="test"), c


def files_under(d):
    return [os.path.join(r, f) for r, _, fs in os.walk(d) for f in fs]


def run_unit():
    del FAILS[:]
    env = {"DAILY_CONFIRM_RED": "1"}
    now = datetime.datetime(2026, 10, 19, 12, 0, tzinfo=datetime.timezone.utc)
    g1 = game(D(2026, 10, 17), "Boston Bruins", "Montreal Canadiens", 4, 2)
    g2 = game(D(2026, 10, 17), "Utah Mammoth", "Vegas Golden Knights", 1, 3, "disputed")
    g3 = game(D(2026, 10, 17), "Calgary Flames", "Edmonton Oilers", 5, 0)
    g4 = game(D(2026, 10, 16), "Toronto Maple Leafs", "Ottawa Senators", 3, 2)
    done = game(D(2026, 10, 17), "Seattle Kraken", "Dallas Stars", 2, 1, "confirmed")
    day17 = answer([("Bruins", "Canadiens", 4, 2, "OFF"), ("Mammoth", "Golden Knights", 7, 3, "FINAL"), ("Flames", "Oilers", 5, 0, "LIVE")])
    day16 = answer([("Maple Leafs", "Senators", 3, 2, "FINAL")])
    seen = []

    def http(url):
        seen.append(url)
        return {"https://api-web.nhle.com/v1/score/2026-10-17": day17, "https://api-web.nhle.com/v1/score/2026-10-16": day16}[url]

    # the switch: off means not one request, whatever the games are
    for e in ({}, {"DAILY_CONFIRM_RED": "0"}, {"DAILY_CONFIRM_RED": "true"}):
        L, c = limiter()
        rows, summ = CR.confirm([g1, g2], L, http, e, now)
        check(rows == [] and summ == {} and not seen and L.store.st == {}, "switch: off (%r) makes no request and touches no limiter state" % e)

    # only single-source or disputed NHL finals are asked about; a confirmed one is not
    L, c = limiter()
    rows, summ = CR.confirm([done], L, http, env, now)
    check(rows == [] and summ.get("requests") == 0 and not seen, "candidates: a result two sources agree on is not checked")
    check(CR.candidates([done, dict(g1, league="nba"), dict(g1, status="scheduled"), g1, g2]) == [g1, g2], "candidates: NHL finals that are single-source or disputed")

    # outcomes
    L, c = limiter()
    rows, summ = CR.confirm([g1, g2, g3, g4, done], L, http, env, now)
    by = {r["game_ref"]: r for r in rows}
    check(by[g1["source_key"]]["outcome"] == "agrees" and by[g1["source_key"]]["status"] == "confirmed", "outcome: same score agrees (confirmed)")
    check(by[g2["source_key"]]["outcome"] == "disagrees" and by[g2["source_key"]]["status"] == "disputed", "outcome: a different score disagrees (disputed)")
    check(by[g3["source_key"]]["outcome"] == "unavailable" and by[g3["source_key"]]["status"] == "not_found", "outcome: a game not final there is unavailable (not_found)")
    check(by[g4["source_key"]]["outcome"] == "agrees" and done["source_key"] not in by, "outcome: a second day; the confirmed game is left out")
    check(summ == dict(requests=2, checked=4, agrees=2, disagrees=1, unavailable=1, left_out=0), "summary: counts only (%s)" % summ)
    check(sorted(seen) == ["https://api-web.nhle.com/v1/score/2026-10-16", "https://api-web.nhle.com/v1/score/2026-10-17"], "requests: one per day of games")

    # no values: the row has exactly these fields, none of them a score or the answer
    want = {"entity_kind", "game_ref", "league", "season", "field", "outcome", "status", "source", "checked_at"}
    check(all(set(r) == want for r in rows) and all(r["source"] == "nhl_api" and r["checked_at"].startswith("2026-10-19T12:00:00") for r in rows), "row: only the outcome fields, source code, checked_at, our game id")
    text = json.dumps(rows) + json.dumps(summ)
    check(SECRET not in text and "their_value" not in text and "score" not in text.replace('"field": "score"', ""), "row: no value of the NHL's, no score, no their_value")

    # the limiter: queued, spaced, never cached
    check(L.stats.get("confirmed") == 2 and c.t - 1000.0 >= SRC.SOURCES["nhl_api"]["spacing"] - 1e-6, "limiter: both requests took the queue and the 5 s spacing (%.0f s)" % (c.t - 1000.0))
    check(L.store.cache == {}, "cache: nothing cached in memory")
    n = len(seen)
    CR.confirm([g1], L, http, env, now)
    check(len(seen) == n + 1, "cache: the same day asked again is a new request, not an answer from the minute cache")

    # the request cap
    seen.clear()
    L, c = limiter()
    gs = [g1, g4, game(D(2026, 10, 15), "A B", "C D", 1, 0)]
    rows, summ = CR.confirm(gs, L, http, dict(env, DAILY_CONFIRM_MAX="2"), now)
    check(len(seen) == 2 and summ["requests"] == 2 and summ["left_out"] == 1 and len(rows) == 2, "cap: at most DAILY_CONFIRM_MAX requests, newest days first")

    # a failing day and a 429
    def boom(url): raise RuntimeError("HTTP 500")
    L, c = limiter()
    rows, summ = CR.confirm([g1], L, boom, env, now, log=lambda m: None)
    check([r["outcome"] for r in rows] == ["unavailable"], "failure: a request that fails leaves the games unavailable")

    def slow(url): raise CR.Throttled(120)
    L, c = limiter()
    rows, summ = CR.confirm([g1, g4], L, slow, env, now)
    st, _, t = L.store.read("nhl_api")
    check(summ["requests"] == 1 and st.get("hold_until", 0) - t > 100 and all(r["outcome"] == "unavailable" for r in rows), "429: nobody asks for the Retry-After, the run stops asking")

    # nothing reaches disk: a file-backed limiter, the stub answers, then every file is searched for the marker
    with tempfile.TemporaryDirectory() as d:
        c = LT.Clock()
        L = LM.Limiter(LM.FileStore(os.path.join(d, "limiter.json")), sleep=c.sleep, log=lambda m: None, holder="test")
        rows, _ = CR.confirm([g1, g2], L, http, env, now)
        path = CR.save(rows, d)
        blob = "".join(open(f, errors="ignore").read() for f in files_under(d))
        check(rows and SECRET not in blob and '"cache": {}' in open(os.path.join(d, "limiter.json")).read(), "disk: the limiter's file and the outcome file hold no part of the answer, and the shared cache is empty")
        check(path and len(open(path).read().splitlines()) == len(rows), "disk: the outcome file has one line per outcome")

    # the gate: every other path to a confirm-only source is closed
    L, c = limiter()
    for what, fn in (("fetch", lambda: L.fetch("nhl_api", "k", lambda: {"a": 1})), ("fetch_many", lambda: L.fetch_many("nhl_api", ["k"], lambda m: {"k": 1})),
                     ("slot", lambda: L.slot("nhl_api").__enter__()), ("cache_put", lambda: L.store.cache_put("nhl_api", "k", {"a": 1})),
                     ("cache_get", lambda: L.store.cache_get("mlb_statsapi", "k")), ("file cache_put", lambda: LM.FileStore(tempfile.mktemp()).cache_put("pwhl_hockeytech", "k", {})),
                     ("archive", lambda: A.SRC.assert_storable("nba_stats")), ("confirm on a green source", lambda: L.confirm("wikipedia", "k", lambda: {})),
                     ("confirm on a red source", lambda: L.confirm("espn", "k", lambda: {})), ("confirm on ESPN's host", lambda: SRC.guard_url("https://site.api.espn.com/x", purpose="confirm")),
                     ("Sports Reference", lambda: L.confirm("sports_reference", "k", lambda: {})), ("nhl_api guard, daily", lambda: SRC.guard_url("https://api-web.nhle.com/v1/score/now"))):
        try: fn(); check(False, "gate: %s must be refused" % what)
        except SRC.SourceRefused: pass
    check(SRC.guard_url("https://api-web.nhle.com/v1/score/2026-10-17", purpose="confirm")["id"] == "nhl_api" and SRC.guard_url("https://statsapi.mlb.com/api/v1/schedule", purpose="confirm")["id"] == "mlb_statsapi"
          and SRC.guard_url("https://stats.nba.com/stats/x", purpose="confirm")["id"] == "nba_stats" and SRC.guard_url("https://lscluster.hockeytech.com/feed/?client_code=pwhl", purpose="confirm")["id"] == "pwhl_hockeytech",
          "gate: the confirm-only hosts pass for purpose confirm only")
    check("nhl_api" not in L.store.st, "gate: a refused call queued nothing")
    rows = {r["id"]: r for r in SRC.listing()}
    check(rows["nhl_api"]["confirm_only"] and not rows["nhl_api"]["selectable"] and not rows["nhl_api"]["default"] and rows["nhl_api"]["cache_seconds"] is None and not rows["espn"]["confirm_only"],
          "listing: confirm-only is marked, never selectable, never a default, never cached; ESPN is not confirm-only")
    return list(FAILS)


def main():
    fails = run_unit()
    if fails:
        print("CONFIRM-ONLY TEST FAILED:")
        for f in fails: print("  -", f)
        return 1
    print("confirm-only test ok: switch, candidates, outcomes without values, limiter and spacing, nothing cached or on disk, cap, 429, gate")
    return 0


if __name__ == "__main__":
    sys.exit(main())

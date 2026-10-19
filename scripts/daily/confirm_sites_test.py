#!/usr/bin/env python3
"""Tests of the confirm-only checks of Yahoo Sports and USA TODAY (confirm_sites.py). No request is ever made: the HTTP layer is a stub that returns
the trimmed pages in fixtures/ (two or three games each).

    python3 -I scripts/daily/confirm_sites_test.py      # also part of run.py --self-test
"""
import datetime, json, os, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import confirm_red as CR, confirm_sites as CS, limiter as LM, limiter_test as LT, sources as SRC

FAILS = []
SECRET = "SENTINEL-ZQX"       # a marker inside every stubbed page: if it is ever found on disk or in a row, something was stored
D = datetime.date
FIX = os.path.join(HERE, "fixtures")


def check(cond, what):
    if not cond: FAILS.append(what)


def page(name, edit=None):
    t = open(os.path.join(FIX, name), encoding="utf-8").read()
    if edit: t = edit(t)
    return t.replace("</body>", "<!-- %s --></body>" % SECRET)


def game(league, day, home, away, hs, as_, conf="single", status="final"):
    return dict(league=league, season=2026, status=status, confidence=conf, date=day, home=home, away=away, score={home: hs, away: as_},
                source_key="wpdaily:%s:2026:regular:%s:%s:%s:0" % (league, day, home, away))


def limiter(store=None):
    c = LT.Clock()
    return CS_LM(store or LM.MemoryStore(c.now), c), c


def CS_LM(store, c):
    return LM.Limiter(store, sleep=c.sleep, log=lambda m: None, holder="test")


def files_under(d):
    return [os.path.join(r, f) for r, _, fs in os.walk(d) for f in fs]


def stub(pages, seen):
    def http(url):
        seen.append(url)
        v = pages[url]
        if isinstance(v, Exception): raise v
        return v
    return http


Y = "https://sports.yahoo.com/%s/scoreboard/?date=%s"
U = "https://sportsdata.usatoday.com/%s/scores"


def run_unit():
    del FAILS[:]
    env = {"DAILY_CONFIRM_RED": "1", "DAILY_CONFIRM_MAX": "10"}
    now = datetime.datetime(2026, 10, 19, 12, 0, tzinfo=datetime.timezone.utc)

    # ---- reading the pages (layout)
    ys = CS.parse_yahoo(page("yahoo_nhl_scoreboard.html"))
    us = CS.parse_usatoday(page("usatoday_nhl_scores.html"))
    check(len(ys) == 2 and ys[0]["date"] == "2026-10-18" and ys[0]["final"] and ys[0]["ok"] and ys[0]["teams"] == (("minnesota wild", 2), ("columbus blue jackets", 1)), "yahoo page: games, day, final, both clubs with their goals")
    check(len(us) == 2 and us[0]["date"] == "2026-10-18" and us[0]["final"] and us[0]["teams"] == (("minnesota wild", 2), ("columbus blue jackets", 1)), "usatoday page: games, local day, final, both clubs with their goals")
    check(CS.parse_usatoday(page("usatoday_mlb_scores.html"))[0]["teams"] == (("cleveland guardians", 1), ("tampa bay rays", 3)), "usatoday baseball: runs from lineScoreTotals")
    check(sorted(r["date"] for r in CS.parse_yahoo(page("yahoo_nfl_week.html"))) == ["2026-10-18", "2026-10-18", "2026-10-19"], "yahoo NFL: the week's games keyed by day are all found")
    for what, fn in (("yahoo page without data (the CFL page)", lambda: CS.parse_yahoo(page("yahoo_cfl_empty.html"))), ("yahoo garbage", lambda: CS.parse_yahoo("<html>x</html>")),
                     ("usatoday garbage", lambda: CS.parse_usatoday("<html>x</html>")),
                     ("usatoday event without teams", lambda: CS.parse_usatoday('<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"fallback":{"events":{"query":[{"id":"1"}]}}}}}</script>'))):
        try: fn(); check(False, "layout: %s must raise LayoutChanged" % what)
        except CS.LayoutChanged: pass

    # ---- the judge (pure)
    g = game("nhl", D(2026, 10, 18), "Minnesota Wild", "Columbus Blue Jackets", 2, 1)
    check(CS.judge(g, ys) == "agrees" and CS.judge(dict(g, score={"Minnesota Wild": 3, "Columbus Blue Jackets": 1}), ys) == "disagrees", "judge: same score agrees, a different one disagrees")
    swapped = [dict(ys[0], teams=(ys[0]["teams"][1], ys[0]["teams"][0]))]
    check(CS.judge(g, swapped) == "agrees" and CS.judge(dict(g, score={"Minnesota Wild": 1, "Columbus Blue Jackets": 2}), swapped) == "disagrees", "judge: the clubs are matched by name, so a site that lists home and away the other way round still compares each club's own score")
    check(CS.judge(g, [ys[0], dict(ys[0])]) == "unavailable", "judge: two games of the same clubs on one day (a doubleheader) is unavailable")
    check(CS.judge(dict(g, date=D(2026, 10, 17)), ys) == "unavailable", "judge: a game on another day is not the same game")
    check(CS.judge(g, [dict(ys[0], final=False)]) == "unavailable" and CS.judge(g, [dict(ys[0], ok=False)]) == "unavailable", "judge: not final, or not comparable, is unavailable")

    # ---- outcomes, both sites, three leagues
    nhl_a = game("nhl", D(2026, 10, 18), "Minnesota Wild", "Columbus Blue Jackets", 2, 1)
    nhl_b = game("nhl", D(2026, 10, 18), "Calgary Flames", "Carolina Hurricanes", 3, 4, "disputed")
    nhl_done = game("nhl", D(2026, 10, 18), "Seattle Kraken", "Dallas Stars", 2, 1, "confirmed")
    mlb_17 = game("mlb", D(2026, 10, 17), "Cleveland Guardians", "Tampa Bay Rays", 3, 7)
    mlb_16 = game("mlb", D(2026, 10, 16), "Cleveland Guardians", "Tampa Bay Rays", 2, 1)
    nfl_a = game("nfl", D(2026, 10, 18), "Green Bay Packers", "Dallas Cowboys", 23, 13)
    nfl_b = game("nfl", D(2026, 10, 18), "Las Vegas Raiders", "Buffalo Bills", 30, 31, "disputed")
    nfl_15 = game("nfl", D(2026, 10, 15), "Denver Broncos", "Seattle Seahawks", 17, 14)
    nba = game("nba", D(2026, 10, 20), "Detroit Pistons", "Boston Celtics", 100, 99)
    cfl = game("cfl", D(2026, 10, 17), "Toronto Argonauts", "Ottawa Redblacks", 20, 10)
    allg = {"nhl": [nhl_a, nhl_b, nhl_done], "mlb": [mlb_17, mlb_16], "nfl": [nfl_a, nfl_b, nfl_15], "nba": [nba], "cfl": [cfl]}
    pages = {Y % ("nhl", "2026-10-18"): page("yahoo_nhl_scoreboard.html"), Y % ("mlb", "2026-10-17"): page("yahoo_mlb_scoreboard.html"), Y % ("mlb", "2026-10-16"): page("yahoo_mlb_postponed.html"),
             Y % ("nfl", "2026-10-18"): page("yahoo_nfl_week.html"), Y % ("nfl", "2026-10-15"): page("yahoo_nfl_week.html"), Y % ("nba", "2026-10-20"): page("yahoo_cfl_empty.html"),
             U % "hockey/nhl": page("usatoday_nhl_scores.html"), U % "baseball/mlb": page("usatoday_mlb_scores.html"), U % "football/nfl": page("usatoday_nfl_scores.html"),
             U % "basketball/nba": page("usatoday_nba_pregame.html")}
    seen = []
    L, c = limiter()
    rows, summ = CS.confirm(allg, L, stub(pages, seen), env, now, log=lambda m: None)
    by = {(r["source"], r["game_ref"]): r["outcome"] for r in rows}
    k = lambda src, g_: by.get((src, g_["source_key"]))
    check(k("yahoo_sports", nhl_a) == "agrees" and k("usatoday", nhl_a) == "agrees", "outcome: an NHL score both sites show agrees")
    check(k("yahoo_sports", nhl_b) == "disagrees" and k("usatoday", nhl_b) == "disagrees", "outcome: a different score disagrees on both")
    check(("yahoo_sports", nhl_done["source_key"]) not in by and ("usatoday", nhl_done["source_key"]) not in by, "outcome: a result two sources already agree on is not asked about")
    check(k("yahoo_sports", mlb_17) == "agrees", "outcome: MLB on Yahoo, by day")
    check(k("usatoday", mlb_17) == "unavailable", "outcome: USA TODAY shows another day than the game's: unavailable, not wrong")
    check(k("yahoo_sports", mlb_16) == "unavailable", "outcome: a postponed game there is unavailable")
    check(k("yahoo_sports", nfl_a) == "agrees" and k("usatoday", nfl_a) == "agrees" and k("yahoo_sports", nfl_b) == "disagrees", "outcome: NFL from the week's page")
    check(k("usatoday", nfl_15) == "agrees" and k("yahoo_sports", nfl_15) == "unavailable", "outcome: a day the page covers is judged, a day the answer does not carry is unavailable")
    check(k("yahoo_sports", nba) == "unavailable" and k("usatoday", nba) == "unavailable", "outcome: a game not final there (USA TODAY: pre-game), or a page we cannot read (Yahoo's stub has no data), is unavailable")
    check(all(r["game_ref"] != cfl["source_key"] for r in rows) and not any("/cfl/" in u for u in seen), "leagues: the CFL is on neither site, so no request and no row")
    check(not any(u.startswith("https://sportsdata.usatoday.com") and "date=" in u for u in seen), "usatoday: no date in the address (the site ignores it)")
    yurls = [u for u in seen if "yahoo" in u]
    check(sorted(u for u in yurls if "/nfl/" in u) == [Y % ("nfl", "2026-10-15"), Y % ("nfl", "2026-10-18")], "yahoo: NFL asks the 18th once (the page carries the week) and the uncovered 15th once")
    check(len([u for u in seen if "usatoday" in u]) == 4, "usatoday: one request per league, however many days of games")
    check(summ["yahoo_sports"]["requests"] == len(yurls) and summ["usatoday"]["requests"] == 4 and summ["usatoday"]["checked"] == len([r for r in rows if r["source"] == "usatoday"]), "summary: counts per source")

    # ---- no values: only the outcome fields; nothing of the pages in the rows or the summary
    want = {"entity_kind", "game_ref", "league", "season", "field", "outcome", "status", "source", "checked_at"}
    check(all(set(r) == want for r in rows) and {r["source"] for r in rows} == {"yahoo_sports", "usatoday"} and all(r["checked_at"].startswith("2026-10-19T12:00:00") for r in rows), "row: only the outcome fields, the source code, checked_at, our game id")
    text = json.dumps(rows) + json.dumps(summ)
    check(SECRET not in text and "their_value" not in text and "score" not in text.replace('"field": "score"', ""), "row: no value of theirs, no score")

    # ---- the limiter: queued, spaced, never cached
    check(L.stats.get("confirmed") == len(seen) and c.t - 1000.0 >= SRC.SOURCES["usatoday"]["spacing"] * 3 - 1e-6, "limiter: every request took the queue and the spacing (%.0f s for %d requests)" % (c.t - 1000.0, len(seen)))
    check(L.store.cache == {}, "cache: nothing cached in memory")

    # ---- the switches
    for e in ({}, {"DAILY_CONFIRM_RED": "0"}, {"DAILY_CONFIRM_RED": "true"}, {"DAILY_CONFIRM_YAHOO": "1", "DAILY_CONFIRM_USATODAY": "1"}):
        L2, _ = limiter(); s2 = []
        r2, su2 = CS.confirm(allg, L2, stub(pages, s2), e, now)
        check(r2 == [] and su2 == {} and not s2 and L2.store.st == {}, "switch: off (%r) makes no request and touches no limiter state" % e)
    s2 = []
    L2, _ = limiter()
    r2, su2 = CS.confirm(allg, L2, stub(pages, s2), dict(env, DAILY_CONFIRM_YAHOO="0"), now, log=lambda m: None)
    check(list(su2) == ["usatoday"] and s2 and all("usatoday" in u for u in s2) and {r["source"] for r in r2} == {"usatoday"}, "switch: Yahoo off alone leaves USA TODAY on")
    s2 = []
    L2, _ = limiter()
    r2, su2 = CS.confirm(allg, L2, stub(pages, s2), dict(env, DAILY_CONFIRM_USATODAY="0"), now, log=lambda m: None)
    check(list(su2) == ["yahoo_sports"] and all("yahoo" in u for u in s2), "switch: USA TODAY off alone leaves Yahoo on")

    # ---- the cap (per source and run, the variable confirm_red.py uses)
    s2 = []
    L2, _ = limiter()
    r2, su2 = CS.confirm(allg, L2, stub(pages, s2), dict(env, DAILY_CONFIRM_MAX="2"), now, log=lambda m: None)
    check(su2["yahoo_sports"]["requests"] == 2 and su2["usatoday"]["requests"] == 2 and len(s2) == 4 and su2["yahoo_sports"]["left_out"] > 0, "cap: at most DAILY_CONFIRM_MAX requests per source, the rest left out (%s)" % su2)
    s2 = []
    L2, _ = limiter()
    r2, su2 = CS.confirm(allg, L2, stub(pages, s2), dict(env, DAILY_CONFIRM_MAX="0"), now)
    check(not s2 and r2 == [], "cap: 0 means no request")

    # ---- failures: a 500, a 429, a layout we do not know, a block
    only = {"nhl": [nhl_a, game("nhl", D(2026, 10, 17), "Boston Bruins", "Montreal Canadiens", 4, 2)]}
    pg = {Y % ("nhl", "2026-10-18"): RuntimeError("HTTP 500"), Y % ("nhl", "2026-10-17"): page("yahoo_nhl_scoreboard.html"), U % "hockey/nhl": RuntimeError("HTTP 500")}
    s2 = []
    L2, _ = limiter()
    r2, su2 = CS.confirm(only, L2, stub(pg, s2), env, now, log=lambda m: None)
    check(len(r2) == 4 and {r["outcome"] for r in r2 if r["game_ref"] == nhl_a["source_key"]} == {"unavailable"}, "failure: a request that fails leaves that day's games unavailable (and the next day is still tried)")
    slow = {Y % ("nhl", "2026-10-18"): CR.Throttled(120), U % "hockey/nhl": CR.Throttled(120)}
    s2 = []
    L2, _ = limiter()
    r2, su2 = CS.confirm(only, L2, stub(slow, s2), env, now)
    st, _, t = L2.store.read("yahoo_sports")
    check(len(s2) == 2 and st.get("hold_until", 0) - t > 100 and all(r["outcome"] == "unavailable" for r in r2) and len(r2) == 2, "429: nobody asks for the Retry-After, the run stops asking that source (%d requests, %d rows)" % (len(s2), len(r2)))
    odd = {Y % ("nhl", "2026-10-18"): page("yahoo_cfl_empty.html"), Y % ("nhl", "2026-10-17"): page("yahoo_nhl_scoreboard.html"), U % "hockey/nhl": "<html>a new layout</html>"}
    s2 = []
    L2, _ = limiter()
    r2, su2 = CS.confirm(only, L2, stub(odd, s2), env, now, log=lambda m: None)
    check(all(r["outcome"] == "unavailable" for r in r2) and len(s2) == 2, "layout: a page we cannot read gives unavailable (never disagrees) and the source stops asking (%s)" % s2)

    # ---- shootouts: their score may or may not include the shootout goal, so no judgement
    so_y = {Y % ("nhl", "2026-10-18"): page("yahoo_nhl_scoreboard.html", lambda t: t.replace('\\"awayShootoutGoals\\":null', '\\"awayShootoutGoals\\":1').replace('\\"homeShootoutGoals\\":null', '\\"homeShootoutGoals\\":2')),
            U % "hockey/nhl": page("usatoday_nhl_scores.html", lambda t: t.replace('"isShootout":false', '"isShootout":true'))}
    L2, _ = limiter()
    r2, _ = CS.confirm({"nhl": [nhl_a, nhl_b]}, L2, stub(so_y, []), env, now)
    check(r2 and all(r["outcome"] == "unavailable" for r in r2), "shootout: unavailable on both sites, not disagrees")

    # ---- nothing reaches disk: a file-backed limiter, the stub pages, then every file is searched for the marker
    with tempfile.TemporaryDirectory() as d:
        c3 = LT.Clock()
        L3 = LM.Limiter(LM.FileStore(os.path.join(d, "limiter.json")), sleep=c3.sleep, log=lambda m: None, holder="test")
        r3, _ = CS.confirm({"nhl": [nhl_a, nhl_b]}, L3, stub(pages, []), env, now, log=lambda m: None)
        path = CR.save(r3, d)
        blob = "".join(open(f, errors="ignore").read() for f in files_under(d))
        check(r3 and SECRET not in blob and '"cache": {}' in open(os.path.join(d, "limiter.json")).read(), "disk: the limiter's file and the outcome file hold no part of a page, and the shared cache is empty")
        check(path and len(open(path).read().splitlines()) == len(r3) == 4, "disk: the outcome file has one line per outcome")

    # ---- combining: "N of M confirm-only sources agree"
    api = CR.row(nhl_a, "agrees", now)
    cb = CS.combine([api] + [r for r in rows if r["game_ref"] in (nhl_a["source_key"], nhl_b["source_key"])])
    a, b = cb[nhl_a["source_key"]], cb[nhl_b["source_key"]]
    check(a["text"] == "3 of 3 confirm-only sources agree" and a["early"] and a["asked"] == 3, "combine: three sources agree -> '%s'" % a["text"])
    check(b["agrees"] == 0 and b["disagrees"] == 2 and not b["early"] and b["text"].startswith("0 of 2") and "2 disagree" in b["text"], "combine: two sources disagree -> not early")
    two = CS.combine([CR.row(nhl_a, "agrees", now, "yahoo_sports"), CR.row(nhl_a, "unavailable", now, "usatoday")])[nhl_a["source_key"]]
    mixed = CS.combine([CR.row(nhl_a, "agrees", now, "yahoo_sports"), CR.row(nhl_a, "agrees", now, "usatoday"), CR.row(nhl_a, "disagrees", now, "nhl_api")])[nhl_a["source_key"]]
    check(not two["early"] and two["text"] == "1 of 2 confirm-only sources agree" and not mixed["early"], "combine: one agreeing source is not early; any disagreement blocks early confirmation")

    # ---- the gate
    L4, _ = limiter()
    for what, fn in (("fetch", lambda: L4.fetch("yahoo_sports", "k", lambda: {"a": 1})), ("fetch_many", lambda: L4.fetch_many("usatoday", ["k"], lambda m: {"k": 1})),
                     ("slot", lambda: L4.slot("usatoday").__enter__()), ("cache_put", lambda: L4.store.cache_put("yahoo_sports", "k", {"a": 1})),
                     ("archive", lambda: SRC.assert_storable("usatoday")), ("daily guard, yahoo", lambda: SRC.guard_url("https://sports.yahoo.com/nhl/scoreboard/")),
                     ("daily guard, usatoday", lambda: SRC.guard_url("https://sportsdata.usatoday.com/hockey/nhl/scores")), ("espn still refused", lambda: SRC.guard_url("https://site.api.espn.com/x", purpose="confirm")),
                     ("a stub tier-less host", lambda: SRC.guard_url("https://example.com/x", purpose="confirm"))):
        try: fn(); check(False, "gate: %s must be refused" % what)
        except SRC.SourceRefused: pass
    check(SRC.guard_url(Y % ("nhl", "2026-10-18"), purpose="confirm")["id"] == "yahoo_sports" and SRC.guard_url(U % "hockey/nhl", purpose="confirm")["id"] == "usatoday"
          and SRC.guard_url("https://www.usatoday.com/sports/nhl/scores/", purpose="confirm")["id"] == "usatoday", "gate: the two sites pass for purpose confirm only")
    row_ = {r["id"]: r for r in SRC.listing()}
    check(all(row_[s]["confirm_only"] and not row_[s]["selectable"] and not row_[s]["default"] and row_[s]["cache_seconds"] is None and row_[s]["evidence"] and "\"" in row_[s]["reason"]
              for s in ("yahoo_sports", "usatoday")) and "yahoo" not in row_, "listing: confirm-only, never selectable or default or cached, with the quoted clause and the link")
    check(set(SRC.SOURCES["yahoo_sports"]["leagues"]) == set(SRC.SOURCES["usatoday"]["leagues"]) == set(CS.USAT_PATH) and "cfl" not in CS.USAT_PATH, "leagues: NHL, NBA, MLB and NFL on both sites, no CFL")
    return list(FAILS)


def main():
    fails = run_unit()
    if fails:
        print("CONFIRM-SITES TEST FAILED:")
        for f in fails: print("  -", f)
        return 1
    print("confirm-sites test ok: layout, judge, outcomes on both sites, no values, limiter, switches, cap, failures and 429, shootouts, nothing on disk, combine, gate")
    return 0


if __name__ == "__main__":
    sys.exit(main())

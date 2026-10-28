#!/usr/bin/env python3
"""Tests of the grey and green source fetchers: the parsers on saved samples (samples/), the load SQL, and the gate every request passes.

    python3 -I scripts/grey/test_grey.py        no network, no database
Exit code: 0 all passed, 1 a check failed.
"""
import json, os, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
_raw = tempfile.mkdtemp()
os.environ["CFBD_RAW_ROOT"], os.environ["CFBD_API_KEY"] = _raw, "SECRET-KEY"
import common as C, cfbd, cfbd_fetch, cfbd_load, hockeytech, wnba

LM, SRC = C.LM, C.SRC
FAILS = []


def check(cond, what):
    if not cond:
        FAILS.append(what)


def sample(name):
    with open(os.path.join(HERE, "samples", name), "rb") as f:
        return f.read()


class Clock:
    def __init__(self): self.t = 1000.0
    def now(self): return self.t
    def sleep(self, s): self.t += s


def fetcher(source, purpose, answers, state=None, **kw):
    """A Fetcher whose network answers come from `answers` (a list of (status, body)); -> (fetcher, list of requested urls)."""
    clock, asked, queue = Clock(), [], list(answers)

    def opener(req):
        asked.append(req.full_url)
        status, body = queue.pop(0)
        return status, {}, body

    lim = LM.Limiter(LM.MemoryStore(clock.now), sleep=clock.sleep, log=lambda *_: None, holder="test")
    return C.Fetcher(source, purpose, limiter=lim, opener=opener, state_dir=state or tempfile.mkdtemp(), day="2026-10-25", **kw), asked


def refused(fn, kind, what):
    try:
        fn()
        check(False, what + " must be refused")
    except kind:
        pass


def test_cfbd():
    rows, bad = cfbd.parse_games(sample("cfbd_games.json"), "2026-10-25")
    check(len(rows) == 2 and len(bad) == 1 and "no id" in bad[0]["reason"], "cfbd: two games read, one without an id listed as unparsed")
    a, b = rows
    check((a["game_id"], a["home_team"], a["home_points"], a["away_points"], a["source_key"]) == (401635433, "Clemson", 66, 20, "cfbd:401635433"), "cfbd: the snake_case game")
    check(b["season_type"] == "regular" and b["home_team"] == "Home U" and b["neutral_site"] is True and b["home_points"] is None and b["completed"] is False, "cfbd: the camelCase game, no score before it is completed")
    sql = cfbd.load_sql(rows, 2024, "2026-10-25")
    check("O''Brien Field" in sql and sql.count("on conflict (game_id) do update") == 2 and sql.startswith("-- legacy_cfbd.game") and "begin;" in sql, "cfbd: quoted, rerunnable load text")
    check(cfbd.parse_games(b"{}", "d")[1], "cfbd: an answer that is not a list is reported, not guessed")


def test_cfbd_fetch():
    clock, seen = Clock(), []
    lim = LM.Limiter(LM.MemoryStore(clock.now), sleep=clock.sleep, log=lambda *_: None, holder="test")
    answers = [(200, {"X-CallLimit-Remaining": "900"}, b'[{"id": 1}]'), (200, {}, b"[]")]

    def net(req):
        seen.append(req)
        return answers.pop(0)

    cl = cfbd_fetch.Client(limiter=lim, sleep=clock.sleep, network=net)
    path = cl.get("games", {"year": 2023, "seasonType": "both"})
    check(path and open(path, "rb").read() == b'[{"id": 1}]' and path.endswith("games/seasonType=both&year=2023.json"), "cfbd fetch: the raw answer saved byte for byte under endpoint/params")
    check(seen[0].get_header("Authorization") == "Bearer SECRET-KEY" and "key" not in seen[0].full_url.lower(), "cfbd fetch: the key goes in a header, not the URL")
    log = open(cfbd_fetch.LOG, encoding="utf-8").read()
    check("SECRET-KEY" not in log and "/games\tseasonType=both&year=2023\t200\t11" in log and "900" in log, "cfbd fetch: one log line with status, bytes and the remaining calls, no key")
    check("SECRET-KEY" not in open(os.path.join(_raw, cfbd_fetch.DAY, "fetched.json")).read(), "cfbd fetch: fetched.json has no key")
    check(cl.get("games", {"year": 2023, "seasonType": "both"}) is None and len(seen) == 1, "cfbd fetch: a saved file is not fetched again")
    check(cfbd_fetch.used_this_month() >= 1, "cfbd fetch: the month count reads the log")
    cl2 = cfbd_fetch.Client(limiter=lim, sleep=clock.sleep, network=lambda r: (429, {}, b""))
    refused(lambda: cl2.get("records", {"year": 2023}), cfbd_fetch.Stop, "a 429 answer")
    cl3 = cfbd_fetch.Client(limiter=lim, sleep=clock.sleep, network=lambda r: (200, {"X-CallLimit-Remaining": "50"}, b"[]"))
    check(cl3.get("records", {"year": 2022}) is not None, "cfbd fetch: the request that brings the count to the spare is kept")
    refused(lambda: cl3.get("records", {"year": 2021}), cfbd_fetch.Stop, "the spare calls reached")
    cl4 = cfbd_fetch.Client(limiter=lim, sleep=clock.sleep, network=lambda r: (403, {}, b""))
    refused(lambda: cl4.get("records", {"year": 2019}), C.Blocked, "a 403 answer")
    old = cfbd_fetch.MONTH_STOP
    cfbd_fetch.MONTH_STOP = 0
    sent = []
    cl5 = cfbd_fetch.Client(limiter=lim, sleep=clock.sleep, network=lambda r: sent.append(r) or (200, {}, b"[]"))
    refused(lambda: cl5.get("records", {"year": 2020}), cfbd_fetch.Stop, "a request over the month's budget")
    cfbd_fetch.MONTH_STOP = old
    check(sent == [], "cfbd fetch: nothing is sent once the budget is spent")


def test_cfbd_load():
    samples = os.path.join(HERE, "samples", "cfbd_raw")
    rows, bad = cfbd_load.parse_table(samples, cfbd_load.T_TEAM, "2026-10-28")
    check(len(rows) == 2 and len(bad if isinstance(bad, list) else range(bad)) == 1, "cfbd load: a team without an id is counted unparsed")
    rows, _ = cfbd_load.parse_table(samples, cfbd_load.T_RECORD, "2026-10-28")
    check(rows[0]["post_losses"] == 1 and rows[1]["post_games"] is None, "cfbd load: record groups become columns, a missing group is null")
    text = cfbd_load.load_text("venue", cfbd_load.T_VENUE[3], cfbd_load.T_VENUE[4], None, cfbd_load.parse_table(samples, cfbd_load.T_VENUE, "d")[0], "d")
    check("Tab\\tDome" in text and "O'Brien Field" in text and "\\N" in text and "copy _load" in text, "cfbd load: COPY text escapes tabs and writes nulls")


def test_hockeytech():
    rows, bad = hockeytech.parse_schedule(sample("hockeytech_schedule.json"), "ahl", "2026-10-25")
    check(len(rows) == 2 and len(bad) == 1, "hockeytech: two games read, the row without a date listed")
    a, b = rows
    check((a["home_team"], a["away_team"], a["home_goals"], a["away_goals"], a["overtime"], a["shootout"]) == ("Toronto Marlies", "Rochester Americans", 3, 2, True, False), "hockeytech: city and nickname joined, a final with its goals")
    check(b["home_goals"] is None and b["status"] == "7:00 pm EDT" and b["venue"] is None, "hockeytech: a game not final has no goals")
    check(a["source_key"] == "hockeytech:ahl:1026001", "hockeytech: the source key names the league and the game")
    refused(lambda: hockeytech.feed_url("pwhl", 1, "k"), SRC.SourceRefused, "hockeytech: the PWHL")
    refused(lambda: hockeytech.feed_url("nhl", 1, "k"), SRC.SourceRefused, "hockeytech: a league not on the list")
    url = hockeytech.feed_url("AHL", 68, "k")
    check("client_code=ahl" in url and SRC.guard_url(url, purpose="daily")["id"] == "hockeytech", "hockeytech: another league passes the registry gate")


def test_wnba():
    rows, bad = wnba.parse_gamelog(sample("wnba_leaguegamelog.json"), "2026-10-25")
    check(len(rows) == 1 and len(bad) == 2, "wnba: one game paired, one with no points and one with a single row listed")
    r = rows[0]
    check((r["home_abbr"], r["away_abbr"], r["home_pts"], r["away_pts"], r["game_date"]) == ("NYL", "WAS", 82, 80, "2024-05-14"), "wnba: the 'vs.' row is the home team")
    check(wnba.parse_gamelog(b'{"resultSets":[{"headers":["X"],"rowSet":[]}]}', "d")[1], "wnba: missing columns are reported")


def test_gate():
    f, asked = fetcher("wnba_stats", "manual", [(200, b"{}")])
    refused(lambda: f.get("https://stats.wnba.com/stats/leaguegamelog?LeagueID=10"), SRC.SourceRefused, "wnba_stats (red-confirm) for a manual fetch")
    f, asked = fetcher("wnba_stats", "daily", [(200, b"{}")])
    refused(lambda: f.get("https://stats.wnba.com/stats/leaguegamelog?LeagueID=10"), SRC.SourceRefused, "wnba_stats (red-confirm) for the daily job")
    check(asked == [], "gate: a confirm-only source sends nothing from a fetcher")
    check(SRC.get("wnba_stats")["tier"] == "red-confirm" and "wnba_stats" not in C.HOLDS, "gate: wnba_stats is red-confirm, not a held grey source")
    check(not hasattr(wnba, "load_sql"), "gate: the wnba reader has no load SQL (confirm-only, never stored)")
    for src in ("fangraphs", "transfermarkt"):
        check(src in C.HOLDS, "gate: %s is on hold" % src)
    f, asked = fetcher("hockeytech", "manual", [(200, b"{}")])
    refused(lambda: f.get("https://lscluster.hockeytech.com/feed/index.php?feed=modulekit&client_code=pwhl&view=schedule"), SRC.SourceRefused, "the PWHL feed")
    refused(lambda: f.get("https://www.espn.com/nhl/scoreboard"), SRC.SourceRefused, "ESPN")
    refused(lambda: f.get("https://example.org/x"), SRC.SourceRefused, "an unknown host")
    refused(lambda: f.get("https://api.collegefootballdata.com/games?year=2024"), SRC.SourceRefused, "another source's URL")
    check(asked == [], "gate: refused URLs send nothing")
    g, asked = fetcher("hockeytech", "poll", [(200, b"{}")])
    refused(lambda: g.get("https://lscluster.hockeytech.com/feed/index.php?client_code=ahl"), SRC.SourceRefused, "a grey source used for something other than the daily job or a manual request")

    ok, asked = fetcher("hockeytech", "daily", [(200, b'{"a": 1}')])
    status, body = ok.get("https://lscluster.hockeytech.com/feed/index.php?client_code=ahl&key=SECRET")
    check(status == 200 and body == b'{"a": 1}' and len(asked) == 1 and ok.used_today() == 1, "gate: an allowed request goes out once and is counted")
    check(ok.opener is not None, "gate: opener replaceable")

    state = tempfile.mkdtemp()
    cap = SRC.SOURCES["hockeytech"]["daily_cap"]
    capped, asked = fetcher("hockeytech", "daily", [(200, b"{}")] * (cap + 2), state=state)
    for _ in range(cap):
        capped.get("https://lscluster.hockeytech.com/feed/index.php?client_code=ahl")
    refused(lambda: capped.get("https://lscluster.hockeytech.com/feed/index.php?client_code=ahl"), C.CapReached, "the request after the daily cap")
    check(len(asked) == cap, "gate: a grey source stops at its daily cap")
    next_day, asked = fetcher("hockeytech", "daily", [(200, b"{}")], state=state)
    next_day.day = "2026-10-26"
    next_day.get("https://lscluster.hockeytech.com/feed/index.php?client_code=ahl")
    check(len(asked) == 1, "gate: the cap starts again the next day")

    blocked, asked = fetcher("hockeytech", "manual", [(403, b""), (200, b"{}")])
    refused(lambda: blocked.get("https://lscluster.hockeytech.com/feed/index.php?client_code=ahl"), C.Blocked, "a 403 answer")
    check(len(asked) == 1, "gate: a 403 is not retried or worked around")

    again, asked = fetcher("hockeytech", "manual", [(429, b""), (503, b""), (200, b'{"ok": true}')])
    status, body = again.get("https://lscluster.hockeytech.com/feed/index.php?client_code=ahl")
    check(status == 200 and len(asked) == 3, "gate: 429 and 5xx are retried with a pause")

    green, asked = fetcher("cfbd", "manual", [(200, b"[]")])
    green.get("https://api.collegefootballdata.com/games?year=2024&seasonType=regular", {"Authorization": "Bearer SECRET"})
    check(len(asked) == 1, "gate: a green source passes for a manual request")


def test_raw():
    d = tempfile.mkdtemp()
    path = C.save_raw(d, "cfbd", "2026-10-25", "games-2024-regular.json", b'[{"id": 1}]', "https://api.collegefootballdata.com/games?year=2024&key=SECRET")
    meta = open(os.path.join(os.path.dirname(path), "fetched.json")).read()
    check(open(path, "rb").read() == b'[{"id": 1}]', "raw: saved byte for byte")
    check("SECRET" not in meta and "games" in meta and json.loads(meta)["games-2024-regular.json"]["bytes"] == 11, "raw: fetched.json keeps the URL without its query (no key) and the sha256")
    check("sha256" in meta, "raw: sha256 recorded")


def test_registry():
    check(all(SRC.get(s) and SRC.get(s)["tier"] in ("green", "grey") for s in ("cfbd", "hockeytech")), "registry: each storing fetcher's source is green or grey")
    check(set(C.HOLDS) <= set(SRC.SOURCES), "registry: every held source exists")


def run():
    for t in (test_cfbd, test_cfbd_fetch, test_cfbd_load, test_hockeytech, test_wnba, test_gate, test_raw, test_registry):
        t()
    if FAILS:
        print("FAILED:\n  " + "\n  ".join(FAILS))
        return 1
    print("grey fetchers test ok: cfbd and hockeytech parsers on samples, the wnba reader (confirm-only, no load SQL), the load SQL, the hold, the PWHL refusal, the daily cap, 403 and retry, the raw copy")
    return 0


if __name__ == "__main__":
    sys.exit(run())

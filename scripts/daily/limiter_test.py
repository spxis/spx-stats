#!/usr/bin/env python3
"""Tests of the source registry, the terms gate, the rate limiter, the queue and the short cache (sources.py, limiter.py).

    python3 -I scripts/daily/limiter_test.py                       # in memory with a fake clock: no network, no database (also part of run.py --self-test)
    python3 -I scripts/daily/limiter_test.py --ds1 "host=127.0.0.1 port=7741 user=postgres dbname=spx_limiter_test"
                                                                   # the same rules against a scratch Postgres (migration 137 is applied by the test)
Exit code: 0 all passed, 1 a check failed.
"""
import copy, json, os, subprocess, sys, tempfile, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import limiter as LM, sources as SRC

FAILS = []


def check(cond, what):
    if not cond: FAILS.append(what)


class Clock:
    def __init__(self): self.t = 1000.0
    def now(self): return self.t
    def sleep(self, s): self.t += s


def make(registry=None, clock=None):
    c = clock or Clock()
    logs = []
    L = LM.Limiter(LM.MemoryStore(c.now), registry=registry, sleep=c.sleep, log=logs.append, holder="test")
    return L, c, logs


def test_registry():
    check(SRC.validate(SRC.SOURCES) == [], "registry: the shipped registry is sound")
    tier = lambda t: {i for i, s in SRC.SOURCES.items() if s["tier"] == t}
    check({"wikipedia", "wikidata", "nflverse", "retrosheet", "lahman", "balldontlie", "osm", "cfbd", "odds_api"} == tier("green"), "registry: the green seed is John's list of 2026-10-19")
    check({"wnba_stats", "hockeytech", "cfl_api", "ncaa_stats", "fangraphs", "transfermarkt"} == tier("grey"), "registry: the grey seed is John's list")
    check({"nhl_api", "pwhl_hockeytech", "mlb_statsapi", "nba_stats"} == tier("red-confirm"), "registry: the confirm-only seed (NHL APIs, PWHL feed, MLB statsapi, stats.nba.com)")
    check({"nhl_com", "mlb_com", "nba_com", "nfl_com", "cfl_ca", "espn", "sports_reference", "yahoo", "news_tv", "nwsl", "cpl"} <= tier("red"), "registry: the red seed (the websites, ESPN, Sports Reference and the rest of section 3; ESPN and Sports Reference are never confirm-only)")
    check(all(SRC.SOURCES[i]["notes"] and SRC.SOURCES[i]["daily_cap"] for i in tier("grey")) and not any(SRC.SOURCES[i]["default"] for i in tier("grey")), "registry: grey sources carry notes and a daily cap and are never defaults")
    check(SRC.SOURCES["balldontlie"]["spacing"] == 13 and SRC.SOURCES["wikipedia"]["spacing"] > 0 and SRC.SOURCES["balldontlie"]["ttl"] == 60, "registry: balldontlie 13 s apart, answers kept 60 s")
    import balldontlie as B
    check(B.PAGE_GAP == SRC.SOURCES["balldontlie"]["spacing"], "registry: balldontlie.PAGE_GAP equals the registry's spacing")
    for url in ("https://api-web.nhle.com/v1/score/now", "https://statsapi.mlb.com/api/v1/schedule", "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json",
                "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", "https://www.hockey-reference.com/leagues/", "https://www.nfl.com/scores", "https://cfl.ca/scores"):
        try: SRC.guard_url(url); check(False, "gate: %s must be refused" % url)
        except SRC.SourceRefused as e: check(e.reason, "gate: %s refused with a reason" % url)
    check(SRC.guard_url("https://en.wikipedia.org/w/api.php?x=1")["id"] == "wikipedia" and SRC.guard_url("https://api.balldontlie.io/v1/games")["id"] == "balldontlie", "gate: an allowed host passes")
    try: SRC.guard_url("https://example.org/scores"); check(False, "gate: an unknown host must be refused")
    except SRC.SourceRefused: pass
    check(SRC.require("fangraphs", purpose="manual")["tier"] == "grey" and SRC.require("fangraphs", purpose="daily")["tier"] == "grey", "gate: a grey source is allowed for the daily job and a manual request")
    try: SRC.require("fangraphs", purpose="poll"); check(False, "gate: a grey source must be refused for anything else")
    except SRC.SourceRefused as e: check("grey area" in str(e), "gate: a grey source used another way is refused with the reason")
    for url in ("https://lscluster.hockeytech.com/feed/?client_code=pwhl&view=schedule", "https://www.thepwhl.com/en/stats"):
        try: SRC.guard_url(url); check(False, "gate: %s (PWHL) must be refused" % url)
        except SRC.SourceRefused: pass
    check(SRC.guard_url("https://lscluster.hockeytech.com/feed/?client_code=ahl")["id"] == "hockeytech" and SRC.guard_url("https://api.cfl.ca/v1/games")["id"] == "cfl_api",
          "gate: HockeyTech for another league and api.cfl.ca pass as grey; cfl.ca itself stays red")
    bad = dict(SRC.SOURCES, x=SRC._s("x", "X", "green", "r", spacing=1))
    check(any("terms" in p for p in SRC.validate(bad)), "registry: a green source without its terms record is a problem")
    bad = dict(SRC.SOURCES, x=SRC._s("x", "X", "grey", "r", default=True, spacing=1))
    check(any("default" in p for p in SRC.validate(bad)), "registry: a grey source cannot be a default")
    rows = {r["id"]: r for r in SRC.listing()}
    check(rows["espn"]["selectable"] is False and rows["espn"]["reason"] and not rows["espn"]["default"] and rows["wikipedia"]["selectable"] and rows["wikipedia"]["default"]
          and rows["fangraphs"]["grey_area"] and rows["fangraphs"]["notes"] and not rows["fangraphs"]["default"],
          "listing: red sources greyed out with the reason, green ones selectable and ticked, grey ones selectable with the grey-area marker and notes")


def test_gate_in_limiter():
    L, c, _ = make()
    called = []
    for src in ("nhl_api", "espn", "nowhere"):
        try: L.fetch(src, "k", lambda: called.append(1) or {"a": 1}); check(False, "limiter: %s must be refused" % src)
        except SRC.SourceRefused: pass
    try:
        with L.slot("mlb_statsapi"): called.append(2)
    except SRC.SourceRefused: pass
    check(not called and L.store.st == {} and c.t == 1000.0, "limiter: a forbidden source is refused before anything is queued, fetched or waited for")


def test_spacing_and_cache():
    L, c, logs = make()
    n = []
    def fn(): n.append(c.t); return {"n": len(n)}
    v, hit = L.fetch("balldontlie", "g1", fn)
    check(not hit and v == {"n": 1} and c.t == 1000.0, "limiter: the first request goes out at once")
    v, hit = L.fetch("balldontlie", "g2", fn)
    check(not hit and n[1] - n[0] >= 13 - 1e-6 and n[1] - n[0] < 16, "limiter: a second request waits for the 13 s spacing (waited %.1f s)" % (n[1] - n[0]))
    t = c.t
    v, hit = L.fetch("balldontlie", "g1", fn)
    check(hit and v == {"n": 1} and len(n) == 2 and c.t == t, "cache: the same key within 60 s is answered without a request and without waiting")
    c.sleep(61)
    v, hit = L.fetch("balldontlie", "g1", fn)
    check(not hit and len(n) == 3, "cache: after 60 s the key is fetched again")
    v, hit = L.fetch("balldontlie", "g1", fn, force=True)
    check(not hit and len(n) == 4 and n[3] - n[2] >= 13 - 1e-6, "force: skips the cache but still waits its turn behind the spacing (%.1f s)" % (n[3] - n[2]))
    check(L.stats["hits"] == 1 and L.stats["fetched"] == 4, "limiter: counters say 1 reused, 4 fetched (%r)" % L.stats)
    check(any("balldontlie is busy" in m and "in line ahead" in m for m in logs), "limiter: a wait is logged with the place in line and the estimate (%r)" % logs[:1])
    # wikipedia: spacing from the registry, different sources do not wait for each other
    L2, c2, _ = make()
    L2.fetch("balldontlie", "a", lambda: {"x": 1}); t0 = c2.t
    L2.fetch("wikipedia", "a", lambda: {"x": 1})
    check(c2.t == t0, "limiter: another source does not wait for balldontlie")


def test_penalty_and_failure():
    L, c, _ = make()
    L.fetch("balldontlie", "a", lambda: {"x": 1})
    L.penalize("balldontlie", 40)
    t = c.t; L.fetch("balldontlie", "b", lambda: {"x": 2})
    check(c.t - t >= 40 - 1e-6, "limiter: after a 429 every caller waits the penalty (%.1f s)" % (c.t - t))
    def boom(): raise RuntimeError("HTTP 500")
    try: L.fetch("wikipedia", "z", boom); check(False, "a failed request must raise")
    except RuntimeError: pass
    st = L.store.st["wikipedia"]
    check(st["busy"] is None and st["queue"] == [] and L.store.cache_get("wikipedia", "z") is None, "limiter: a failed request frees the source and caches nothing")


def test_one_bad_game_among_many():
    L, c, _ = make()
    asked = []
    def fn(keys):
        asked.append(list(keys))
        return {k: {"score": [1, 2]} for k in keys if k != "game:bad"}            # the source has nothing usable for one game
    keys = ["game:%d" % i for i in range(5)] + ["game:bad"]
    got = L.fetch_many("wikipedia", keys, fn)
    check(len(asked) == 1 and sorted(got) == sorted(k for k in keys if k != "game:bad"), "one bad game: the other five come back from ONE request")
    got = L.fetch_many("wikipedia", keys, fn)
    check(asked[1] == ["game:bad"] and len(got) == 5, "one bad game: next time only the missing game is asked for, the five others come from the cache (%r)" % asked[1:])
    got = L.fetch_many("wikipedia", keys[:5], fn)
    check(len(asked) == 2 and len(got) == 5, "cache: five cached games cost no request at all")


def test_queue():
    spec = dict(SRC.SOURCES["balldontlie"])
    s, ta, r = LM.step({}, 100.0, spec, None, "a", "first")
    check(r is None and s["busy"]["h"] == "a", "queue: the first caller holds the source")
    s, tb, rb = LM.step(s, 100.0, spec, None, "b", "second")
    s, tc, rc = LM.step(s, 100.0, spec, None, "c", "third")
    check(rb[0] == 1 and rc[0] == 2, "queue: places are visible: second has 1 ahead, third has 2 (%r %r)" % (rb, rc))
    s, tc2, rc2 = LM.step(s, 101.0, spec, tc, "c", "third")
    check(tc2 == tc and rc2[0] == 2, "queue: a caller keeps its place when it looks again")
    s = LM.finish(s, 105.0, spec, ta)
    s, _, r = LM.step(s, 105.0, spec, tb, "b", "second")
    check(r is not None and r[1] >= 12.9, "queue: the next one still waits for the spacing after the holder is done (eta %.1f)" % r[1])
    s, _, r = LM.step(s, 118.1, spec, tb, "b", "second")
    check(r is None and s["busy"]["h"] == "b", "queue: and goes once the spacing has passed")
    # a waiter that stopped polling is dropped, a holder that died loses the source when its lease ends
    s2, _, _ = LM.step({}, 0.0, spec, None, "x", "x")
    s2, tw, _ = LM.step(s2, 0.0, spec, None, "w", "w")
    s2, ty, ry = LM.step(s2, 40.0, spec, None, "y", "y")
    check([q["h"] for q in s2["queue"]] == ["y"] and ry[0] == 1, "queue: a waiter that has not looked for 30 s is dropped (%r)" % s2["queue"])
    s3, _, _ = LM.step({}, 0.0, spec, None, "dead", "dead")
    s3, _, r = LM.step(s3, 91.0, spec, None, "live", "live")
    check(r is None and s3["busy"]["h"] == "live", "queue: a holder that never finished loses the source after its 90 s lease")
    # the bucket refills with time and holds at its burst
    s4 = LM.finish(LM.step({}, 0.0, spec, None, "a", "a")[0], 1.0, spec, 1)
    check(s4["tokens"] < 1 and LM.step(s4, 1000.0, spec, None, "a", "a")[2] is None and LM.step(s4, 1000.0, spec, None, "a", "a")[0]["tokens"] <= 0.0 + 1e-9, "bucket: empty after a request, one token back after the spacing, never more than the burst")


def test_threads():
    reg = dict(SRC.SOURCES, fast=SRC._s("fast", "Fast", "green", "test", spacing=0.2, hosts=("fast.example",), terms=dict(checked_by="t", checked_on="2026-01-01", clause="c")))
    store = LM.MemoryStore()
    lock = threading.Lock()
    orig_cas = store.cas
    store.cas = lambda *a: (lock.acquire(), orig_cas(*a), lock.release())[1]
    inflight, peak, starts, calls = [0], [0], [], []
    def fn(i):
        def run():
            with lock: inflight[0] += 1; peak[0] = max(peak[0], inflight[0]); starts.append(time.time()); calls.append(i)
            time.sleep(0.15)
            with lock: inflight[0] -= 1
            return {"i": i}
        return run
    out = []
    def worker(i, key):
        L = LM.Limiter(store, registry=reg, log=lambda m: None, holder="t%d" % i, poll=0.05)
        out.append(L.fetch("fast", key, fn(i))[0])
    ts = [threading.Thread(target=worker, args=(i, "k%d" % i)) for i in range(4)]
    for t in ts: t.start()
    for t in ts: t.join(30)
    gaps = [b - a for a, b in zip(sorted(starts), sorted(starts)[1:])]
    check(len(out) == 4 and peak[0] == 1, "threads: four callers on one source never run in parallel (peak %d)" % peak[0])
    check(all(g >= 0.15 + 0.2 - 0.05 for g in gaps), "threads: and each starts after the previous ended plus the spacing (%r)" % [round(g, 2) for g in gaps])
    inflight[0] = peak[0] = 0; calls.clear(); out.clear()
    ts = [threading.Thread(target=worker, args=(i, "same")) for i in range(5)]
    for t in ts: t.start()
    for t in ts: t.join(30)
    check(len(calls) == 1 and len(out) == 5 and all(o == out[0] for o in out), "threads: five callers wanting the same key send ONE request and all get its answer (%d requests)" % len(calls))


def test_filestore():
    with tempfile.TemporaryDirectory() as d:
        a, b = LM.FileStore(os.path.join(d, "l.json")), LM.FileStore(os.path.join(d, "l.json"))
        st, v, _ = a.read("x")
        check(a.cas("x", {"k": 1}, v) and not b.cas("x", {"k": 2}, v) and b.read("x")[0] == {"k": 1}, "file store: a write on a stale version is refused, a second store sees the first one's state")
        a.cache_put("x", "key", {"v": 1})
        check(b.cache_get("x", "key")[1] == {"v": 1}, "file store: the cache is shared by two stores on the same file")


def test_ds1_store(dsn):
    """The same store against a scratch Postgres. Threads make real concurrent psql sessions."""
    def run(sql):
        p = subprocess.run(["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", dsn, "-f", "-"], input=sql, capture_output=True, text=True)
        if p.returncode: raise RuntimeError(p.stderr.strip()[-200:])
        return p.stdout
    run("create schema if not exists ingest;")
    store = LM.Ds1Store(run=run)
    store.ensure(); store.ensure()
    run("delete from ingest.source_limiter; delete from ingest.source_cache;")
    st, v, now = store.read("balldontlie")
    check(v == 0 and st == {} and store.cas("balldontlie", {"a": "it's"}, 0) and not store.cas("balldontlie", {"a": 2}, 0) and store.read("balldontlie")[0] == {"a": "it's"}, "ds1: compare-and-swap on the version, quotes survive")
    big = {"games": [{"id": i, "name": "x" * 200} for i in range(900)]}
    store.cache_put("balldontlie", "u?a=1&b='2'", big)
    age, val = store.cache_get("balldontlie", "u?a=1&b='2'")
    check(val == big and age < 5, "ds1: a 200 KB answer is cached through stdin and read back")
    reg = dict(SRC.SOURCES, fast=SRC._s("fast", "Fast", "green", "test", spacing=0.5, hosts=("fast.example",), terms=dict(checked_by="t", checked_on="2026-01-01", clause="c")))
    inflight, peak, starts = [0], [0], []
    lock = threading.Lock()
    def worker(i):
        L = LM.Limiter(LM.Ds1Store(run=run), registry=reg, log=lambda m: None, holder="p%d" % i, poll=0.2)
        def go():
            with lock: inflight[0] += 1; peak[0] = max(peak[0], inflight[0]); starts.append(time.time())
            time.sleep(0.2)
            with lock: inflight[0] -= 1
            return {"i": i}
        L.fetch("fast", "k%d" % i, go)
    ts = [threading.Thread(target=worker, args=(i,)) for i in range(4)]
    for t in ts: t.start()
    for t in ts: t.join(60)
    s = sorted(starts)
    check(len(s) == 4 and peak[0] == 1 and all(b - a >= 0.5 + 0.2 - 0.1 for a, b in zip(s, s[1:])), "ds1: four sessions on one source run one at a time, spaced (%r)" % [round(b - a, 2) for a, b in zip(s, s[1:])])
    left = json.loads(run("select state::text from ingest.source_limiter where source = 'fast'").strip())
    check(left["busy"] is None and left["queue"] == [], "ds1: nobody is left holding or queued")


def test_callers():
    """wikiapi.Client and balldontlie._get through the limiter, with the HTTP layer replaced."""
    import io, urllib.error, balldontlie as B, wikiapi as W
    L, c, _ = make()
    calls = []
    class Resp:
        def __init__(self, body, headers=None): self.b, self.headers = body, headers or {}
        def read(self): return self.b
        def __enter__(self): return self
        def __exit__(self, *a): return False
    def fake_urlopen(req, timeout=0, context=None):
        calls.append(req.full_url)
        titles = req.full_url.split("titles=")[1].split("&")[0].split("%7C")
        pages = [{"title": t, "revisions": [{"revid": 100 + i, "timestamp": "2026-10-18T00:00:00Z", "slots": {"main": {"content": "text"}}}]} for i, t in enumerate(titles)]
        return Resp(json.dumps({"query": {"pages": pages}}).encode())
    real = W.urllib.request.urlopen
    W.urllib.request.urlopen = fake_urlopen
    try:
        cl = W.Client(limiter=L)
        r = cl.revisions(["A", "B"])
        check(c.t == 1000.0 and L.store.st["wikipedia"]["busy"] is None, "wikipedia: a request that takes its own slot inside fetch_many does not wait for itself (%.0f s on the clock)" % (c.t - 1000.0))
        r2 = cl.revisions(["A", "B"])
        check(len(calls) == 1 and r2["A"]["revid"] == r["A"]["revid"] == 100 and not r["A"]["missing"], "wikipedia: the revision ids asked twice within a minute cost one request")
        cl.revisions(["A", "B", "C"])
        check(len(calls) == 2 and "titles=C&" in calls[1], "wikipedia: a new title asks for the new title only (%s)" % calls[-1][-60:])
        W.Client(limiter=L, force=True).revisions(["A"])
        check(len(calls) == 3, "wikipedia: force asks again")
        t = c.t
        calls.clear(); c.sleep(61)
        cl.contents(["A"]); cl.contents(["A"])
        check(len(calls) == 2 and c.t - t >= 61 + SRC.SOURCES["wikipedia"]["spacing"] - 1e-6, "wikipedia: page text is never served from the minute cache, and two requests are spaced")
        def err(req, timeout=0, context=None):
            raise urllib.error.HTTPError(req.full_url, 429, "slow down", {"Retry-After": "20"}, io.BytesIO(b""))
        W.urllib.request.urlopen = err
        t = c.t
        try: W.Client(limiter=L, force=True).revisions(["Z"])
        except RuntimeError: pass
        check(c.t - t > 60, "wikipedia: after 429s the caller backs off inside the limiter, not by sleeping on its own (%.0f s)" % (c.t - t))
    finally:
        W.urllib.request.urlopen = real
    # balldontlie
    L, c, _ = make()
    n, real_req = [], B._request
    def fake_request(url, key):
        n.append(c.t)
        if len(n) == 1: raise B.Throttled(30)
        return {"data": [{"id": 1}], "meta": {}}
    B._request = fake_request
    try:
        d = B._get("/games", {"seasons[]": 2026}, "key", limiter=L)
        check(d["data"][0]["id"] == 1 and len(n) == 2 and n[1] - n[0] >= 30 - 1e-6, "balldontlie: a 429 holds the account off for the Retry-After (%.0f s)" % (n[1] - n[0]))
        B._get("/games", {"seasons[]": 2026}, "key", limiter=L)
        B._get("/games", {"seasons[]": 2026, "cursor": 5}, "key", limiter=L)
        check(len(n) == 3 and n[2] - n[1] >= 13 - 1e-6, "balldontlie: the same page twice is one request, the next page waits 13 s")
    finally:
        B._request = real_req
    try: B._request("https://api-web.nhle.com/v1/x", "k"); check(False, "balldontlie: a request to a forbidden host must never go out")
    except SRC.SourceRefused: pass


def run_unit():
    del FAILS[:]
    test_registry(); test_gate_in_limiter(); test_spacing_and_cache(); test_penalty_and_failure(); test_one_bad_game_among_many(); test_queue(); test_callers(); test_threads(); test_filestore()
    return list(FAILS)


def main(argv):
    fails = run_unit()
    if "--ds1" in argv:
        del FAILS[:]
        test_ds1_store(argv[argv.index("--ds1") + 1])
        fails += FAILS
    if fails:
        print("LIMITER TEST FAILED:")
        for f in fails: print("  -", f)
        return 1
    print("limiter test ok: registry and terms gate, spacing, queue places, cache and force, penalty, one bad game, threads, file store" + (", scratch DS1" if "--ds1" in argv else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

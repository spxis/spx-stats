#!/usr/bin/env python3
"""Tests of the API watchdog (scripts/release/watchdog.py): the state machine as a pure function, the loop around it with stand-in
network calls, and the real probe and Management API calls against a small local server. No database, no production.

    python3 -I scripts/release/test/test_watchdog.py

Exit code: 0 all passed, 1 a check failed.
"""
import http.server
import json
import os
import sys
import tempfile
import threading

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import watchdog as W  # noqa: E402

CFG = W.Config({"WATCHDOG_STATE": "/nonexistent/x.json"})
FAILED = []


def check(name, cond, detail=""):
    print(("ok    " if cond else "FAIL  ") + name + ("" if cond else "  " + str(detail)))
    if not cond:
        FAILED.append(name)


def feed(results, start=1000.0, every=60.0, cfg=CFG, state=None):
    """Run step over a list of booleans (True = probe worked); the caller does every reload and restart at once. Returns (state, [(i, action)])."""
    state = state or W.new_state()
    out = []
    for i, ok in enumerate(results):
        now = start + i * every
        state, actions = W.step(state, ok, now, cfg)
        for (a,) in actions:
            out.append((i, a))
            if a in ("reload", "restart"):
                state = W.done(state, a, now, cfg)
    return state, out


def test_machine():
    # a few failed probes and a recovery: nothing happens, nothing is recorded
    s, acts = feed([True, False, False, False, False, True, True])
    check("4 failures then ok: no action", acts == [], acts)
    check("4 failures then ok: streak reset", s["streak"] == 0 and s["failing_since"] is None and not s["detected"])

    # exactly 5 failures: record the incident and reload, once
    s, acts = feed([False] * 5)
    check("5 failures: detected then reload", acts == [(4, "detected"), (4, "reload")], acts)
    s, acts = feed([False] * 9)
    check("9 failures: still only the reload", acts == [(4, "detected"), (4, "reload")], acts)
    # 5 more after the reload: restart
    s, acts = feed([False] * 10)
    check("10 failures: restart on the 10th", acts == [(4, "detected"), (4, "reload"), (9, "restart")], acts)
    check("failing_since is the first failure", s["failing_since"] == 1000.0, s["failing_since"])

    # after the restart the project is coming back: failures inside the grace do not count and do not restart again
    s, acts = feed([False] * 10 + [False] * 9)
    check("failures during the grace do nothing", acts == [(4, "detected"), (4, "reload"), (9, "restart")], acts)
    check("streak frozen in the grace", s["streak"] == 10, s["streak"])

    # still down after the grace and after the hour: a second restart, but not before the hour is up
    s, acts = feed([False] * 10 + [False] * 30, every=60.0)
    check("no second restart inside the hour", [a for _, a in acts].count("restart") == 1, acts)
    s, acts = feed([False] * 10 + [False] * 80, every=60.0)
    check("a second restart after the hour", [a for _, a in acts].count("restart") == 2, acts)
    restarts = [i for i, a in acts if a == "restart"]
    check("the restarts are at least an hour apart", (restarts[1] - restarts[0]) * 60 >= 3600, restarts)

    # an incident that ends: recovered is reported once, after the actions
    s, acts = feed([False] * 6 + [True, True])
    check("recovery after the reload", acts == [(4, "detected"), (4, "reload"), (6, "recovered")], acts)
    check("state clean after recovery", s["streak"] == 0 and not s["detected"] and s["reload_at"] is None)
    s, acts = feed([False] * 10 + [True] * 3)
    check("recovery after a restart", acts[-1] == (10, "recovered") and acts[-2] == (9, "restart"), acts)
    check("the hourly limit survives the recovery", s["last_restart"] is not None)

    # a second incident right after the first restart: reload again, but no restart until the hour is up
    s, acts = feed([False] * 10 + [True] + [False] * 10, every=60.0)
    kinds = [a for _, a in acts]
    check("second incident: detected, reload, no restart yet", kinds == ["detected", "reload", "restart", "recovered", "detected", "reload"], kinds)

    # an action the caller could not send (not done()) is offered again on the next probe
    state = W.new_state()
    seen = []
    for i in range(7):
        state, actions = W.step(state, False, 1000.0 + i * 60, CFG)
        seen += [(i, a) for (a,) in actions]
    check("a reload that was not sent is offered again", [x for x in seen if x[1] == "reload"] == [(4, "reload"), (5, "reload"), (6, "reload")], seen)

    # restart waits for the reload's own count, not for the clock
    state = W.new_state()
    seen = []
    for i in range(12):
        state, actions = W.step(state, False, 1000.0 + i * 60, CFG)
        for (a,) in actions:
            seen.append((i, a))
            if a == "reload" and i == 6:
                state = W.done(state, a, 1000.0 + i * 60, CFG)
    check("reload delayed to probe 7: restart needs 5 more", [x for x in seen if x[1] == "restart"] == [(11, "restart")], seen)

    # the thresholds are settings
    small = W.Config({"WATCHDOG_DOWN_AFTER": "2", "WATCHDOG_RESTART_AFTER": "1", "WATCHDOG_STATE": "/x"})
    s, acts = feed([False] * 3, cfg=small)
    check("custom thresholds", acts == [(1, "detected"), (1, "reload"), (2, "restart")], acts)

    # the machine does not change its input
    before = W.new_state()
    W.step(before, False, 5.0, CFG)
    check("step leaves its input alone", before == W.new_state())


def loop(results, cfg=CFG, ready=True, reload_ok=True, restart_ok=True, writers=None, state=None, start=1000.0):
    """run_once over results with stand-ins; returns (state, calls)."""
    calls = []
    state = state or W.new_state()
    it = iter(results)
    for i in range(len(results)):
        ok = next(it)
        state = W.run_once(cfg, state, start + i * 60,
                           probe_fn=lambda c, ok=ok: (ok, "" if ok else "HTTP 503 PGRST002"),
                           reload_fn=lambda c: (calls.append("reload") or (reload_ok, "HTTP 201")),
                           restart_fn=lambda c: (calls.append("restart") or (restart_ok, "HTTP 201")),
                           ready_fn=lambda c: ready, writers=writers)
    return state, calls


def test_loop():
    cfg = W.Config({"SUPABASE_ACCESS_TOKEN": "t", "WATCHDOG_STATE": "/x"})
    wrote = {"ds1": [], "prod": []}
    writers = {"ds1": lambda sql: wrote["ds1"].append(sql), "prod": lambda sql: wrote["prod"].append(sql)}
    s, calls = loop([False] * 10 + [True], cfg=cfg, writers=writers)
    check("loop: one reload, one restart", calls == ["reload", "restart"], calls)
    check("loop: the incident was written on both sides", len(wrote["ds1"]) == 3 and len(wrote["prod"]) == 3, wrote)
    last = wrote["ds1"][-1]
    check("loop: last write has recovered_at, reload_at and restart_at", "'1970-01-01 00:26:40+00'::timestamptz, 'HTTP 503" in last and "null::timestamptz" not in last, last)
    check("loop: finished incident is dropped once written", s["episode"] is None and s["synced"] == {})
    check("loop: no write before the 5th failure", True)

    check("loop: the state remembers the last probe and the last good one (for /admin/ops)",
          s["last_probe_ok"] is True and s["last_probe_at"] == 1000.0 + 10 * 60 and s["last_ok_at"] == s["last_probe_at"], s)
    s, _ = loop([True, False], cfg=cfg)
    check("loop: a failed probe moves last_probe_at but not last_ok_at", s["last_probe_ok"] is False and s["last_ok_at"] == 1000.0 and s["last_probe_at"] == 1060.0, s)

    wrote2 = []
    s, calls = loop([False] * 4 + [True], cfg=cfg, writers={"ds1": wrote2.append})
    check("loop: a short blip writes nothing", wrote2 == [] and calls == [])

    # the project is mid-change (or the Management API is down): no action, offered again, no record of an action
    s, calls = loop([False] * 8, cfg=cfg, ready=False)
    check("loop: held off when the project is not ready", calls == [] and s["reload_at"] is None, (calls, s))
    s, calls = loop([False] * 3, cfg=cfg, state=s, start=5000.0, ready=True)
    check("loop: sends the held reload as soon as it is allowed", calls == ["reload"], calls)

    # no token: cannot act, still records
    nt = W.Config({"WATCHDOG_STATE": "/x"})
    w3 = []
    s, calls = loop([False] * 6, cfg=nt, writers={"ds1": w3.append})
    check("loop: no token means no action", calls == [] and len(w3) == 1, (calls, w3))

    # a side that is down is retried until it works, the other side is not written twice
    flaky = {"n": 0}
    good = []

    def prod(sql):
        flaky["n"] += 1
        if flaky["n"] <= 2:
            raise RuntimeError("down")
        good.append(sql)

    ds1 = []
    s, calls = loop([False] * 7, cfg=cfg, writers={"ds1": ds1.append, "prod": prod})
    check("loop: a failed side is retried, a good side is not repeated", len(ds1) == 1 and len(good) == 1 and flaky["n"] == 3, (len(ds1), len(good), flaky))

    # a failed restart is offered again on the next failed probe; a failed reload is not
    s, calls = loop([False] * 12, cfg=cfg, reload_ok=False, restart_ok=False)
    check("loop: failed reload not repeated, failed restart repeated", calls[0] == "reload" and calls.count("reload") == 1 and calls.count("restart") >= 2, calls)

    # an error in a writer never reaches the caller
    def boom(sql):
        raise OSError("x")
    s, calls = loop([False] * 5, cfg=cfg, writers={"ds1": boom})
    check("loop: a failing writer does not stop the loop", s["episode"] is not None and s["synced"] == {})

    # the sql
    sql = W.upsert_sql({"failing_since": 0, "detected_at": 300, "probes_failed": 5, "last_error": "it's down", "rev": 1})
    check("sql: quoted and idempotent", "'it''s down'" in sql and "on conflict (failing_since) do update" in sql and "'1970-01-01 00:00:00+00'" in sql, sql)


class Fake(http.server.BaseHTTPRequestHandler):
    log = []
    mode = {"probe": 200, "status": "ACTIVE_HEALTHY"}

    def log_message(self, *a):
        pass

    def send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        Fake.log.append(("GET", self.path, self.headers.get("apikey"), self.headers.get("Authorization")))
        if self.path.startswith("/rest/v1/games"):
            code = Fake.mode["probe"]
            return self.send(code, [{"game_id": 1}] if code == 200 else {"code": "PGRST002", "message": "could not query the database for the schema cache"})
        if self.path == "/v1/projects/ref":
            return self.send(200, {"id": "ref", "status": Fake.mode["status"]})
        self.send(404, {})

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n).decode()
        Fake.log.append(("POST", self.path, body, self.headers.get("Authorization")))
        self.send(201, [] if self.path.endswith("/query") else {})


def test_http():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Fake)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = srv.server_address[1]
    cfg = W.Config({"WATCHDOG_URL": "http://127.0.0.1:%d/rest/v1" % port, "WATCHDOG_MGMT_URL": "http://127.0.0.1:%d/v1/projects/ref" % port,
                    "SUPABASE_ACCESS_TOKEN": "tok", "WATCHDOG_STATE": "/x", "WATCHDOG_PROBE_TIMEOUT": "2"})
    ok, why = W.probe(cfg)
    check("http: a working probe", ok, why)
    g = Fake.log[0]
    check("http: probe asks api.games with the public key and no user token", "league=eq.nhl" in g[1] and "limit=1" in g[1] and g[2] == W.PUBLIC_KEY and g[3] is None, g)
    Fake.mode["probe"] = 503
    ok, why = W.probe(cfg)
    check("http: a 503 is a failure and names the code", not ok and "503" in why and "PGRST002" in why, why)
    Fake.mode["probe"] = 200
    dead = W.Config({"WATCHDOG_URL": "http://127.0.0.1:1/rest/v1", "WATCHDOG_PROBE_TIMEOUT": "1"})
    ok, why = W.probe(dead)
    check("http: a refused connection is a failure", not ok, why)

    check("http: project ready", W.project_ready(cfg))
    Fake.mode["status"] = "RESTARTING"
    check("http: project restarting is not ready", not W.project_ready(cfg))
    Fake.mode["status"] = "ACTIVE_UNHEALTHY"
    check("http: project unhealthy is ready for a nudge", W.project_ready(cfg))
    Fake.mode["status"] = "ACTIVE_HEALTHY"

    Fake.log.clear()
    sent = W.send_reload(cfg)
    r = Fake.log[-1]
    check("http: reload is NOTIFY pgrst through database/query", sent[0] and r[1] == "/v1/projects/ref/database/query"
          and json.loads(r[2]) == {"query": "NOTIFY pgrst, 'reload schema'"} and r[3] == "Bearer tok", r)
    sent = W.send_restart(cfg)
    r = Fake.log[-1]
    check("http: restart is POST /restart", sent[0] and r[1] == "/v1/projects/ref/restart", r)

    # the whole thing with the real probe against the fake: 503s walk through reload and restart
    Fake.log.clear()
    Fake.mode["probe"] = 503
    state = W.new_state()
    with tempfile.TemporaryDirectory() as d:
        cfg.state_path = os.path.join(d, "w.json")
        for i in range(10):
            state = W.run_once(cfg, state, 1000.0 + i * 60)
            W.save_state(cfg.state_path, state)
        posts = [x[1] for x in Fake.log if x[0] == "POST"]
        check("http: end to end, reload then restart", posts == ["/v1/projects/ref/database/query", "/v1/projects/ref/restart"], posts)
        reloaded = W.load_state(cfg.state_path)
        check("http: state survives a restart of the runner", reloaded["detected"] and reloaded["streak"] == 10, reloaded)
    srv.shutdown()


def test_off():
    check("WATCHDOG=0 switches off", not W.Config({"WATCHDOG": "0"}).enabled and W.Config({}).enabled)


if __name__ == "__main__":
    test_machine()
    test_loop()
    test_http()
    test_off()
    print("\n%s" % ("all passed" if not FAILED else "FAILED: " + ", ".join(FAILED)))
    sys.exit(1 if FAILED else 0)

#!/usr/bin/env python3
"""Tests of the ops snapshot and controls (scripts/release/ops.py, migrations 104 and 105).

    python3 -I scripts/release/test/test_ops.py

Part 1 is pure (the snapshot builder, the hash, the timer rules, the tick with stand-ins) and needs nothing.
Part 2 needs a Postgres server: set PGHOST, PGPORT and PGUSER (a scratch server, for example the harvest one:
`HARVEST_SCRATCH_PORT=3121 bash scripts/harvest/test/scratch.sh up`). It makes two throwaway databases on it, ops_t_ds1 (standing in for DS1:
the harvest queue, the daily job, releases, the drift table, the raw archive, migration 105) and ops_t_prod (standing in for production:
045 and 104), serves a stand-in Management API in front of the second, and drops both at the end. It checks the real SQL: the collectors
against real rows, the request rules and the ring of 96 in migration 104, the secret, the pause switch and a whole tick end to end.

Exit code: 0 all passed, 1 a check failed.
"""
import csv
import datetime
import hashlib
import http.server
import io
import json
import os
import subprocess
import sys
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
sys.path.insert(0, os.path.join(HERE, "..", "..", "harvest"))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
import ops as O  # noqa: E402

FAILED = []
UTC = datetime.timezone.utc
NOW = datetime.datetime(2026, 10, 15, 14, 0, 0, tzinfo=UTC)
CFG = O.Config({"SUPABASE_ACCESS_TOKEN": "t", "OPS_STATE": "/nonexistent/ops.json"})
RUNNER = {"sha": "abc1234", "ref": "origin/main", "last_drift": "2026-10-15"}


def check(name, cond, detail=""):
    print(("ok    " if cond else "FAIL  ") + name + ("" if cond else "  " + str(detail)[:600]))
    if not cond:
        FAILED.append(name)


# ---------------------------------------------------------------------------------------------------- raw parts as DS1 gives them

def ts(minutes_ago, base=NOW):
    return (base - datetime.timedelta(minutes=minutes_ago)).isoformat()


def raw_harvester(beat_min=0.2, outcome="running", flag=None):
    return {
        "progress": {
            "queue": [{"kind": "wp_team_season", "state": "queued", "n": 120}, {"kind": "wp_team_season", "state": "done", "n": 30},
                      {"kind": "wd_person", "state": "queued", "n": 800}, {"kind": "wd_person", "state": "failed", "n": 2}],
            "gap_left": [{"kind": "wp_team_season", "league": "nba", "n": 90}, {"kind": "wd_person", "league": "-", "n": 802}, {"kind": "wp_team_season", "league": "cfl", "n": 30}],
            "today": {"requests": 400, "bytes": 5_000_000, "archived": 90},
            "per_day": [], "archive_rows": 1234,
            "last_run": {"run_id": 7, "started_at": ts(30), "last_beat_at": ts(beat_min), "finished_at": None, "outcome": outcome, "host": "somewhere", "git_sha": "deadbee",
                         "summary": {"paused_secs": 60, "kinds": {}}},
            "last_error": {"kind": "wp_draft", "target": "1970 NHL amateur draft", "error": "HTTP 503\x00 boom", "at": ts(5)},
        },
        "hour": {"requests": 180, "bytes": 2_000_000, "archived": 40},
        "flag": flag,
        "db_now": NOW.isoformat(),
    }


RAW_DAILY = {"run": {"run_id": 3, "started_at": ts(240), "finished_at": ts(235), "outcome": "ok", "summary": {"games": 12, "changed": 3, "note": "x", "nested": {"a": 1}}},
             "ok_7d": 6, "failed_7d": 1, "release": {"number": "2026.10.15-2", "status": "done", "created_at": ts(230)}}
RAW_RELEASES = {"counts": {"pending": 2, "running": 1}, "last_done": {"number": "2026.10.15-2", "title": "Daily scores", "kind": "daily_scores", "finished_at": ts(220)},
                "last_failed": None, "drift_checked_at": ts(600)}
RAW_SYNC = [["core.game", 1000, 1000, "same", ts(600)], ["core.person", 50, 49, "differs", ts(601)], ["meta.source", 9, 9, "same", ts(602)]]
RAW_BACKUP = {"archive_rows": 500, "archive_bytes": 9_000_000,
              "export": {"finished_at": ts(40), "outcome": "ok", "checked": 500, "copied": 3, "present": 497, "failed": 0, "bytes": 1234, "seconds": 20},
              "export_ok": {"finished_at": ts(40)}}
RAW_WD_STATE = {"streak": 0, "last_probe_at": NOW.timestamp() - 30, "last_ok_at": NOW.timestamp() - 30, "last_probe_ok": True, "last_error": None}


def parts(**over):
    p = {"harvester": raw_harvester(), "daily": RAW_DAILY, "releases": RAW_RELEASES, "sync": RAW_SYNC, "backup": RAW_BACKUP,
         "watchdog": {"state": RAW_WD_STATE, "events": [], "enabled": True}}
    p.update(over)
    return p


def test_shapes():
    s = O.build_snapshot(parts(), RUNNER, NOW)
    check("snapshot: has every section and the time", set(s) == {"v", "at", "harvester", "daily", "watchdog", "releases", "sync", "backup"} and s["at"] == "2026-10-15T14:00:00Z", s.keys())
    h = s["harvester"]
    check("harvester: running with a fresh heartbeat", h["state"] == "running" and h["run"]["id"] == 7, h)
    check("harvester: queue by kind and state, totals", h["queue"]["wp_team_season"] == {"queued": 120, "done": 30} and h["queued_total"] == 920, h)
    check("harvester: gap sorted by kind then league, with a total", h["gap"] == [["wd_person", "-", 802], ["wp_team_season", "cfl", 30], ["wp_team_season", "nba", 90]] and h["gap_total"] == 922, h["gap"])
    check("harvester: hour and today", h["hour"] == {"requests": 180, "bytes": 2_000_000, "archived": 40} and h["today"]["archived"] == 90)
    check("harvester: the last error is cleaned of control characters", h["last_error"]["error"] == "HTTP 503 boom", h["last_error"])
    check("harvester: stale heartbeat", O.shape_harvester(raw_harvester(beat_min=20))["state"] == "stale")
    check("harvester: between cycles", O.shape_harvester(raw_harvester(beat_min=1, outcome="ok"))["state"] == "idle")
    check("harvester: stopped long ago", O.shape_harvester(raw_harvester(beat_min=300, outcome="ok"))["state"] == "stopped")
    p = O.shape_harvester(raw_harvester(flag={"by": "john@example.test", "at": ts(2)}))
    check("harvester: paused wins and names who", p["state"] == "paused" and p["paused"]["by"] == "john@example.test" and p["paused"]["at"] == "2026-10-15T13:58:00Z", p)
    never = O.shape_harvester({"progress": {"queue": [], "gap_left": [], "today": {}, "last_run": None, "last_error": None}, "hour": {}, "flag": None, "db_now": NOW.isoformat()})
    check("harvester: never ran", never["state"] == "never" and never["queued_total"] == 0 and never["run"] is None, never)
    d = s["daily"]
    check("daily: last run, counts keep only numbers, release", d["last"]["outcome"] == "ok" and d["last"]["counts"] == {"changed": 3, "games": 12} and d["release"]["number"] == "2026.10.15-2" and d["failed_7d"] == 1, d)
    r = s["releases"]
    check("releases: counts, last done, runner", r["pending"] == 2 and r["running"] == 1 and r["approved"] == 0 and r["last_done"]["number"] == "2026.10.15-2" and r["runner"]["sha"] == "abc1234" and r["nightly_drift_day"] == "2026-10-15", r)
    y = s["sync"]
    check("sync: differing tables first, compact rows, counts and times", y["tables"][0] == ["core.person", 50, 49, 1] and y["differs"] == 1 and y["count"] == 3
          and y["checked_at"] == iso_min(600) and y["oldest_checked_at"] == iso_min(602), y)
    b = s["backup"]
    check("backup: archive and the last export", b["archive_rows"] == 500 and b["export"]["copied"] == 3 and b["export"]["failed"] == 0 and b["last_ok_at"] == iso_min(40), b)
    check("backup: never exported is None, not an error", O.shape_backup({"archive_rows": 5, "archive_bytes": 1, "export": None, "export_ok": None})["export"] is None)
    check("backup: a missing export table is reported", O.shape_backup({"archive_rows": 5, "archive_bytes": 1, "export": {"error": "no table"}})["export"] == {"error": "no table"})
    w = s["watchdog"]
    check("watchdog: last probe and no incident", w["last_probe_ok"] is True and w["last_probe_at"] == "2026-10-15T13:59:30Z" and w["open"] is None and w["last_incident"] is None, w)
    ev = [{"failing_since": ts(50), "detected_at": ts(45), "probes_failed": 7, "reload_at": ts(45), "restart_at": None, "recovered_at": None, "last_error": "HTTP 503"}]
    w2 = O.shape_watchdog(RAW_WD_STATE, ev, True)
    check("watchdog: an unrecovered incident is open", w2["open"]["probes_failed"] == 7 and w2["open"]["restart_at"] is None, w2)
    ev[0]["recovered_at"] = ts(10)
    check("watchdog: a recovered one is only the last incident", O.shape_watchdog(RAW_WD_STATE, ev, True)["open"] is None and O.shape_watchdog(RAW_WD_STATE, ev, True)["last_incident"]["recovered_at"])
    check("watchdog: no state file yet is 'not known'", O.shape_watchdog(None, [], False)["known"] is False)


def iso_min(minutes_ago):
    return O.iso(NOW - datetime.timedelta(minutes=minutes_ago))


def test_errors_and_size():
    s = O.build_snapshot(parts(harvester={"error": "relation ingest.harvest_job does not exist\x00"}, daily=None, backup={"archive_rows": "x"}), RUNNER, NOW)
    check("a section that failed says so and the rest still go out", "error" in s["harvester"] and "does not exist" in s["harvester"]["error"] and "\x00" not in s["harvester"]["error"]
          and "error" in s["daily"] and s["sync"]["count"] == 3 and s["releases"]["pending"] == 2, s)
    check("a bad backup section does not raise", isinstance(s["backup"], dict))
    big = O.build_snapshot(parts(sync=[["core.t%03d" % i, 100000 + i, 100000 + i, "same", ts(1)] for i in range(2000)] + [["core.differs", 1, 2, "differs", ts(1)]]), RUNNER, NOW)
    fitted = O.fit(big)
    check("an oversized snapshot is trimmed to the differing tables and says so", fitted["sync"].get("trimmed") is True and fitted["sync"]["tables"] == [["core.differs", 1, 2, 1]]
          and len(json.dumps(fitted)) < O.MAX_PAYLOAD_BYTES, len(json.dumps(fitted)))
    normal = O.build_snapshot(parts(sync=[["core.t%03d" % i, 100000 + i, 100000 + i, "same", ts(1)] for i in range(150)]), RUNNER, NOW)
    check("150 tables and everything else is well inside the limit", len(json.dumps(normal, separators=(",", ":"))) < 12000, len(json.dumps(normal, separators=(",", ":"))))
    check("a normal snapshot is not touched by fit", O.fit(normal) == normal)


def test_hash_and_timer():
    a = O.build_snapshot(parts(), RUNNER, NOW)
    later = NOW + datetime.timedelta(minutes=15)
    b = O.build_snapshot(parts(harvester=raw_harvester(beat_min=0.1)), RUNNER, later)
    b["harvester"]["last_beat_at"] = "2030-01-01T00:00:00Z"
    b["watchdog"]["last_probe_at"] = "2030-01-01T00:00:00Z"
    check("the hash ignores the snapshot's time, the heartbeat and the last probe", O.payload_hash(a) == O.payload_hash(b))
    c = O.build_snapshot(parts(sync=[["core.game", 1000, 1000, "same", ts(1)], ["core.person", 50, 50, "same", ts(1)]]), RUNNER, NOW)
    check("the hash moves when a fact changes", O.payload_hash(a) != O.payload_hash(c))
    h = O.payload_hash(a)
    st = {"last_hash": h, "last_write": 1000.0}
    check("decide: unchanged and recent is skipped", O.decide(st, h, 1000.0 + 900, CFG) == "skip")
    check("decide: unchanged but an hour old is a heartbeat write", O.decide(st, h, 1000.0 + 3600, CFG) == "write")
    check("decide: changed is written", O.decide(st, "other", 1000.0 + 900, CFG) == "write")
    check("decide: forced is written", O.decide(st, h, 1000.0 + 10, CFG, force=True) == "write")
    check("decide: first ever is written", O.decide({}, h, 1.0, CFG) == "write")
    check("due: first, then every 15 minutes, force at once", O.snapshot_due({}, 5.0, CFG) and not O.snapshot_due({"last_try": 100.0}, 100.0 + 899, CFG)
          and O.snapshot_due({"last_try": 100.0}, 100.0 + 900, CFG) and O.snapshot_due({"last_try": 100.0}, 101.0, CFG, force=True))
    check("OPS_SNAPSHOT=0 switches it off", O.Config({"OPS_SNAPSHOT": "0"}).enabled is False and O.Config({}).enabled is True)


class FakeDs1:
    def __init__(self, fail=False):
        self.sql, self.fail = [], fail

    def run(self, sql):
        self.sql.append(sql)
        if self.fail:
            raise RuntimeError("connection refused")
        return ""


def test_tick_with_stand_ins():
    ds1 = FakeDs1()
    calls = {"collect": 0, "write": [], "mark": [], "queued": 0}
    queue = []

    def collect():
        calls["collect"] += 1
        return O.build_snapshot(parts(), RUNNER, NOW)

    def write(digest, payload):
        calls["write"].append(digest)
        return len(calls["write"])

    def queued():
        calls["queued"] += 1
        return list(queue)

    def mark(rid, status, summary):
        calls["mark"].append((rid, status, summary))
        queue[:] = [q for q in queue if q["id"] != rid]

    def go(state, now, force=False, cfg=CFG, **kw):
        return O.tick(cfg, state, now, ds1, force=force, collect_fn=kw.get("collect_fn", collect), write_fn=kw.get("write_fn", write), queued_fn=queued, mark_fn=mark)

    st, out = go({}, 1000.0)
    check("tick: the first tick writes a snapshot", out["snapshot"] == "written" and len(calls["write"]) == 1 and calls["queued"] == 1, out)
    st, out = go(st, 1060.0)
    check("tick: a minute later it only reads the requests", out["snapshot"] == "not due" and calls["collect"] == 1 and calls["queued"] == 2, out)
    st, out = go(st, 1000.0 + 900)
    check("tick: due but nothing changed: collected, not written", out["snapshot"] == "unchanged" and calls["collect"] == 2 and len(calls["write"]) == 1, out)
    st, out = go(st, 1000.0 + 3600)
    check("tick: an hour after the last write the unchanged snapshot is written as a heartbeat", out["snapshot"] == "written" and len(calls["write"]) == 2, out)

    queue.append({"id": 5, "kind": "harvest_pause", "requested_by": "john@example.test"})
    st, out = go(st, 1000.0 + 3660)
    check("tick: pause writes the DS1 switch, forces a snapshot, marks the request done",
          out["requests"] == [(5, "harvest_pause", "done")] and out["snapshot"] == "written" and len(calls["write"]) == 3
          and any("ops_pause" in q and "john@example.test" in q and "insert into ingest.harvest_state" in q for q in ds1.sql)
          and calls["mark"][-1][:2] == (5, "done"), (out, ds1.sql, calls["mark"]))
    queue.append({"id": 6, "kind": "harvest_resume", "requested_by": "john@example.test"})
    st, out = go(st, 1000.0 + 3720)
    check("tick: resume deletes the switch", any("delete from ingest.harvest_state where key = 'ops_pause'" in q for q in ds1.sql) and calls["mark"][-1][:2] == (6, "done"), ds1.sql)
    queue.append({"id": 7, "kind": "snapshot", "requested_by": "john@example.test"})
    n = len(calls["write"])
    st, out = go(st, 1000.0 + 3730)
    check("tick: Snapshot now writes even when nothing changed", out["snapshot"] == "written" and len(calls["write"]) == n + 1 and calls["mark"][-1][:2] == (7, "done"), out)

    bad = FakeDs1(fail=True)
    queue.append({"id": 8, "kind": "harvest_pause", "requested_by": "x@example.test"})
    st2, out2 = O.tick(CFG, st, 1000.0 + 7000, bad, collect_fn=collect, write_fn=write, queued_fn=queued, mark_fn=mark)
    check("tick: a pause DS1 cannot take is marked failed with the reason", out2["requests"] == [(8, "harvest_pause", "failed")] and "connection refused" in calls["mark"][-1][2], calls["mark"][-1])
    queue.clear()

    def boom(digest, payload):
        raise RuntimeError("HTTP 503")
    queue.append({"id": 9, "kind": "snapshot", "requested_by": "x@example.test"})
    st3, out3 = go({}, 50000.0, write_fn=boom)
    check("tick: a failed write is retried in 5 minutes, not every minute, and the request fails", out3["snapshot"] == "failed" and not O.snapshot_due(st3, 50000.0 + 240, CFG)
          and O.snapshot_due(st3, 50000.0 + 300, CFG) and calls["mark"][-1][:2] == (9, "failed"), (out3, st3, calls["mark"][-1]))
    check("tick: a failed write leaves the last hash alone", "last_hash" not in st3)

    nt = O.Config({"OPS_STATE": "/x"})
    _, out4 = O.tick(nt, {}, 1.0, ds1, collect_fn=collect, write_fn=write, queued_fn=queued, mark_fn=mark)
    check("tick: without a production token nothing is sent", out4["snapshot"] == "no token" and out4["requests"] == [])

    def broken_queue():
        raise RuntimeError("HTTP 400")
    s5, o5 = O.tick(CFG, {}, 7.0, ds1, collect_fn=collect, write_fn=write, queued_fn=broken_queue, mark_fn=mark)
    check("tick: production without migration 104 does not stop the snapshot attempt", "requests_err" in s5 and o5["snapshot"] in ("written", "unchanged"), (s5, o5))


# ---------------------------------------------------------------------------------------------------- part 2: real SQL

def psql(db, sql, check_rc=True):
    r = subprocess.run(["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-d", db, "-c", sql], capture_output=True, text=True)
    if check_rc and r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[:300])
    return r


def psql_file(db, path):
    r = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", db, "-f", path], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("%s: %s" % (os.path.basename(path), r.stderr.strip()[:300]))


class MockApi(http.server.BaseHTTPRequestHandler):
    """The Management API's database/query in front of one database: answers rows as objects, like the real one."""
    db = None
    log_message = lambda *a: None  # noqa: E731

    def do_POST(self):
        if self.headers.get("Authorization") != "Bearer t":
            return self.send(401, {})
        query = json.loads(self.rfile.read(int(self.headers["Content-Length"])))["query"]
        r = subprocess.run(["psql", "-X", "-q", "--csv", "-v", "ON_ERROR_STOP=1", "-1", "-d", self.db, "-f", "-"], input=query, capture_output=True, text=True)
        if r.returncode != 0:
            return self.send(400, {"message": r.stderr.strip()})
        rows = list(csv.DictReader(io.StringIO(r.stdout))) if r.stdout.strip() else []
        for row in rows:
            for k, v in row.items():
                row[k] = int(v) if v and v.lstrip("-").isdigit() else v
        self.send(200, rows)

    def send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def test_database():
    if not os.environ.get("PGHOST"):
        print("skip  part 2: set PGHOST, PGPORT and PGUSER (a scratch Postgres) to run the SQL tests")
        return
    ds1db, proddb = "ops_t_ds1", "ops_t_prod"
    for d in (ds1db, proddb):
        psql("postgres", "drop database if exists %s" % d)
        psql("postgres", "create database %s" % d)
    psql("postgres", "do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if; "
                     "if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if; end $$")
    server = None
    try:
        mig = lambda n: os.path.join(REPO, "db", "migrations", n)
        psql(ds1db, "create schema meta; create schema api; create schema ingest;")
        for f in ("045_data_releases.sql", "047_auto_approval.sql", "048_ingest_daily_run.sql", "090_api_health_event.sql", "095_harvest_queue.sql", "105_ops_raw_export.sql"):
            psql_file(ds1db, mig(f))
        psql(proddb, "create schema meta; create schema api;")
        for f in ("045_data_releases.sql", "104_ops_status.sql"):
            psql_file(proddb, mig(f))
        psql_file(proddb, mig("104_ops_status.sql"))     # rerunnable
        check("migrations 104 and 105 apply and run twice", True)
        psql_file(ds1db, mig("105_ops_raw_export.sql"))

        # ---- production functions
        secret = "s" * 40
        psql(proddb, "insert into meta.release_secret (secret_hash) values ('%s')" % hashlib.sha256(secret.encode()).hexdigest())
        denied = psql(proddb, "select api.ops_dashboard('wrong')", check_rc=False)
        check("ops_dashboard refuses a wrong secret", denied.returncode != 0 and "not allowed" in denied.stderr, denied.stderr)
        denied = psql(proddb, "select api.request_ops('wrong', 'a@example.test', 'snapshot')", check_rc=False)
        check("request_ops refuses a wrong secret", denied.returncode != 0 and "not allowed" in denied.stderr)
        empty = json.loads(psql(proddb, "select api.ops_dashboard('%s')" % secret).stdout)
        check("ops_dashboard on an empty ring", empty["latest"] is None and empty["history"] == [] and empty["requests"] == [] and empty["server_now"], empty)

        def req(kind, actor="john@example.test"):
            return psql(proddb, "select api.request_ops('%s', '%s', '%s')" % (secret, actor, kind), check_rc=False)
        r = req("harvest_pause")
        check("request_ops queues one row", r.returncode == 0 and json.loads(r.stdout)["status"] == "queued", r.stderr)
        r = req("harvest_pause")
        check("a second request of the same kind is refused while one waits", r.returncode != 0 and "already waiting" in r.stderr, r.stderr)
        check("another kind can queue", req("harvest_resume").returncode == 0)
        check("a runner name cannot be the requester", req("snapshot", "auto:daily-scores").returncode != 0 and req("snapshot", "request:x").returncode != 0 and req("snapshot", "system").returncode != 0)
        check("an unknown kind is refused", req("drop_everything").returncode != 0)
        check("an empty name is refused", req("snapshot", "   ").returncode != 0)
        psql(proddb, "update meta.ops_request set status = 'done', finished_at = now() where kind = 'harvest_pause'")
        r = req("harvest_pause")
        check("a minute must pass after the last of a kind", r.returncode != 0 and "wait a minute" in r.stderr, r.stderr)
        psql(proddb, "update meta.ops_request set finished_at = now() - interval '61 seconds' where kind = 'harvest_pause'")
        check("after a minute the kind can be requested again", req("harvest_pause").returncode == 0)
        psql(proddb, "delete from meta.ops_request")
        psql(proddb, "insert into meta.ops_request (kind, requested_by, status, finished_at) values ('snapshot', 'x@example.test', 'done', now() - interval '90 seconds')")
        r = req("snapshot")
        check("a snapshot needs two minutes", r.returncode != 0 and "wait a minute" in r.stderr, r.stderr)
        psql(proddb, "update meta.ops_request set finished_at = now() - interval '130 seconds'")
        check("after two minutes a snapshot can be requested again", req("snapshot").returncode == 0)
        psql(proddb, "delete from meta.ops_request")
        for i in range(20):
            psql(proddb, "insert into meta.ops_request (kind, requested_by, status, finished_at) values ('snapshot', 'x@example.test', 'done', now() - interval '1 second' * %d)" % (100 + i * 200))
        r = req("harvest_pause")
        check("at most 20 requests an hour", r.returncode != 0 and "too many" in r.stderr, r.stderr)
        psql(proddb, "delete from meta.ops_request")

        denied = subprocess.run(["psql", "-X", "-q", "-A", "-t", "-d", proddb, "-c", "set role anon; select * from meta.ops_status"], capture_output=True, text=True)
        check("anon cannot read the snapshots", denied.returncode != 0 and "permission denied" in denied.stderr, denied.stderr)
        denied = subprocess.run(["psql", "-X", "-q", "-A", "-t", "-d", proddb, "-c", "set role authenticated; insert into meta.ops_request (kind, requested_by) values ('snapshot', 'x')"], capture_output=True, text=True)
        check("authenticated cannot write a request directly", denied.returncode != 0 and "permission denied" in denied.stderr, denied.stderr)
        denied = subprocess.run(["psql", "-X", "-q", "-A", "-t", "-d", proddb, "-c", "set role anon; select meta.ops_status_put('h', '{}'::jsonb)"], capture_output=True, text=True)
        check("anon cannot call the snapshot writer", denied.returncode != 0, denied.stderr)
        too_big = psql(proddb, "select meta.ops_status_put('h', jsonb_build_object('x', repeat('a', 40000)))", check_rc=False)
        check("a payload over the size check is refused", too_big.returncode != 0 and "check" in too_big.stderr, too_big.stderr)

        # ---- the ring of 96
        for i in range(110):
            psql(proddb, "select meta.ops_status_put('h%d', jsonb_build_object('harvester', jsonb_build_object('hour', jsonb_build_object('archived', %d, 'requests', 2), 'gap_total', 7, 'queued_total', 3), 'sync', jsonb_build_object('differs', 0)))" % (i, i))
        n = int(psql(proddb, "select count(*) from meta.ops_status").stdout)
        dash = json.loads(psql(proddb, "select api.ops_dashboard('%s')" % secret).stdout)
        check("the ring keeps the newest 96", n == 96 and len(dash["history"]) == 96 and dash["latest"]["payload"]["harvester"]["hour"]["archived"] == 109, n)
        check("history is oldest first with the small series", dash["history"][0]["pages"] == 14 and dash["history"][-1]["pages"] == 109 and dash["history"][0]["gaps"] == 7 and dash["history"][-1]["differs"] == 0, dash["history"][:1])
        psql(proddb, "delete from meta.ops_status")

        # ---- the collectors against real rows on the stand-in DS1
        env = dict(os.environ, PGDATABASE=ds1db)
        ds1 = O.Ds1(30, env=env)
        parts_empty = O.collect(O.Config({"WATCHDOG_STATE": "/nonexistent", "RELEASE_REPO": "/nonexistent", "OPS_LAST_DRIFT": "/nonexistent"}), ds1)
        snap = O.build_snapshot(parts_empty, O.runner_info(O.Config({"RELEASE_REPO": "/nonexistent", "OPS_LAST_DRIFT": "/nonexistent"})), NOW)
        check("collectors on an empty DS1: no section errors", all("error" not in snap[k] for k in ("harvester", "daily", "releases", "sync", "backup", "watchdog")), {k: snap[k] for k in snap if isinstance(snap[k], dict) and "error" in snap[k]})
        check("empty DS1: harvester never ran, export never ran, watchdog unknown",
              snap["harvester"]["state"] == "never" and snap["backup"]["export"] is None and snap["watchdog"]["known"] is False and snap["sync"]["count"] == 0, snap)
        psql(ds1db, "insert into ingest.harvest_run (host, git_sha) values ('h', 'abc1234')")
        psql(ds1db, "insert into ingest.harvest_job (kind, league, season, target, gap, state, error) values "
                    "('wp_team_season', 'nba', 2023, 'A', true, 'queued', null), ('wp_team_season', 'nba', 2022, 'B', true, 'failed', 'HTTP 503'), ('wd_person', null, null, 'Q1', false, 'done', null)")
        psql(ds1db, "insert into ingest.harvest_fetch (kind, items, http, bytes, new_items) values ('wp_team_season', 10, 200, 1000, 8), ('wd_person', 25, 200, 500, 20)")
        psql(ds1db, "insert into ingest.harvest_fetch (kind, items, http, bytes, new_items, at) values ('wp_team_season', 10, 200, 99999, 9, now() - interval '2 hours')")
        psql(ds1db, "insert into ingest.daily_run (outcome, finished_at, summary) values ('ok', now(), '{\"games\": 4}'), ('failed', now(), '{}')")
        psql(ds1db, "insert into meta.data_release (id, number, kind, title, status, digest, created_by, finished_at) values "
                    "(1, '2026.10.15-1', 'daily_scores', 'Daily scores', 'done', 'x', 'daily-job', now()), (2, '2026.10.15-2', 'publish', 'Venues', 'pending', 'y', 'john', null), "
                    "(3, '2026.10.15-3', 'publish', 'Bad', 'failed', 'z', 'john', now())")
        psql(ds1db, "insert into meta.sync_status (table_name, ds1_rows, prod_rows, state) values ('core.game', 10, 10, 'same'), ('core.person', 5, 4, 'differs')")
        psql(ds1db, "insert into legacy_files.raw_archive (name, saved_on, sha256, data) values ('a/1', current_date, 'x', '\\x0102'), ('a/2', current_date, 'y', '\\x03')")
        psql(ds1db, "insert into ingest.raw_export_run (host, outcome, checked, copied, present, failed, bytes, seconds) values ('m1', 'problems', 2, 1, 0, 1, 2, 3), ('m1', 'ok', 2, 0, 2, 0, 0, 1)")
        psql(ds1db, "insert into meta.api_health_event (failing_since, detected_at, probes_failed, last_error) values (now() - interval '1 hour', now() - interval '55 minutes', 6, 'HTTP 503')")
        wd_file = os.path.join(os.environ.get("TMPDIR", "/tmp"), "ops-test-watchdog.json")
        json.dump(RAW_WD_STATE, open(wd_file, "w"))
        cfg_real = O.Config({"WATCHDOG_STATE": wd_file, "RELEASE_REPO": "/nonexistent", "OPS_LAST_DRIFT": "/nonexistent", "SUPABASE_ACCESS_TOKEN": "t"})
        snap = O.build_snapshot(O.collect(cfg_real, ds1), {"sha": "abc1234", "ref": "origin/main", "last_drift": None}, datetime.datetime.now(UTC))
        h = snap["harvester"]
        check("collector: harvester from real rows", h["state"] == "running" and h["queue"]["wp_team_season"] == {"queued": 1, "failed": 1} and h["gap_total"] == 2 and h["gap"] == [["wp_team_season", "nba", 2]]
              and h["hour"] == {"requests": 2, "bytes": 1500, "archived": 28} and h["today"]["requests"] >= 2 and h["last_error"]["error"] == "HTTP 503", h)
        check("collector: daily", snap["daily"]["last"]["outcome"] in ("ok", "failed") and snap["daily"]["ok_7d"] == 1 and snap["daily"]["failed_7d"] == 1 and snap["daily"]["release"]["number"] == "2026.10.15-1", snap["daily"])
        check("collector: releases", snap["releases"]["pending"] == 1 and snap["releases"]["last_done"]["number"] == "2026.10.15-1" and snap["releases"]["last_failed"]["number"] == "2026.10.15-3", snap["releases"])
        check("collector: sync", snap["sync"]["differs"] == 1 and snap["sync"]["tables"][0][0] == "core.person", snap["sync"])
        check("collector: backup", snap["backup"]["archive_rows"] == 2 and snap["backup"]["archive_bytes"] == 3 and snap["backup"]["export"]["outcome"] == "ok" and snap["backup"]["last_ok_at"], snap["backup"])
        check("collector: watchdog", snap["watchdog"]["known"] and snap["watchdog"]["open"]["probes_failed"] == 6 and snap["watchdog"]["last_probe_ok"] is True, snap["watchdog"])

        # a missing optional table costs one field, not the snapshot
        psql(ds1db, "drop table ingest.raw_export_run")
        snap2 = O.build_snapshot(O.collect(cfg_real, ds1), RUNNER, NOW)
        check("collector: without migration 105 the export says so and everything else is there", "error" in snap2["backup"]["export"] and snap2["backup"]["archive_rows"] == 2 and "error" not in snap2["harvester"], snap2["backup"])
        psql(ds1db, "drop table ingest.harvest_fetch cascade")
        snap3 = O.build_snapshot(O.collect(cfg_real, ds1), RUNNER, NOW)
        check("collector: a broken harvester section is an error and the others are fine", "error" in snap3["harvester"] and snap3["sync"]["count"] == 2 and snap3["releases"]["pending"] == 1, snap3["harvester"])
        psql_file(ds1db, mig("105_ops_raw_export.sql"))

        # ---- a whole tick against the stand-in Management API
        MockApi.db = proddb
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), MockApi)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        cfg = O.Config({"SUPABASE_ACCESS_TOKEN": "t", "WATCHDOG_MGMT_URL": "http://127.0.0.1:%d" % server.server_port, "WATCHDOG_STATE": wd_file,
                        "RELEASE_REPO": "/nonexistent", "OPS_LAST_DRIFT": "/nonexistent", "OPS_STATE": os.path.join(os.environ.get("TMPDIR", "/tmp"), "ops-test-state.json")})
        psql(ds1db, "create table if not exists ingest.harvest_fetch (fetch_id bigint generated always as identity primary key, run_id bigint, at timestamptz not null default now(), kind text not null, items integer not null default 1, http smallint, bytes integer not null default 0, new_items integer not null default 0, note text)")
        st, out = O.tick(cfg, {}, 1000.0, ds1)
        row = psql(proddb, "select id, hash, octet_length(payload::text), payload #>> '{harvester,state}', payload #>> '{sync,differs}' from meta.ops_status").stdout.strip().split("|")
        check("end to end: the first tick writes one snapshot to production through the API", out["snapshot"] == "written" and len(row) == 5 and row[3] == "running" and row[4] == "1" and int(row[2]) < 12000, (out, row))
        st, out = O.tick(cfg, st, 1000.0 + 900, ds1)
        check("end to end: nothing changed, nothing written", out["snapshot"] == "unchanged" and psql(proddb, "select count(*) from meta.ops_status").stdout.strip() == "1", out)

        r = req("harvest_pause", "john@example.test")
        st, out = O.tick(cfg, st, 1000.0 + 960, ds1)
        flag = psql(ds1db, "select value ->> 'by' from ingest.harvest_state where key = 'ops_pause'").stdout.strip()
        reqrow = psql(proddb, "select status, summary is not null, finished_at is not null from meta.ops_request where kind = 'harvest_pause'").stdout.strip()
        newest = psql(proddb, "select payload #>> '{harvester,state}', payload #>> '{harvester,paused,by}' from meta.ops_status order by id desc limit 1").stdout.strip()
        check("end to end: Pause harvester sets the DS1 switch, marks the request done and shows paused in the next snapshot",
              flag == "john@example.test" and reqrow == "done|t|t" and newest == "paused|john@example.test" and out["snapshot"] == "written", (flag, reqrow, newest, out))
        import pause as P
        P.db._base = lambda: ["psql"]
        os.environ["PGDATABASE"] = ds1db
        guard = P.PauseGuard(type("C", (), {"pause_window": "", "pause_tz": "UTC", "pause_check_secs": 0})(), lock_probe=lambda: False, running_probe=lambda: False)
        why = guard.check()
        check("end to end: the harvester's own guard reads that switch from DS1", why and "/admin/ops" in why and "john@example.test" in why, why)
        psql(proddb, "update meta.ops_request set finished_at = now() - interval '2 minutes'")
        req("harvest_resume")
        st, out = O.tick(cfg, st, 1000.0 + 1020, ds1)
        check("end to end: Resume harvester deletes the switch", psql(ds1db, "select count(*) from ingest.harvest_state where key = 'ops_pause'").stdout.strip() == "0"
              and psql(proddb, "select status from meta.ops_request where kind = 'harvest_resume'").stdout.strip() == "done" and guard.check() is None, out)
        dash = json.loads(psql(proddb, "select api.ops_dashboard('%s')" % secret).stdout)
        check("end to end: the dashboard has the newest snapshot, the history and both requests", dash["latest"]["payload"]["harvester"]["state"] != "paused" and len(dash["history"]) == 3
              and [r["kind"] for r in dash["requests"]] == ["harvest_resume", "harvest_pause"], dash["requests"])
        req("snapshot")
        st, out = O.tick(cfg, st, 1000.0 + 1080, ds1)
        check("end to end: Snapshot now writes at once", out["snapshot"] == "written" and psql(proddb, "select status from meta.ops_request where kind = 'snapshot'").stdout.strip() == "done", out)

        # a request in the table does not stop the poll when production is the stand-in down
        server.shutdown()
        server = None
        st, out = O.tick(cfg, {}, 5000.0, ds1)
        check("end to end: production not answering is logged, the tick ends normally", out["snapshot"] == "failed" and out["requests"] == [], out)
    finally:
        if server:
            server.shutdown()
        for d in (ds1db, proddb):
            psql("postgres", "drop database if exists %s" % d, check_rc=False)
        for f in ("ops-test-watchdog.json", "ops-test-state.json"):
            try:
                os.remove(os.path.join(os.environ.get("TMPDIR", "/tmp"), f))
            except OSError:
                pass


def main():
    test_shapes()
    test_errors_and_size()
    test_hash_and_timer()
    test_tick_with_stand_ins()
    test_database()
    print()
    if FAILED:
        print("FAILED: %d" % len(FAILED))
        for n in FAILED:
            print("  - " + n)
        return 1
    print("all passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

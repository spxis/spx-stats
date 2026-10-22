#!/usr/bin/env python3
"""Tests of the ops snapshot and controls (scripts/release/ops.py, migrations 104 and 105).

    python3 -I scripts/release/test/test_ops.py

Part 1 is pure (the snapshot builder, the hash, the timer rules, the tick with stand-ins) and needs nothing.
Part 2 needs a Postgres server: set PGHOST, PGPORT and PGUSER (a scratch server, for example the harvest one:
`HARVEST_SCRATCH_PORT=7721 bash scripts/harvest/test/scratch.sh up`). It makes two throwaway databases on it, ops_t_ds1 (standing in for DS1:
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


def raw_scores(**over):
    """What Q_SCORES answers on a healthy day: every league's newest result is good, nothing waits. `over` replaces a league's raw part (lg=dict)
    or a top-level key (last_run, running)."""
    def lg(run_id=5, outcome="ok", reason=None, ok_min=60, **extra):
        res = {"outcome": outcome, "reason": reason, "games_skipped": 0, "clubs_skipped": [], "committed": True, "games_changed": 2}
        res.update(extra)
        return {"last": {"run_id": run_id, "at": ts(ok_min), "res": res}, "ok_at": ts(ok_min) if outcome in ("ok", "warning") else None, "changed_at": ts(ok_min),
                "waiting": {"n": 0, "overdue": 0, "oldest": None}, "sample": []}
    r = {"last_run": {"run_id": 5, "started_at": ts(65), "finished_at": ts(60), "outcome": "ok", "error": None, "has_results": True}, "running": False,
         "leagues": {x: lg() for x in O.SCORE_LEAGUES}}
    for k, v in over.items():
        if k in O.SCORE_LEAGUES:
            r["leagues"][k] = v
        else:
            r[k] = v
    return r


THR = {"stale": 6.0, "overdue": 12.0, "no_run": 20.0}


def parts(**over):
    p = {"harvester": raw_harvester(), "daily": RAW_DAILY, "releases": RAW_RELEASES, "sync": RAW_SYNC, "backup": RAW_BACKUP, "scores": raw_scores(),
         "watchdog": {"state": RAW_WD_STATE, "events": [], "enabled": True}}
    p.update(over)
    return p


def test_shapes():
    s = O.build_snapshot(parts(), RUNNER, NOW)
    check("snapshot: has every section and the time", set(s) == {"v", "at", "harvester", "daily", "scores", "watchdog", "releases", "sync", "backup"} and s["at"] == "2026-10-15T14:00:00Z", s.keys())
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
        return O.tick(cfg, state, now, ds1, force=force, collect_fn=kw.get("collect_fn", collect), write_fn=kw.get("write_fn", write), queued_fn=queued, mark_fn=mark,
                      alert_fn=kw.get("alert_fn", lambda *a: True))

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


def lg_raw(run_id=5, outcome="ok", reason=None, ok_min=60, waiting=0, overdue=0, oldest=None, sample=(), ok_at="auto", **extra):
    """One league's raw part (what Q_SCORES answers for it), the newest result being `outcome` of run `run_id`, `ok_min` minutes before NOW."""
    res = {"outcome": outcome, "reason": reason, "games_skipped": 0, "clubs_skipped": [], "committed": outcome in ("ok", "warning"), "games_changed": 2}
    res.update(extra)
    good = ts(ok_min) if ok_at == "auto" and outcome in ("ok", "warning") else (ts(ok_at) if isinstance(ok_at, int) else None)
    return {"last": {"run_id": run_id, "at": ts(ok_min), "res": res}, "ok_at": good, "changed_at": good,
            "waiting": {"n": waiting, "overdue": overdue, "oldest": oldest}, "sample": [list(x) for x in sample]}


def scores_of(**over):
    return O.shape_scores(raw_scores(**over), NOW, THR)


def league(sc, lg):
    return next(x for x in sc["leagues"] if x["league"] == lg)


def test_scores():
    sc = O.shape_scores(raw_scores(), NOW, THR)
    check("scores: five leagues in the job's order, all healthy, no flags", [x["league"] for x in sc["leagues"]] == ["nhl", "nba", "mlb", "nfl", "cfl"]
          and all(x["outcome"] == "ok" and x["flags"] == [] for x in sc["leagues"]) and sc["no_run"] is False and sc["quiet_hours"] == 1, sc)
    check("scores: the limits travel with the snapshot", sc["limits"] == {"stale": 6.0, "overdue": 12.0, "no_run": 20.0})
    # the incident: one league failed every run since the evening, the others saved
    bad = lg_raw(run_id=5, outcome="failed", reason="a check failed: 30 NBA team seasons without an identity", ok_min=10, ok_at=2000)
    sc = scores_of(nba=bad)
    nba = league(sc, "nba")
    check("scores: a league that failed says so in the job's words, with its last good load", nba["outcome"] == "failed" and "identity" in nba["reason"] and nba["ok_at"] == O.iso(NOW - datetime.timedelta(minutes=2000)), nba)
    check("scores: failed with no good load for over 6 hours is stale", "stale" in nba["flags"] and nba["stale_hours"] == 33, nba)
    check("scores: the others are untouched", all(x["flags"] == [] for x in sc["leagues"] if x["league"] != "nba"))
    sc = scores_of(nba=lg_raw(run_id=5, outcome="failed", reason="x", ok_min=10, ok_at=200))
    check("scores: failed but a good load 3 hours ago is not stale yet", league(sc, "nba")["flags"] == [], league(sc, "nba"))
    sc = scores_of(nba=lg_raw(run_id=5, outcome="failed", reason="x", ok_min=10, ok_at=None))
    check("scores: failed and never good in 30 days is stale", league(sc, "nba")["flags"] == ["stale"] and league(sc, "nba")["stale_hours"] is None)
    sc = scores_of(cfl=lg_raw(run_id=5, outcome="skipped", reason="pages missing: 2027 Toronto Argonauts season", ok_min=900, ok_at=900))
    check("scores: skipped with nothing waiting (out of season) raises nothing", league(sc, "cfl")["flags"] == [], league(sc, "cfl"))
    sc = scores_of(cfl=lg_raw(run_id=5, outcome="skipped", reason="pages missing: x", ok_min=900, ok_at=900, waiting=2, overdue=0))
    check("scores: skipped with games waiting is stale", "stale" in league(sc, "cfl")["flags"], league(sc, "cfl"))
    sc = scores_of(mlb=lg_raw(outcome="warning", reason="left out: 1 club(s) (X), 0 game(s)", clubs_skipped=["X"], games_skipped=3))
    check("scores: a warning is a good load that left something out", league(sc, "mlb")["outcome"] == "warning" and league(sc, "mlb")["flags"] == [] and league(sc, "mlb")["clubs_skipped"] == ["X"]
          and league(sc, "mlb")["games_skipped"] == 3)
    sample = [("2026-10-20", "Boston Bruins", "Toronto Maple Leafs"), ("2026-10-20", "A", "B"), ("2026-10-21", "C", "D"), ("2026-10-21", "E", "F")]
    sc = scores_of(nhl=lg_raw(waiting=7, overdue=3, oldest=ts(1500), sample=sample))
    nhl = league(sc, "nhl")
    check("scores: games played with no score for over 12 hours flag overdue, oldest first, three examples", nhl["flags"] == ["overdue"] and nhl["waiting"] == 7 and nhl["overdue"] == 3
          and len(nhl["sample"]) == 3 and nhl["sample"][0] == ["2026-10-20", "Boston Bruins", "Toronto Maple Leafs"] and nhl["oldest"] == iso_min(1500), nhl)
    sc = scores_of(nhl=lg_raw(waiting=7, overdue=0, oldest=ts(300)))
    check("scores: games waiting for under 12 hours only show, they do not flag", league(sc, "nhl")["flags"] == [] and league(sc, "nhl")["waiting"] == 7)
    # a whole run that stopped: no per-league results at all
    crashed = {"run_id": 6, "started_at": ts(30), "finished_at": ts(29), "outcome": "failed", "error": "RuntimeError: DS1 gone", "has_results": False}
    sc = scores_of(last_run=crashed, **{x: lg_raw(run_id=5, ok_min=500) for x in O.SCORE_LEAGUES})
    check("scores: a run that stopped as a whole is every league's last attempt", all(x["outcome"] == "failed" and "whole run stopped: RuntimeError: DS1 gone" in x["reason"] for x in sc["leagues"]), sc["leagues"][0])
    check("scores: ... and flags them once the last good load is over 6 hours old", all("stale" in x["flags"] for x in sc["leagues"]) and league(sc, "nhl")["stale_hours"] == 8)
    sc = scores_of(last_run=dict(crashed, run_id=4), **{x: lg_raw(run_id=5, ok_min=500) for x in O.SCORE_LEAGUES})
    check("scores: a stopped run older than the league's own result does not count", all(x["outcome"] == "ok" for x in sc["leagues"]))
    partial = {"run_id": 7, "started_at": ts(20), "finished_at": ts(19), "outcome": "failed", "error": None, "has_results": True}
    sc = scores_of(last_run=partial, nba=lg_raw(run_id=7, outcome="failed", reason="a check failed", ok_min=19, ok_at=2000))
    check("scores: a run limited to one league that failed blames that league only", [x["league"] for x in sc["leagues"] if x["outcome"] == "failed"] == ["nba"])
    check("scores: no run recorded at all is not an alarm, just unknown", O.shape_scores({"last_run": None, "running": False, "leagues": {}}, NOW, THR)["leagues"][0]["outcome"] == "unknown"
          and O.shape_scores({"last_run": None, "running": False, "leagues": {}}, NOW, THR)["no_run"] is False)
    sc = scores_of(last_run={"run_id": 5, "started_at": ts(21 * 60), "finished_at": ts(21 * 60 - 5), "outcome": "ok", "error": None, "has_results": True})
    check("scores: no run has started for over 20 hours", sc["no_run"] is True and sc["quiet_hours"] == 21, sc["quiet_hours"])
    check("scores: ... unless one is running now", scores_of(last_run={"run_id": 5, "started_at": ts(21 * 60), "finished_at": ts(21 * 60 - 5), "outcome": "ok", "error": None, "has_results": True}, running=True)["no_run"] is False)
    # sizes and cleanliness
    fat = scores_of(nba=lg_raw(outcome="failed", reason="a " * 400 + "\x00", ok_min=10, ok_at=None, clubs_skipped=["club %d" % i for i in range(30)]))
    check("scores: the reason is cut, controls removed, clubs capped at six", len(league(fat, "nba")["reason"]) <= 240 and "\x00" not in league(fat, "nba")["reason"] and len(league(fat, "nba")["clubs_skipped"]) == 6)
    check("scores: the whole section is a few KB", len(json.dumps(scores_of(**{x: lg_raw(waiting=5, overdue=5, sample=sample) for x in O.SCORE_LEAGUES}))) < 6000)
    check("scores: a section that cannot be read is an error section, the others stay", O.build_snapshot(parts(scores={"error": "relation ingest.daily_run does not exist"}), RUNNER, NOW)["scores"] == {"error": "relation ingest.daily_run does not exist"}
          and "error" not in O.build_snapshot(parts(scores={"error": "x"}), RUNNER, NOW)["harvester"])
    a = O.build_snapshot(parts(), RUNNER, NOW)
    b = O.build_snapshot(parts(), RUNNER, NOW + datetime.timedelta(minutes=14))
    check("scores: a quiet quarter hour does not change the snapshot's hash", O.payload_hash(a) == O.payload_hash(b))


def test_score_alerts():
    sc = scores_of(nba=lg_raw(run_id=5, outcome="failed", reason="a check failed: 30 NBA team seasons without an identity", ok_min=10, ok_at=2000),
                   nhl=lg_raw(waiting=7, overdue=3, oldest=ts(1500), sample=[("2026-10-20", "Boston Bruins", "Toronto Maple Leafs")]))
    want = O.score_alert_wants(sc)
    check("alerts: a failing stale league, an overdue league", sorted(want) == ["scores-overdue:nhl", "scores-stale:nba"], sorted(want))
    scope, msg, sev = want["scores-stale:nba"]
    check("alerts: the stale one is an error that names the league, the hours and the reason", scope == "nba" and sev == "error" and msg.startswith("NBA scores have had no good load for 33 hours") and "identity" in msg, msg)
    scope, msg, sev = want["scores-overdue:nhl"]
    check("alerts: the overdue one is a warning that names the games and the oldest", sev == "warning" and "3 game(s)" in msg and "12 hours" in msg and "Boston Bruins at Toronto Maple Leafs" in msg, msg)
    cfl_none = scores_of(last_run={"run_id": 5, "started_at": ts(25 * 60), "finished_at": ts(25 * 60 - 5), "outcome": "ok", "error": None, "has_results": True})
    w2 = O.score_alert_wants(cfl_none)
    check("alerts: the job that stopped running is one error alert", list(w2) == ["scores-no-run"] and "25 hours" in w2["scores-no-run"][1] and w2["scores-no-run"][2] == "error", w2)
    check("alerts: a healthy day wants none", O.score_alert_wants(scores_of()) == {})
    check("alerts: an unreadable section wants none and resolves none", O.score_alert_wants({"error": "x"}) == {} and O.score_alert_plan({"error": "x"}, {"scores-stale:nba": 1.0}, 99.0) == [])
    plan = O.score_alert_plan(sc, {}, 1000.0)
    check("plan: a new problem is raised", sorted((k, w) for k, w, *_ in plan) == [("scores-overdue:nhl", "raise"), ("scores-stale:nba", "raise")], plan)
    plan = O.score_alert_plan(sc, {"scores-stale:nba": 1000.0, "scores-overdue:nhl": 1000.0}, 1000.0 + 15 * 60)
    check("plan: one already raised is not raised again every snapshot", plan == [], plan)
    plan = O.score_alert_plan(sc, {"scores-stale:nba": 1000.0, "scores-overdue:nhl": 1000.0}, 1000.0 + 24 * 3600)
    check("plan: it is raised again after a day, so a dismissed alert comes back", sorted(k for k, w, *_ in plan if w == "raise") == ["scores-overdue:nhl", "scores-stale:nba"], plan)
    plan = O.score_alert_plan(scores_of(), {"scores-stale:nba": 1000.0, "scores-no-run": 1000.0}, 2000.0)
    check("plan: what cleared is resolved", sorted((k, w) for k, w, *_ in plan) == [("scores-no-run", "resolve"), ("scores-stale:nba", "resolve")], plan)

    # the tick: alerts are sent from the snapshot it collected, once, and remembered in the state
    sent = []
    ds1 = FakeDs1()
    snap = O.build_snapshot(parts(scores=raw_scores(nba=lg_raw(run_id=5, outcome="failed", reason="a check failed", ok_min=10, ok_at=2000))), RUNNER, NOW)
    kw = dict(collect_fn=lambda: snap, write_fn=lambda d, p: 1, queued_fn=lambda: [], mark_fn=lambda *a: None, alert_fn=lambda *a: sent.append(a))
    st, out = O.tick(CFG, {}, 1000.0, ds1, **kw)
    check("tick: the first snapshot with a stale league raises its alert once", [a[:2] for a in sent] == [("scores-stale:nba", "raise")] and st["score_alerts"] == {"scores-stale:nba": 1000.0}, (sent, st))
    st, out = O.tick(CFG, st, 1000.0 + 900, ds1, **kw)
    check("tick: the next snapshot (15 minutes later) raises nothing more", len(sent) == 1, sent)
    healthy = O.build_snapshot(parts(), RUNNER, NOW)
    kw["collect_fn"] = lambda: healthy
    st, out = O.tick(CFG, st, 1000.0 + 1800, ds1, **kw)
    check("tick: when the league is fine again the alert is resolved and forgotten", [a[:2] for a in sent] == [("scores-stale:nba", "raise"), ("scores-stale:nba", "resolve")] and st["score_alerts"] == {}, (sent, st))

    def boom(*a):
        raise RuntimeError("turso down")
    kw["collect_fn"] = lambda: snap
    kw["alert_fn"] = boom
    st2, out2 = O.tick(CFG, {}, 5000.0, ds1, **kw)
    check("tick: a failing alert write never fails the tick", out2["snapshot"] == "written", out2)

    import runlog_feed as RF
    check("runlog_feed.alert never raises and says False when nothing is configured", RF.alert("scores-stale:nba", "raise", "nba", "x") in (True, False) and RF.alert("k", "resolve") in (True, False))


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
        psql(ds1db, "create schema meta; create schema api; create schema ingest; create schema extensions;")
        for f in ("045_data_releases.sql", "047_auto_approval.sql", "048_ingest_daily_run.sql", "090_api_health_event.sql", "095_harvest_queue.sql", "105_ops_raw_export.sql", "001_core_schema.sql"):
            psql_file(ds1db, mig(f))
        psql(ds1db, "create function api.team_name(integer) returns text language sql as $$ select 'Team ' || $1 $$")
        psql(proddb, "create schema meta; create schema api;")
        for f in ("045_data_releases.sql", "053_score_update_requests.sql", "104_ops_status.sql", "150_score_request_league.sql"):
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

        # ---- the scores section against real rows: the heartbeat's per-league results and games that started and have no score
        psql(ds1db, "delete from ingest.daily_run")
        lr1 = {x: {"outcome": "ok", "reason": None, "games_changed": 3 if x == "nhl" else 0, "committed": True, "games_skipped": 0, "clubs_skipped": []} for x in O.SCORE_LEAGUES}
        lr2 = {"nhl": {"outcome": "ok", "games_changed": 0, "committed": True, "games_skipped": 0, "clubs_skipped": []},
               "nba": {"outcome": "failed", "reason": "a check failed: 30 NBA team seasons without an identity", "games_skipped": 0, "clubs_skipped": []},
               "mlb": {"outcome": "warning", "reason": "left out: 1 club(s) (Oakland), 0 game(s)", "games_changed": 1, "committed": True, "games_skipped": 0, "clubs_skipped": ["Oakland"]},
               "nfl": {"outcome": "ok", "games_changed": 0, "committed": True, "games_skipped": 0, "clubs_skipped": []},
               "cfl": {"outcome": "skipped", "reason": "pages missing: 2027 Toronto Argonauts season", "games_skipped": 0, "clubs_skipped": []}}
        psql(ds1db, "insert into ingest.daily_run (started_at, finished_at, outcome, summary) values "
                    "(now() - interval '30 hours', now() - interval '30 hours' + interval '5 minutes', 'ok', '%s'::jsonb), "
                    "(now() - interval '2 hours', now() - interval '2 hours' + interval '5 minutes', 'failed', '%s'::jsonb), "
                    "(now() - interval '1 minute', null, 'running', '{}'::jsonb)" % (json.dumps({"league_results": lr1}), json.dumps({"league_results": lr2, "exit_code": 1})))
        psql(ds1db, "set session_replication_role = replica; "
                    "insert into core.season (league_code, start_year, end_year, label) values ('nhl', 2026, 2027, 'a'), ('nba', 2026, 2027, 'b'), ('mlb', 2026, 2026, 'c'), ('wnba', 2026, 2026, 'd'); "
                    "insert into core.game (season_id, phase, game_date, starts_at, home_team_season_id, away_team_season_id, status, home_score, away_score, source_id, source_key) "
                    "select s.season_id, v.phase::core.season_phase, current_date - v.days, case when v.hours is null then null else now() - v.hours * interval '1 hour' end, v.h, v.a, v.st::core.game_status, v.hs, v.as_, 1, v.k "
                    "from (values ('nhl', 'regular', 2, 30, 1, 2, 'scheduled', null::int, null::int, 'g1'), ('nhl', 'regular', 1, 6, 3, 4, 'scheduled', null, null, 'g2'), "
                    "('nhl', 'regular', 0, 2, 5, 6, 'scheduled', null, null, 'g3'), ('nhl', 'regular', 2, 30, 7, 8, 'final', 3, 1, 'g4'), "
                    "('nhl', 'regular', 2, 30, 9, 10, 'postponed', null, null, 'g5'), ('nhl', 'preseason', 2, 30, 11, 12, 'scheduled', null, null, 'g6'), "
                    "('nhl', 'regular', 3, null, 13, 14, 'scheduled', null, null, 'g7'), ('wnba', 'regular', 2, 30, 15, 16, 'scheduled', null, null, 'g8'), "
                    "('nhl', 'regular', 40, 960, 17, 18, 'scheduled', null, null, 'g9')) as v(l, phase, days, hours, h, a, st, hs, as_, k) join core.season s on s.league_code = v.l")
        cfg_sc = O.Config({"WATCHDOG_STATE": "/nonexistent", "RELEASE_REPO": "/nonexistent", "OPS_LAST_DRIFT": "/nonexistent"})
        snap_sc = O.snapshot_now(cfg_sc, ds1)
        sc = snap_sc["scores"]
        check("scores SQL: the section reads without an error", "error" not in sc, sc)
        by = {x["league"]: x for x in sc["leagues"]} if "leagues" in sc else {}
        check("scores SQL: the last run is the newest finished one, the one still running is not", sc["last_run"]["outcome"] == "failed" and sc["running"] is True and sc["quiet_hours"] == 0, sc.get("last_run"))
        check("scores SQL: NBA failed in the last run, with the job's words, and its last good load is the run 30 hours ago",
              by["nba"]["outcome"] == "failed" and "identity" in by["nba"]["reason"] and by["nba"]["stale_hours"] == 29 and by["nba"]["flags"] == ["stale"], by.get("nba"))
        check("scores SQL: MLB saved but left a club out", by["mlb"]["outcome"] == "warning" and by["mlb"]["clubs_skipped"] == ["Oakland"] and by["mlb"]["flags"] == [], by.get("mlb"))
        check("scores SQL: CFL was skipped with nothing waiting: no flag", by["cfl"]["outcome"] == "skipped" and by["cfl"]["flags"] == [] and by["cfl"]["waiting"] == 0, by.get("cfl"))
        check("scores SQL: NHL has three games played with no score (30 h, 6 h, and a dated one), two of them over 12 hours, the final, the postponed one, the preseason one, the old one and WNBA left out",
              by["nhl"]["waiting"] == 3 and by["nhl"]["overdue"] == 2 and by["nhl"]["flags"] == ["overdue"], by.get("nhl"))
        check("scores SQL: the examples are the oldest games first (a game with no start time counts from the end of its date), with the team names",
              len(by["nhl"]["sample"]) == 3 and by["nhl"]["sample"][0] == [str(datetime.date.today() - datetime.timedelta(days=3)), "Team 14", "Team 13"] and by["nhl"]["sample"][1][1:] == ["Team 2", "Team 1"], by["nhl"]["sample"])
        check("scores SQL: the last time games changed is the run that changed some (30 hours ago for NHL, 2 hours ago for MLB)",
              by["nhl"]["changed_at"] and by["mlb"]["changed_at"] and by["nhl"]["changed_at"] < by["mlb"]["changed_at"], (by["nhl"]["changed_at"], by["mlb"]["changed_at"]))
        check("scores SQL: the other leagues' good load is the last run", by["nfl"]["ok_at"] > by["nba"]["ok_at"], (by["nfl"]["ok_at"], by["nba"]["ok_at"]))
        got = []
        O.send_score_alerts({}, snap_sc, 1000.0, lambda *a: got.append(a))
        check("scores SQL: the alerts that follow are NBA stale and NHL overdue", sorted(a[:2] for a in got) == [("scores-overdue:nhl", "raise"), ("scores-stale:nba", "raise")], got)
        psql(ds1db, "drop table ingest.daily_run cascade")
        broken = O.snapshot_now(cfg_sc, ds1)
        check("scores SQL: without the heartbeat table the section is an error and the rest is fine", "error" in broken["scores"] and "error" not in broken["sync"], broken["scores"])
        psql_file(ds1db, mig("048_ingest_daily_run.sql"))
        psql(ds1db, "delete from core.game; delete from core.season")

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
    test_scores()
    test_score_alerts()
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

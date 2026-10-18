#!/usr/bin/env python3
"""Tests of scripts/runlog/runlog.py against a local libSQL server (Docker, a port in 7740-7749; AGENTS.md section 6).

    docker run -d --name spx-libsql-test -p 127.0.0.1:7743:8080 ghcr.io/tursodatabase/libsql-server:latest
    python3 -I scripts/runlog/test/test_runlog.py [http://127.0.0.1:7743]      (remove the container by name afterwards)
"""
import json
import os
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import runlog as R  # noqa: E402

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:7743"
FAILS = []
tmp = tempfile.mkdtemp(prefix="spx-runlog-test-")
os.environ["TURSO_DATABASE_URL"] = URL
os.environ["TURSO_RUNLOG_TOKEN"] = ""
os.environ["RUNLOG_SPOOL"] = os.path.join(tmp, "spool.jsonl")


def check(cond, what):
    print(("ok   " if cond else "FAIL ") + what)
    if not cond:
        FAILS.append(what)


def q(sql, args=()):
    body = json.dumps({"requests": [{"type": "execute", "stmt": {"sql": sql, "args": [R._arg(a) for a in args]}}, {"type": "close"}]}).encode()
    req = urllib.request.Request(URL + "/v2/pipeline", data=body, headers={"content-type": "application/json"})
    res = json.loads(urllib.request.urlopen(req, timeout=10).read())["results"][0]["response"]["result"]
    return [[c.get("value") for c in row] for row in res["rows"]]


R._send([(f"drop table if exists {t}", []) for t in ("run_log", "run_log_item", "alert", "run_meta")])
R._schema_done = False

rl = R.Run("daily-scores", "job").start("run started")
rows = q("select outcome, finished_at, kind, job from run_log where uid = ?", [rl.uid])
check(rows == [["running", None, "job", "daily-scores"]], "start: the run shows as running, not finished")
rl.item("nhl", "ok", "3 games changed", {"games": 3})
rl.item("mlb", "failed", "a check failed", None, {"checks": ["club count"]})
check(rl.finish("warning", "4 ok, 1 failed", {"games": 3}, {"x": 1}, {"release": "2026.10.18-1"}), "finish writes")
rows = q("select outcome, summary, counts, links from run_log where uid = ?", [rl.uid])
check(rows == [["warning", "4 ok, 1 failed", '{"games":3}', '{"release":"2026.10.18-1"}']], "finish: the same row is closed, not duplicated (%r)" % rows)
check(q("select count(*) from run_log")[0][0] == "1", "one row for start plus finish")
check(q("select name, outcome from run_log_item where run_uid = ? order by seq", [rl.uid]) == [["nhl", "ok"], ["mlb", "failed"]], "per-league items are kept in order")

check(R.event("deploy-prebuilt", "deploy", "ok", "deployed abc1234", {"pruned": 2}, {"sha": "abc1234"}, actor="machine2", ref="abc1234"), "event writes a one-shot entry")
check(q("select kind, actor, ref, outcome from run_log where job = 'deploy-prebuilt'") == [["deploy", "machine2", "abc1234", "ok"]], "event: kind, actor, commit")

# finish without a start still appears
r2 = R.Run("raw-export", "job")
r2.finish("ok", "17 files")
check(q("select count(*) from run_log where job = 'raw-export'")[0][0] == "1", "a run whose start was lost still appears")

# alerts: raise, repeat, resolve (stays shown), dismiss, repeat failure raises again
R.alert_raise("daily:mlb", "daily-scores", "mlb", "MLB failed")
R.alert_raise("daily:mlb", "daily-scores", "mlb", "MLB failed again")
a = q("select state, repeats, message, dismissed_at from alert where key = 'daily:mlb'")
check(a == [["open", "2", "MLB failed again", None]], "alert: a repeat bumps the count, one row per key (%r)" % a)
R.alert_resolve("daily:mlb")
a = q("select state, resolved_at is not null, dismissed_at from alert where key = 'daily:mlb'")
check(a == [["resolved", "1", None]], "alert: the next success resolves it but it is not dismissed (still shown)")
q("update alert set dismissed_at = ?, dismissed_by = 'x' where key = 'daily:mlb'", [R.now()])
R.alert_raise("daily:mlb", "daily-scores", "mlb", "MLB failed a third time")
a = q("select state, dismissed_at, resolved_at from alert where key = 'daily:mlb'")
check(a == [["open", None, None]], "alert: a repeat failure after a dismissal opens it again")

# a failed write never raises and is spooled, then sent with the next write that works
os.environ["TURSO_DATABASE_URL"] = "http://127.0.0.1:1"
R._schema_done = True
ok = R.event("watchdog", "job", "ok", "while Turso is away")
check(ok is False and os.path.exists(os.environ["RUNLOG_SPOOL"]), "an unreachable Turso: no exception, the entry is spooled")
os.environ["TURSO_DATABASE_URL"] = URL
R.event("watchdog", "job", "ok", "Turso is back")
check(q("select count(*) from run_log where job = 'watchdog'")[0][0] == "2" and not os.path.exists(os.environ["RUNLOG_SPOOL"]), "the spooled entry is sent with the next write")

# not configured: no exception either
for k in ("TURSO_DATABASE_URL",):
    os.environ.pop(k)
os.environ["RUNLOG"] = "0"
check(R.event("x", "job", "ok", "off") is False, "RUNLOG=0 or no URL: returns False, never raises")
os.environ.pop("RUNLOG")
os.environ["TURSO_DATABASE_URL"] = URL
R.alert_raise("x", "x", None, "m")
check(R.alert_resolve("nope") in (True, False), "resolving an unknown alert is harmless")

# retention: detail after 90 days, items after 90 days, the one-line entry after a year
old = R.ago(100)
older = R.ago(400)
R._send([("insert into run_log (uid, kind, job, started_at, outcome, summary, detail) values ('o1','job','old','%s','ok','s','{\"a\":1}')" % old, []),
         ("insert into run_log (uid, kind, job, started_at, outcome, summary) values ('o2','job','older','%s','ok','s')" % older, []),
         ("insert into run_log_item (run_uid, seq, name, at) values ('o1', 0, 'i', '%s')" % old, []),
         ("delete from run_meta", [])])
R.Run("prune-trigger", "job").finish("ok", "x")
check(q("select detail from run_log where uid = 'o1'") == [[None]], "retention: run detail is dropped after 90 days, the line stays")
check(q("select count(*) from run_log where uid = 'o2'")[0][0] == "0", "retention: the one-line entry goes after a year")
check(q("select count(*) from run_log_item where run_uid = 'o1'")[0][0] == "0", "retention: items go after 90 days")

print("FAILED: %d" % len(FAILS) if FAILS else "runlog: all passed")
sys.exit(1 if FAILS else 0)

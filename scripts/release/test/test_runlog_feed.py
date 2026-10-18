#!/usr/bin/env python3
"""scripts/release/runlog_feed.py against a local libSQL server: what the release runner, the watchdog and the ops tick tell the run log.

    docker run -d --name spx-libsql-test -p 127.0.0.1:7743:8080 ghcr.io/tursodatabase/libsql-server:latest
    python3 -I scripts/release/test/test_runlog_feed.py [http://127.0.0.1:7743]      (remove the container by name afterwards)
"""
import json
import os
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
sys.path.insert(0, os.path.join(HERE, "..", "..", "runlog"))
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:7743"
os.environ["TURSO_DATABASE_URL"] = URL
os.environ["RUNLOG_SPOOL"] = os.path.join(tempfile.mkdtemp(prefix="spx-feed-test-"), "spool.jsonl")
import runlog as R  # noqa: E402
import runlog_feed as F  # noqa: E402
import watchdog as W  # noqa: E402

FAILS = []


def check(cond, what):
    print(("ok   " if cond else "FAIL ") + what)
    if not cond:
        FAILS.append(what)


def q(sql, args=()):
    body = json.dumps({"requests": [{"type": "execute", "stmt": {"sql": sql, "args": [R._arg(a) for a in args]}}, {"type": "close"}]}).encode()
    res = json.loads(urllib.request.urlopen(urllib.request.Request(URL + "/v2/pipeline", data=body, headers={"content-type": "application/json"}), timeout=10).read())
    return [[c.get("value") for c in row] for row in res["results"][0]["response"]["result"]["rows"]]


R._send([("drop table if exists %s" % t, []) for t in ("run_log", "run_log_item", "alert", "run_meta")])
R._schema_done = False

rel = {"number": "2026.10.18-1", "title": "Daily scores 2026-10-18", "kind": "daily_scores", "tables": ["core.game", "meta.verification"],
       "preview": {"totals": {"add": 0, "change": 12, "remove": 0}, "blockers": [], "warnings": ["x"]}, "approved_by": "john@example.invalid", "approved_at": "2026-10-18 14:00:00+00"}
F.release_event("approve", rel, "ok", "release 2026.10.18-1 approved by john@example.invalid", actor="john@example.invalid")
row = q("select kind, job, actor, scope, counts, links from run_log where job = 'release-approve'")
check(row == [["approval", "release-approve", "john@example.invalid", "2026.10.18-1", '{"add":0,"change":12,"remove":0}', '{"release":"2026.10.18-1"}']], "approval: who, which release, what it carried (%r)" % row)
det = json.loads(q("select detail from run_log where job = 'release-approve'")[0][0])
check(det["tables"] == ["core.game", "meta.verification"] and det["warnings"] == ["x"] and det["approved_by"] == "john@example.invalid", "approval detail: tables, what the checks said, approver")

F.release_event("apply", rel, "failed", "release 2026.10.18-1 failed: boom", actor="release-runner", alert=("release:2026.10.18-1", "raise"))
check(q("select state from alert where key = 'release:2026.10.18-1'") == [["open"]], "a failed apply raises the release's alert")
F.release_event("apply", rel, "ok", "release applied", actor="release-runner", alert=("release:2026.10.18-1", "resolve"))
check(q("select state from alert where key = 'release:2026.10.18-1'") == [["resolved"]], "a good apply resolves it")
F.release_event("withdraw", rel, "ok", "withdrawn", actor="machine1", detail={"reason": "stale"})
check(q("select kind from run_log where job = 'release-withdraw'") == [["release"]], "withdraw is a release entry")

# beat: once an hour
st = {}
check(F.beat(st, "probe", "beat-test", "ok", 3600, 10000) is True and F.beat(st, "probe", "beat-test", "ok", 3600, 11000) is False and F.beat(st, "probe", "beat-test", "ok", 3600, 15000) is True, "beat writes at most once per interval")

# the Dropbox export rows become entries; the first call only remembers where the table stands
rows = {"top": 5, "new": [{"id": 6, "host": "m", "finished_at": "2026-10-18T12:00:00Z", "outcome": "ok", "checked": 10, "copied": 2, "present": 8, "failed": 0, "bytes": 5, "seconds": 3},
                          {"id": 7, "host": "m", "finished_at": "2026-10-18T13:00:00Z", "outcome": "problems", "checked": 10, "copied": 0, "present": 8, "failed": 2, "bytes": 0, "seconds": 3}]}


def read_json(sql):
    return rows["top"] if "max(id)" in sql else rows["new"]


s = {}
F.feed_raw_export(read_json, s)
check(s["rl_export_id"] == 5 and q("select count(*) from run_log where job = 'raw-export'")[0][0] == "0", "raw export: the first sight writes nothing")
F.feed_raw_export(read_json, s)
check(q("select outcome from run_log where job = 'raw-export' order by id") == [["ok"], ["warning"]] and s["rl_export_id"] == 7, "raw export: each new run is an entry, problems are a warning")
check(q("select state from alert where key = 'raw-export'") == [["open"]], "raw export: problems raise the alert")

# the watchdog
os.environ["TURSO_DATABASE_URL"] = URL
W.feed("failed", "The public API has been failing", alert="raise")
W.feed("ok", "The public API answers again.", alert="resolve")
check(q("select outcome from run_log where job = 'watchdog' order by id") == [["failed"], ["ok"]] and q("select state from alert where key = 'watchdog:api'") == [["resolved"]], "watchdog: incident and recovery")

print("FAILED: %d" % len(FAILS) if FAILS else "runlog_feed: all passed")
sys.exit(1 if FAILS else 0)

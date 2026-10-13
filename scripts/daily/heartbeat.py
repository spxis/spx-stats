#!/usr/bin/env python3
"""The heartbeat of `run.py --apply`: one row in ingest.daily_run (migration 048, DS1 only) per run.

start() writes the row as 'running' before anything is fetched; finish() closes it as 'ok' or 'failed' with the counts. A day with no
row is a run that never started, and a row that stays 'running' is a run that died. Recording is best effort: if DS1 cannot be reached
the run's own DS1 steps fail too, and that failure is what the exit code and the log say. Never prints a secret.
"""
import json, os, socket, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DS1 = os.path.join(HERE, "ds1.sh")
MIGRATION = os.path.join(HERE, "..", "..", "db", "migrations", "048_ingest_daily_run.sql")


def _psql(sql):
    p = subprocess.run([DS1, "-X", "-q", "-At", "-c", sql], capture_output=True, text=True, timeout=120)
    if p.returncode: raise RuntimeError((p.stderr.strip().splitlines() or ["query failed"])[-1])
    return [ln for ln in p.stdout.splitlines() if ln]


def _lit(s): return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


def _git_sha():
    try: return subprocess.run(["git", "-C", HERE, "rev-parse", "--short=10", "HEAD"], capture_output=True, text=True, timeout=10).stdout.strip() or None
    except Exception: return None


def start():
    """-> run_id, or None when the row could not be written (a warning is printed)."""
    try:
        # the table comes from migration 048 (rerunnable); applying it here keeps a fresh DS1 from losing the first heartbeat
        sql = "".join(ln for ln in open(MIGRATION, encoding="utf-8").read().splitlines(True) if ln.strip().lower() not in ("begin;", "commit;"))
        p = subprocess.run([DS1, "-X", "-q", "-1", "-f", "-"], input=sql, capture_output=True, text=True, timeout=120)
        if p.returncode: raise RuntimeError((p.stderr.strip().splitlines() or ["migration failed"])[-1])
        rows = _psql("with i as (insert into ingest.daily_run (host, git_sha) values (%s, %s) returning run_id) select run_id from i" % (_lit(socket.gethostname()), _lit(_git_sha())))
        return int(rows[0])
    except Exception as e:
        print("heartbeat: could not record the start (%s)" % e, file=sys.stderr)
        return None


def finish(run_id, outcome, summary):
    if run_id is None: return
    try:
        _psql("update ingest.daily_run set finished_at = now(), outcome = %s, summary = %s::jsonb where run_id = %d"
              % (_lit(outcome), _lit(json.dumps(summary, default=str, ensure_ascii=False)), run_id))
        print("heartbeat: run %d recorded as %s" % (run_id, outcome))
    except Exception as e:
        print("heartbeat: could not record the end (%s)" % e, file=sys.stderr)

#!/usr/bin/env python3
"""Tests of "Update now" for one league (migration 150, release.py request_pass, run.py --league), on a scratch Postgres with no DS1, no
production and no Supabase: two throwaway databases stand in for DS1 (045, 047, 048) and production (045, 047, 053, 104, 150), mock_api.py stands
in for the Management API, and scripts/daily/run.py is replaced by a stub that records its arguments.

    PGHOST=127.0.0.1 PGPORT=7741 PGUSER=postgres python3 -I scripts/release/test/test_league_request.py

(a scratch server: `HARVEST_SCRATCH_PORT=7741 HARVEST_SCRATCH_NAME=<name> bash scripts/harvest/test/scratch.sh up`; the database `postgres` must exist).
Exit code: 0 all passed, 1 a check failed. Without PGHOST the tests are skipped.
"""
import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RELEASE = os.path.join(HERE, "..", "release.py")
MOCK = os.path.join(HERE, "mock_api.py")
FAILED = []
DS1, PROD = "lg_t_ds1", "lg_t_prod"
SECRET = "s" * 40
STUB = """
import os, sys
open(os.environ["STUB_MARK"], "a").write(" ".join(sys.argv[1:]) + "\\n")
mode = os.environ.get("STUB_MODE", "nothing")
if mode == "fail":
    print("NBA FAILED: a check failed"); sys.exit(1)
print("release hook: nothing: DS1 and production already match")
"""


def check(name, cond, detail=""):
    print(("ok    " if cond else "FAIL  ") + name + ("" if cond else "  " + str(detail)[:500]))
    if not cond:
        FAILED.append(name)


def psql(db, sql, check_rc=True):
    r = subprocess.run(["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-d", db, "-c", sql], capture_output=True, text=True)
    if check_rc and r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[:300])
    return r


def psql_file(db, path):
    r = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", db, "-f", path], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("%s: %s" % (os.path.basename(path), r.stderr.strip()[:300]))


def dsn(db):
    return "host=%s port=%s user=%s dbname=%s" % (os.environ["PGHOST"], os.environ.get("PGPORT", "5432"), os.environ.get("PGUSER", "postgres"), db)


def main():
    if not os.environ.get("PGHOST"):
        print("skip  set PGHOST, PGPORT and PGUSER (a scratch Postgres) to run these tests")
        return 0
    for d in (DS1, PROD):
        psql("postgres", "drop database if exists %s with (force)" % d)
        psql("postgres", "create database %s" % d)
    psql("postgres", "do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if; "
                     "if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if; end $$")
    tmp = tempfile.mkdtemp(prefix="lgt-")
    mock = None
    try:
        mig = lambda n: os.path.join(REPO, "db", "migrations", n)
        for db in (DS1, PROD):
            psql(db, "create schema meta; create schema api; create schema ingest;")
        for f in ("045_data_releases.sql", "047_auto_approval.sql", "048_ingest_daily_run.sql"):
            psql_file(DS1, mig(f))
        for f in ("045_data_releases.sql", "047_auto_approval.sql", "053_score_update_requests.sql", "104_ops_status.sql"):
            psql_file(PROD, mig(f))
        psql(PROD, "insert into meta.release_secret (secret_hash) values ('%s')" % hashlib.sha256(SECRET.encode()).hexdigest())
        # a request made before migration 150 (no league column yet) is still read by the runner
        psql(PROD, "select api.request_score_update('%s', 'old@example.test')" % SECRET)
        r = psql(PROD, "select to_jsonb(q) ->> 'league' from meta.score_update_request q")
        check("before 150 the runner's read of the league is null, not an error", r.stdout.strip() == "")
        psql(PROD, "update meta.score_update_request set status = 'done', finished_at = now() - interval '1 hour'")
        psql_file(PROD, mig("150_score_request_league.sql"))
        psql_file(PROD, mig("150_score_request_league.sql"))
        check("migration 150 applies twice", True)

        def ask(league="nhl", actor="john@example.test", secret=SECRET):
            return psql(PROD, "select api.request_league_update('%s', '%s', %s)" % (secret, actor, "null" if league is None else "'%s'" % league), check_rc=False)

        def ask_as(role, sql):
            return subprocess.run(["psql", "-X", "-q", "-A", "-t", "-d", PROD, "-c", "set role %s; %s" % (role, sql)], capture_output=True, text=True)

        r = ask(secret="wrong" * 8)
        check("a wrong secret is refused", r.returncode != 0 and "not allowed" in r.stderr, r.stderr)
        check("no league is refused by the league function", ask(None).returncode != 0)
        for bad in ("NHL", "n", "nhl; drop table x", "a" * 21, "nh l", "../x"):
            check("the league %r is refused" % bad[:12], ask(bad).returncode != 0)
        for actor in ("auto:x", "request:x", "system", ""):
            check("the requester %r is refused" % actor, ask("nhl", actor).returncode != 0)
        r = ask("nhl")
        j = json.loads(r.stdout) if r.returncode == 0 else {}
        check("a league request queues one row with its league", r.returncode == 0 and j.get("league") == "nhl" and j.get("status") == "queued", r.stderr)
        r = ask("nba")
        check("a second request while one is open is refused, whatever the league", r.returncode != 0 and "already open" in r.stderr, r.stderr)
        r = psql(PROD, "insert into meta.score_update_request (requested_by, kind, league) values ('x', 'drift', 'nhl')", check_rc=False)
        check("a drift request cannot name a league", r.returncode != 0, r.stderr)
        psql(PROD, "update meta.score_update_request set status = 'done', finished_at = now() - interval '2 minutes' where status = 'queued'")
        check("the same league needs about 10 minutes", ask("nhl").returncode != 0 and "10 minutes" in ask("nhl").stderr)
        r = ask("nba")
        check("another league may go once the last request ended", r.returncode == 0, r.stderr)
        psql(PROD, "update meta.score_update_request set status = 'done', finished_at = now() - interval '2 minutes' where status = 'queued'")
        r = psql(PROD, "select api.request_score_update('%s', 'john@example.test')" % SECRET, check_rc=False)
        check("the all-leagues request of 053 still works (3-argument form)", r.returncode == 0 and json.loads(r.stdout).get("league") is None, r.stderr)
        psql(PROD, "update meta.score_update_request set status = 'done', finished_at = now() - interval '20 minutes', requested_at = now() - interval '21 minutes'")
        check("the drift request of 053 still works", psql(PROD, "select api.request_drift_check('%s', 'john@example.test')" % SECRET, check_rc=False).returncode == 0)
        psql(PROD, "update meta.score_update_request set status = 'done', finished_at = now() - interval '20 minutes', requested_at = now() - interval '21 minutes'")
        check("anon cannot call queue_request directly", ask_as("anon", "select api.queue_request('%s', 'a', 'scores', 'nhl')" % SECRET).returncode != 0)
        check("anon cannot read the requests table", ask_as("anon", "select * from meta.score_update_request").returncode != 0)
        d = json.loads(psql(PROD, "select api.ops_dashboard('%s')" % SECRET).stdout)
        check("ops_dashboard keeps its keys and adds the scores requests with their league",
              {"latest", "history", "requests", "server_now", "score_requests"} <= set(d) and d["score_requests"] and "league" in d["score_requests"][0]
              and all(x["status"] != "queued" for x in d["score_requests"]), d.get("score_requests"))
        dash = json.loads(psql(PROD, "select api.release_dashboard('%s')" % SECRET).stdout)
        check("the releases dashboard lists the league too", any(q.get("league") == "nhl" for q in dash["requests"]), dash["requests"][:2])
        psql(PROD, "delete from meta.score_update_request")

        # ---- the runner: a request that names a league runs run.py --league <league>
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
        url = "http://127.0.0.1:%d/v1/projects/test/database/query" % port
        ctl = os.path.join(tmp, "ctl.json")
        mock = subprocess.Popen([sys.executable, "-I", MOCK, str(port), dsn(PROD), ctl])
        for _ in range(50):
            try:
                socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
                break
            except OSError:
                time.sleep(0.1)
        stub, mark = os.path.join(tmp, "stub.py"), os.path.join(tmp, "marks")
        open(stub, "w").write(STUB)

        def run_runner(mode="nothing"):
            env = dict(os.environ, SUPABASE_ACCESS_TOKEN="test", RELEASE_SNAPSHOT_DIR=os.path.join(tmp, "snap"), RELEASE_MAIN_REF="HEAD",
                       STUB_MARK=mark, STUB_MODE=mode, RELEASE_DAILY_CACHE=os.path.join(tmp, "daily"), RUNLOG="0")
            r = subprocess.run([sys.executable, "-I", RELEASE, "--ds1-dsn", dsn(DS1), "--api-url", url, "--daily-script", stub, "run"], capture_output=True, text=True, env=env)
            return r.stdout + r.stderr

        def last():
            return json.loads(psql(PROD, "select row_to_json(q)::text from (select * from meta.score_update_request order by id desc limit 1) q").stdout)

        calls = lambda: open(mark).read().splitlines() if os.path.exists(mark) else []
        psql(PROD, "select api.request_league_update('%s', 'john@example.test', 'nba')" % SECRET)
        out = run_runner()
        r = last()
        check("the runner ran the job once, limited to that league, with the release hook on", len(calls()) == 1 and "--apply" in calls()[0] and calls()[0].split("--league")[1].split()[0] == "nba", (calls(), out))
        check("the request ends 'nothing' and says which league", r["status"] == "nothing" and r["league"] == "nba" and "NBA" in (r["summary"] or ""), r)

        psql(PROD, "update meta.score_update_request set finished_at = now() - interval '1 hour'")
        psql(PROD, "select api.request_score_update('%s', 'john@example.test')" % SECRET)
        run_runner()
        check("an all-leagues request passes no --league", len(calls()) == 2 and "--league" not in calls()[1], calls())

        psql(PROD, "update meta.score_update_request set finished_at = now() - interval '1 hour'")
        psql(PROD, "select api.request_league_update('%s', 'john@example.test', 'cfl')" % SECRET)
        run_runner("fail")
        r = last()
        check("a failing league run ends the request as failed with the league in the words", r["status"] == "failed" and r["league"] == "cfl" and "CFL scores job did not finish" in (r["summary"] or ""), r)

        psql(PROD, "update meta.score_update_request set finished_at = now() - interval '1 hour'")
        psql(PROD, "select api.request_league_update('%s', 'john@example.test', 'wnba')" % SECRET)
        n = len(calls())
        run_runner()
        r = last()
        check("a league the job does not load is failed without running anything", r["status"] == "failed" and len(calls()) == n and "does not load" in (r["summary"] or "") and "NHL" in r["summary"], r)

        # ---- the lists agree
        sys.path.insert(0, os.path.join(REPO, "scripts", "daily"))
        sys.path.insert(0, os.path.join(REPO, "scripts", "release"))
        import ops
        import release as RL
        import run as DAILY
        check("run.py, release.py and ops.py name the same daily leagues", tuple(DAILY.LEAGUES) == RL.DAILY_LEAGUES == ops.SCORE_LEAGUES, (DAILY.LEAGUES, RL.DAILY_LEAGUES, ops.SCORE_LEAGUES))
    finally:
        if mock:
            mock.terminate()
        shutil.rmtree(tmp, ignore_errors=True)
        for d in (DS1, PROD):
            psql("postgres", "drop database if exists %s with (force)" % d, check_rc=False)
    print()
    print("all passed" if not FAILED else "FAILED: %s" % "; ".join(FAILED))
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())

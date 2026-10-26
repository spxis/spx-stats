#!/usr/bin/env python3
"""Tests of the admin "Refresh" requests for the live score layer (migration 156, release.py request_pass, run.py --live-only), on a scratch Postgres with
no DS1, no production and no Supabase: two throwaway databases stand in for DS1 (045, 047, 048) and production (045, 047, 053, 104, 150, 156), mock_api.py
stands in for the Management API, and scripts/daily/run.py is replaced by a stub that records its arguments.

    PGHOST=127.0.0.1 PGPORT=7741 PGUSER=postgres python3 -I scripts/release/test/test_live_request.py

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
DS1, PROD = "lv_t_ds1", "lv_t_prod"
SECRET = "s" * 40
STUB = """
import os, sys
open(os.environ["STUB_MARK"], "a").write(" ".join(sys.argv[1:]) + "|" + os.environ.get("DAILY_PREPARE_RELEASE", "") + "\\n")
mode = os.environ.get("STUB_MODE", "nothing")
if "--live-only" in sys.argv:
    if mode == "livefail":
        print("Traceback: boom"); sys.exit(3)
    print("Requests this run: Wikipedia API 2 | other 0 (balldontlie none)")
    print("live request: done: 2 game(s) asked: 1 updated, 1 unchanged.")
    sys.exit(0)
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
    tmp = tempfile.mkdtemp(prefix="lvt-")
    mock = None
    try:
        mig = lambda n: os.path.join(REPO, "db", "migrations", n)
        for db in (DS1, PROD):
            psql(db, "create schema meta; create schema api; create schema ingest;")
        for f in ("045_data_releases.sql", "047_auto_approval.sql", "048_ingest_daily_run.sql"):
            psql_file(DS1, mig(f))
        for f in ("045_data_releases.sql", "047_auto_approval.sql", "053_score_update_requests.sql", "104_ops_status.sql", "150_score_request_league.sql"):
            psql_file(PROD, mig(f))
        psql(PROD, "insert into meta.release_secret (secret_hash) values ('%s')" % hashlib.sha256(SECRET.encode()).hexdigest())
        psql(PROD, "select api.request_league_update('%s', 'old@example.test', 'nhl')" % SECRET)
        psql(PROD, "update meta.score_update_request set status = 'done', finished_at = now() - interval '1 hour'")
        psql_file(PROD, mig("156_live_refresh_request.sql"))
        psql_file(PROD, mig("156_live_refresh_request.sql"))
        check("migration 156 applies twice, over 150", True)

        def ask(scope="game", league=None, day=None, game=None, sources=None, settle=False, actor="john@example.test", secret=SECRET):
            arr = "null::text[]" if sources is None else "array[%s]::text[]" % ",".join("'%s'" % x for x in sources)
            q = lambda v: "null" if v is None else "'%s'" % v
            return psql(PROD, "select api.request_live('%s', '%s', '%s', %s, %s::date, %s::bigint, %s, %s)" % (
                secret, actor, scope, q(league), q(day), "null" if game is None else game, arr, "true" if settle else "false"), check_rc=False)

        def ask_as(role, sql):
            return subprocess.run(["psql", "-X", "-q", "-A", "-t", "-d", PROD, "-c", "set role %s; %s" % (role, sql)], capture_output=True, text=True)

        def finish(minutes=2):
            psql(PROD, "update meta.score_update_request set status = 'done', finished_at = now() - interval '%d minutes' where status in ('queued', 'running')" % minutes)

        today = psql(PROD, "select current_date").stdout.strip()
        old = psql(PROD, "select current_date - 12").stdout.strip()
        r = ask(secret="wrong" * 8)
        check("a wrong secret is refused", r.returncode != 0 and "not allowed" in r.stderr, r.stderr)
        for actor in ("auto:x", "request:x", "system", ""):
            check("the requester %r is refused" % actor, ask("game", game=5, actor=actor).returncode != 0)
        check("an unknown scope is refused", ask("season", game=5).returncode != 0)
        check("a game needs its id", ask("game").returncode != 0 and ask("game", game=0).returncode != 0)
        check("a game does not take a league or a day", ask("game", league="nhl", game=5).returncode != 0 and ask("game", game=5, day=today).returncode != 0)
        check("a day needs a league and a day", ask("day", league="nhl").returncode != 0 and ask("day", day=today).returncode != 0)
        check("a day older than the live layer keeps is refused", ask("day", league="nhl", day=old).returncode != 0)
        check("main5 and all take nothing else", ask("main5", league="nhl").returncode != 0 and ask("all", day=today).returncode != 0)
        check("a league that is not a code is refused", all(ask("league", league=x).returncode != 0 for x in ("NHL", "n", "nhl; drop table x", "a" * 21)))
        check("a source that is not an id is refused", all(ask("main5", sources=[x]).returncode != 0 for x in ("Wikipedia", "x", "a b", "'; drop")))
        check("nine sources are refused", ask("main5", sources=["s%d" % i for i in range(10, 19)]).returncode != 0)
        check("one game cannot be a slow-path request", ask("game", game=5, settle=True).returncode != 0 and ask("day", league="nhl", day=today, settle=True).returncode != 0)
        check("nothing was queued by the refused ones", psql(PROD, "select count(*) from meta.score_update_request where status = 'queued'").stdout.strip() == "0")

        r = ask("game", game=42, sources=["wikipedia", "balldontlie", "wikipedia"])
        j = json.loads(r.stdout) if r.returncode == 0 else {}
        row = json.loads(psql(PROD, "select row_to_json(q)::text from (select * from meta.score_update_request where status = 'queued') q").stdout)
        check("a game refresh queues one live row, sources sorted and de-duplicated",
              j.get("kind") == "live" and row["game_id"] == 42 and row["sources"] == ["balldontlie", "wikipedia"] and row["requested_by"] == "john@example.test", (r.stderr, row))
        r = ask("day", league="nba", day=today)
        check("a second live refresh while one is open is refused", r.returncode != 0 and "already open" in r.stderr, r.stderr)
        r = ask("league", league="nhl", settle=True)
        check("the slow path is not blocked by an open live refresh", r.returncode == 0 and json.loads(r.stdout)["kind"] == "scores", r.stderr)
        r = psql(PROD, "select api.request_score_update('%s', 'john@example.test')" % SECRET, check_rc=False)
        check("a second slow-path request is still refused while one is open", r.returncode != 0 and "already open" in r.stderr, r.stderr)
        finish(0)
        r = ask("game", game=42)
        check("the same game again within about 30 seconds is refused", r.returncode != 0 and "30 seconds" in r.stderr, r.stderr)
        r = ask("game", game=43)
        check("another game may go at once", r.returncode == 0, r.stderr)
        finish(2)
        r = ask("league", league="nhl", settle=True)
        check("the slow path keeps its 10 minute rule per league", r.returncode != 0 and "10 minutes" in r.stderr, r.stderr)
        check("the all-sports request keeps working with sources", ask("all", sources=["wikipedia"], settle=True).returncode == 0)
        finish(20)
        psql(PROD, "update meta.score_update_request set requested_at = now() - interval '30 minutes'")
        check("the 053 request still works", psql(PROD, "select api.request_score_update('%s', 'john@example.test')" % SECRET, check_rc=False).returncode == 0)
        finish(20)
        psql(PROD, "update meta.score_update_request set requested_at = now() - interval '30 minutes'")
        check("a league update of 150 still works", psql(PROD, "select api.request_league_update('%s', 'john@example.test', 'cfl')" % SECRET, check_rc=False).returncode == 0)
        finish(20)
        check("anon cannot read the table", ask_as("anon", "select * from meta.score_update_request").returncode != 0)
        check("anon cannot call queue_request directly", ask_as("anon", "select api.queue_request('%s', 'a', 'scores', 'nhl')" % SECRET).returncode != 0)
        check("a drift request cannot carry a scope", psql(PROD, "insert into meta.score_update_request (requested_by, kind, scope, league) values ('x', 'drift', 'league', 'nhl')", check_rc=False).returncode != 0)
        dash = json.loads(psql(PROD, "select api.release_dashboard('%s')" % SECRET).stdout)
        check("the releases dashboard lists the scope and the sources of a request", any(q.get("scope") == "game" and q.get("sources") for q in dash["requests"]), dash["requests"][:2])
        psql(PROD, "delete from meta.score_update_request")

        # ---- the runner
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

        def last(i=None):
            where = "where id = %d" % i if i else "order by id desc limit 1"
            return json.loads(psql(PROD, "select row_to_json(q)::text from (select * from meta.score_update_request %s) q" % where).stdout)

        calls = lambda: open(mark).read().splitlines() if os.path.exists(mark) else []
        age = lambda: psql(PROD, "update meta.score_update_request set finished_at = now() - interval '1 hour', requested_at = now() - interval '1 hour' where status not in ('queued', 'running')")

        ask("game", game=77, sources=["wikipedia"])
        out = run_runner()
        c = calls()
        r = last()
        check("a game refresh runs run.py --live-only for that game, read-only, with who pressed it", len(c) == 1 and "--live-only" in c[0] and "--game 77" in c[0] and "--dry-run" in c[0]
              and "--apply" not in c[0] and "--by john@example.test" in c[0] and "--scope game" in c[0] and "--sources wikipedia" in c[0] and c[0].endswith("|"), (c, out))
        check("the request ends done with the job's summary and its request count", r["status"] == "done" and "2 game(s) asked" in (r["summary"] or "") and "Wikipedia API 2" in r["summary"] and r["release_number"] is None, r)
        age()

        ask("day", league="nhl", day=today)
        run_runner()
        c = calls()[-1]
        check("a day refresh passes the league and the day", "--league nhl" in c and "--day %s" % today in c and "--sources" not in c, c)
        age()
        ask("main5")
        run_runner()
        c = calls()[-1]
        check("main five passes the five leagues", "--league nhl,nba,mlb,nfl,cfl" in c and "--day" not in c, c)
        age()
        ask("all", sources=["balldontlie", "nflverse"])
        run_runner()
        c = calls()[-1]
        check("all sports passes the sources ticked", "--league nhl,nba,mlb,nfl,cfl" in c and "--sources balldontlie,nflverse" in c, c)
        age()

        # a forged row that skips the function: the runner still checks the sources and the league
        n = len(calls())
        for bad_sources in ("{nhl_api}", "{espn}", "{wikipedia,yahoo_sports}"):
            psql(PROD, "insert into meta.score_update_request (requested_by, kind, scope, sources) values ('x@example.test', 'live', 'main5', '%s')" % bad_sources)
            run_runner()
            r = last()
            check("a forged source %s is refused by the runner without running anything" % bad_sources, r["status"] == "failed" and len(calls()) == n and "Not a source" in (r["summary"] or ""), (r, calls()[n:]))
            age()
        psql(PROD, "insert into meta.score_update_request (requested_by, kind, scope, league) values ('x@example.test', 'live', 'league', 'wnba')")
        run_runner()
        r = last()
        check("a league the job does not load is failed without running anything", r["status"] == "failed" and len(calls()) == n and "does not load" in r["summary"], r)
        age()

        # order: the live refresh goes first even when a slow request is older
        psql(PROD, "insert into meta.score_update_request (requested_by, kind) values ('slow@example.test', 'scores')")
        ask("game", game=5)
        n = len(calls())
        run_runner()
        c = calls()[n:]
        check("a live refresh is served before an older slow request", len(c) == 1 and "--live-only" in c[0], c)
        check("and the slow request is still queued for the next pass", last()["requested_by"] == "slow@example.test" or
              psql(PROD, "select requested_by from meta.score_update_request where status = 'queued'").stdout.strip() == "slow@example.test")
        run_runner()
        c = calls()[n:]
        check("the next pass runs the slow request, the old way (no scope: no live part)", len(c) == 2 and "--apply" in c[1] and c[1].endswith("|1"), c)
        age()

        # a failing live run
        ask("game", game=6)
        run_runner("livefail")
        r = last()
        check("a crashed live run ends the request as failed with the exit reason", r["status"] == "failed" and "did not finish" in r["summary"] and "exit 3" in r["summary"], r)
        age()

        # a slow-path request with a scope: the live part first, then the careful path, one summary
        psql(PROD, "select api.request_live('%s', 'john@example.test', 'league', 'nba', null, null, array['wikipedia']::text[], true)" % SECRET)
        n = len(calls())
        run_runner()
        c = calls()[n:]
        r = last()
        check("a scoped slow request runs the live refresh first and then the daily job for that league",
              len(c) == 2 and "--live-only" in c[0] and "--league nba" in c[0] and "--apply" in c[1] and "--league nba" in c[1] and "--live" not in c[1], c)
        check("and its summary carries both", r["status"] == "nothing" and "Nothing new" in r["summary"] and "Live scores" in r["summary"] and len(r["summary"]) <= 600, r)
        age()

        # ---- the lists agree
        sys.path.insert(0, os.path.join(REPO, "scripts", "daily"))
        sys.path.insert(0, os.path.join(REPO, "scripts", "release"))
        import release as RL
        import run as DAILY
        check("run.py and release.py name the same live sources and daily leagues", tuple(DAILY.LIVE_SOURCES) == RL.LIVE_SOURCES and tuple(DAILY.LEAGUES) == RL.DAILY_LEAGUES, (DAILY.LIVE_SOURCES, RL.LIVE_SOURCES))
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

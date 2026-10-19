#!/usr/bin/env python3
"""Tests of the score update requests (migration 053), the shared daily lock and the site cache refresh after a release, on the
same local setup as test_release.py (scratch databases for DS1 and production, mock_api.py for the Management API).
scripts/daily/run.py is replaced by a stub that prepares the release the real job's release hook would prepare, and the site's
/api/revalidate route is a small local server that records what the runner sends.

    python3 -I scripts/release/test/test_request.py [--source spx_stats] [--only requests_db,request_flow]

Exit code: 0 all passed, 1 a check failed.
"""
import argparse
import http.server
import json
import os
import re
import secrets
import subprocess
import sys
import threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import daily_lock  # noqa: E402
import test_release as T  # noqa: E402
from test_auto import AUTO, backdate, call, flag, pause, prep_daily, resume, sched  # noqa: E402
from test_release import DS1, HOST, PORT, PROD, RELEASE, REPO, SECRET, approve, compare_same, dsn, fresh, number_of, ok, psql, rid, status  # noqa: E402

REV_SECRET = secrets.token_hex(24)
STUB = """
import os, subprocess, sys
mode = os.environ.get("STUB_MODE", "scores")
if os.environ.get("STUB_MARK"):
    open(os.environ["STUB_MARK"], "a").write(" ".join(sys.argv[1:]) + "|" + os.environ.get("DAILY_PREPARE_RELEASE", "") + "|" + os.environ.get("DAILY_RELEASE_KIND", "") + "\\n")
if mode == "fail":
    print("boom"); sys.exit(3)
if mode == "nothing":
    print("release hook: nothing: DS1 and production already match"); sys.exit(0)
if mode == "hookfail":
    print("release hook: failed: could not run"); sys.exit(0)
r = subprocess.run([sys.executable, "-I", os.environ["STUB_RELEASE"], "--ds1-dsn", os.environ["STUB_DSN"], "--api-url", os.environ["STUB_API"],
                    "--by", "daily-job", "prepare", "--kind", "daily_scores", "--title", "Daily scores test"], capture_output=True, text=True)
print(r.stdout, r.stderr)
print("release hook: %s: exit %d" % ("prepared" if r.returncode == 0 else "refused", r.returncode))
"""


class Site:
    """The site's /api/revalidate, as far as the runner can tell: records every request, answers with `code`."""

    def __init__(self):
        self.calls, self.code = [], 200
        site = self

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
                site.calls.append({"auth": self.headers.get("Authorization"), "body": json.loads(body), "path": self.path})
                self.send_response(site.code)
                self.send_header("Content-Length", "2")
                self.end_headers()
                self.wfile.write(b"{}")

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.url = "http://127.0.0.1:%d/api/revalidate" % self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()


class Ctx2:
    """Wraps Env: a stub for the daily job, a marker file, and the environment the runner needs for it."""

    def __init__(self, env, site):
        self.env, self.site = env, site
        self.stub = os.path.join(env.tmp, "stub_daily.py")
        self.mark = os.path.join(env.tmp, "stub.marks")
        open(self.stub, "w").write(STUB)

    def run(self, mode="scores", revalidate=True):
        extra = {"STUB_MODE": mode, "STUB_MARK": self.mark, "STUB_RELEASE": RELEASE, "STUB_DSN": dsn(DS1), "STUB_API": self.env.url}
        if revalidate:
            extra.update(REVALIDATE_URL=self.site.url, REVALIDATE_SECRET=REV_SECRET)
        return self.env.rel("--daily-script", self.stub, "run", env=extra)

    def calls_of_stub(self):
        return open(self.mark).read().splitlines() if os.path.exists(self.mark) else []

    def reset(self):
        fresh()
        if os.path.exists(self.mark):
            os.remove(self.mark)
        self.site.calls.clear()
        self.site.code = 200


def req_call(sql, secret=None):
    return call(sql, secret)


def ask(actor="john@example.com", secret=None):
    return req_call("api.request_score_update('SECRET', '%s')" % actor, secret)


def req(id_=None):
    where = "where id = %d" % id_ if id_ else "order by id desc limit 1"
    return json.loads(psql(PROD, "select row_to_json(q)::text from (select * from meta.score_update_request %s) q" % where))


def end_request(minutes_ago=11):
    psql(PROD, "update meta.score_update_request set status = 'done', finished_at = now() - interval '%d minutes', "
               "requested_at = now() - interval '%d minutes'" % (minutes_ago, minutes_ago + 1))


def requests_db(x):
    x.reset()
    r = psql(PROD, "select * from meta.score_update_request", check=False, role="anon")
    ok("anon cannot read the requests", r.returncode != 0 and "permission denied" in r.stderr)
    r = psql(PROD, "insert into meta.score_update_request (requested_by) values ('x')", check=False, role="anon")
    ok("anon cannot insert a request", r.returncode != 0)
    good, err_ = ask(secret="wrong" * 10)
    ok("a wrong secret is refused", not good and "not allowed" in err_, err_)
    for actor in ("auto:daily-scores", "request:someone", "system", "", "x" * 81):
        ok("the actor %r is refused" % actor[:20], not ask(actor)[0])
    good, err_ = ask()
    ok("a request is queued", good and req()["status"] == "queued" and req()["requested_by"] == "john@example.com", err_)
    good, err_ = ask()
    ok("a second request while one is open is refused", not good and "already open" in err_, err_)
    r = psql(PROD, "insert into meta.score_update_request (requested_by) values ('y')", check=False)
    ok("the table itself allows only one open request (two clicks at once make one row)", r.returncode != 0 and "one_open" in r.stderr, r.stderr)
    ok("approve_release refuses the request: name", not approve_as("request:john@example.com"))
    end_request(2)
    good, err_ = ask()
    ok("about 10 minutes must pass after the last request ended", not good and "10 minutes" in err_, err_)
    end_request(11)
    good, err_ = ask()
    ok("after the cooldown a new request is accepted", good, err_)
    dash = json.loads(psql(PROD, "select api.release_dashboard('%s')::text" % SECRET, role="anon"))
    ok("the dashboard lists the requests, the cooldown and the clock",
       [q["status"] for q in dash["requests"]] == ["queued", "done"] and dash["request_cooldown_minutes"] == 10 and dash["server_now"], dash.get("requests"))
    r = psql(PROD, "select api.release_summary('nope')", check=False, role="anon")
    ok("the summary needs the secret", r.returncode != 0 and "not allowed" in r.stderr)
    s = json.loads(psql(PROD, "select api.release_summary('%s')::text" % SECRET, role="anon"))
    ok("the summary has three counts", set(s) == {"waiting", "drift", "paused"} and s["waiting"] == 0 and s["paused"] is False, s)
    sched(3)
    n, _ = prep_daily(T_ENV[0])
    s = json.loads(psql(PROD, "select api.release_summary('%s')::text" % SECRET, role="anon"))
    ok("an eligible daily release that approves itself is not counted as waiting", s["waiting"] == 0, s)
    pause()
    s = json.loads(psql(PROD, "select api.release_summary('%s')::text" % SECRET, role="anon"))
    ok("under Hold it is waiting, and the Hold shows", s["waiting"] == 1 and s["paused"] is True, s)


def approve_as(actor):
    r = psql(PROD, "select api.approve_release('%s', 1, true, '%s')" % (SECRET, actor), check=False, role="anon")
    return "bad request" not in r.stderr


T_ENV = [None]


def queue(actor="john@example.com"):
    good, err_ = ask(actor)
    assert good, err_
    return req()["id"]


def request_flow(x):
    x.reset()
    ids = sched(4)
    games_leagues = sorted(psql(DS1, "select string_agg(distinct lower(league), ',') from api.games where game_id in (%s)" % ",".join(ids)).split(","))
    q = queue()
    rc, out, err = x.run()
    r = req(q)
    ok("the run finishes and the request is done", rc == 0 and r["status"] == "done" and r["finished_at"] and r["started_at"], out + err + str(r))
    num = r["release_number"]
    ok("the request names the release it prepared, and the summary says so", num and num in r["summary"] and "4 games" in r["summary"], r)
    ok("the stub was called once, with the release hook switched on", x.calls_of_stub() and len(x.calls_of_stub()) == 1 and x.calls_of_stub()[0].endswith("|1|daily_scores"), x.calls_of_stub())
    ok("the release was approved at once as request:<admin>, without the 10 minute hold",
       status(num) == "done" and psql(PROD, "select approved_by from meta.data_release where number = '%s'" % num) == "request:john@example.com"
       and psql(DS1, "select approved_by from meta.data_release where number = '%s'" % num) == "request:john@example.com", out + err)
    ok("production equals DS1", compare_same("core.game,meta.verification,meta.data_issue")[0])
    ok("the switch stays off", flag().startswith("false"))
    ok("the dashboard shows the release status next to the request",
       json.loads(psql(PROD, "select api.release_dashboard('%s')::text" % SECRET, role="anon"))["requests"][0]["release_status"] == "done")
    ok("the runner asked the site to refresh once, after the commit", len(x.site.calls) == 1, x.site.calls)
    c = x.site.calls[0]
    tags = c["body"]["tags"]
    ok("with the secret as a Bearer token, to the route", c["auth"] == "Bearer " + REV_SECRET and c["path"] == "/api/revalidate", c)
    ok("the tags name the games view for each changed league and 'all', plus the footer",
       "data-version" in tags and "api:games:all" in tags and all("api:games:%s" % lg in tags for lg in games_leagues)
       and all(re.match(r"^[a-z0-9_:.-]{1,100}$", t) for t in tags), tags)
    ok("and no league that did not change", not any(t.startswith("api:games:") and t.split(":")[2] not in games_leagues + ["all"] for t in tags), tags)
    res = json.loads(psql(DS1, "select result::text from meta.data_release where number = '%s'" % num))
    ok("the result records the refresh and the leagues", res["revalidate"].startswith("ok") and res["leagues"] == games_leagues, res.get("revalidate"))
    rc, out, err = x.run()
    ok("a second run does nothing and calls the site no more", len(x.site.calls) == 1 and len(x.calls_of_stub()) == 1, out + err)

    # nothing new
    x.reset()
    q = queue()
    rc, out, err = x.run("nothing")
    r = req(q)
    ok("nothing new is a status of its own, with the Wikipedia note", r["status"] == "nothing" and "hours after games" in r["summary"] and not r["release_number"], r)
    ok("nothing new calls the site no more", x.site.calls == [])

    # the job fails
    x.reset()
    q = queue()
    rc, out, err = x.run("fail")
    r = req(q)
    ok("a failed job is failed, with its exit reason and its last output lines on the row, and no release",
       r["status"] == "failed" and "exit 3" in r["summary"] and "Last lines: " in r["summary"] and "boom" in r["summary"] and len(r["summary"]) <= 600
       and psql(PROD, "select count(*) from meta.data_release") == "0", r)
    q = queue_after_cooldown()
    rc, out, err = x.run("hookfail")
    ok("a release that could not be prepared is failed too", req(q)["status"] == "failed" and "could not be prepared" in req(q)["summary"], req(q))

    # a request nobody finished (the runner stopped)
    x.reset()
    q = queue()
    psql(PROD, "update meta.score_update_request set status = 'running', started_at = now()")
    rc, out, err = x.run()
    ok("a request left running by a stopped runner is failed", req(q)["status"] == "failed" and "stopped" in req(q)["summary"] and x.calls_of_stub() == [], req(q))

    # an open daily release already exists
    x.reset()
    sched(3)
    n, _ = prep_daily(T_ENV[0])
    q = queue()
    rc, out, err = x.run()
    ok("an open daily scores release is not duplicated: no job is started",
       req(q)["status"] == "done" and n in req(q)["summary"] and x.calls_of_stub() == [] and req(q)["release_number"] == n, req(q))


def queue_after_cooldown():
    end_request(11)
    return queue()


def request_policy(x):
    # Hold: the release is prepared but not approved
    x.reset()
    sched(4)
    pause("checking the feed")
    q = queue()
    rc, out, err = x.run()
    r = req(q)
    num = r["release_number"]
    ok("under Hold the release is prepared and stays pending for John", r["status"] == "done" and num and status(num) == "pending", out + err + str(r))
    ok("the summary says why", "on hold" in r["summary"], r)
    ok("it is not approved by anyone", psql(PROD, "select approved_by is null from meta.data_release where number = '%s'" % num) == "t")
    ok("no refresh was asked for", x.site.calls == [])
    resume()
    backdate(num, 0)
    rc, out, err = x.run()
    ok("after Resume the normal auto-approval takes the queue (once it is 10 minutes old)", status(num) == "pending", out + err)
    backdate(num)
    rc, out, err = x.run()
    ok("and then approves it as the runner, not as the request", status(num) == "done" and psql(PROD, "select approved_by from meta.data_release where number = '%s'" % num) == AUTO, out + err)

    # the policy is checked again: a release that does not meet it is not approved by the click
    x.reset()
    ids = sched(4)
    psql(DS1, "update core.game set broadcaster = 'Somebody' where game_id = %s" % ids[0])
    q = queue()
    rc, out, err = x.run()
    r = req(q)
    num = r["release_number"]
    ok("a release that fails the policy waits for John, with the reason", status(num) == "pending" and "policy" in r["summary"] and "broadcaster" in r["summary"], r)
    ok("it can still be approved by hand", approve(num)[0])

    # ... and right before the apply, for an approval the request made
    x.reset()
    sched(4)
    n, _ = prep_daily(T_ENV[0])
    psql(PROD, "update meta.data_release set status = 'approved', approved_by = 'request:john@example.com', approved_at = now() where number = '%s'" % n)
    psql(DS1, "update core.game set broadcaster = 'Late' where game_id = (select min(game_id) from core.game where status = 'final')")
    rc, out, err = x.run("scores", revalidate=True)
    ok("a request approval is re-checked before the apply: it goes back to pending, untouched",
       status(n) == "pending" and psql(PROD, "select approved_by is null from meta.data_release where number = '%s'" % n) == "t" and x.site.calls == [], out + err)
    # Hold set after the approval
    x.reset()
    sched(4)
    n, _ = prep_daily(T_ENV[0])
    psql(PROD, "update meta.data_release set status = 'approved', approved_by = 'request:john@example.com', approved_at = now() where number = '%s'" % n)
    pause()
    x.run()
    ok("Hold set after the approval sends it back to pending", status(n) == "pending")
    resume()

    # only a daily_scores release can be approved as request:
    x.reset()
    psql(DS1, "update core.venue set city = city || ' (q)' where venue_id = (select min(venue_id) from core.venue)")
    rc, out, err = x.env.rel("prepare", "--title", "Plain publish", "--tables", "core.venue")
    p = number_of(out)
    psql(PROD, "update meta.data_release set status = 'approved', approved_by = 'request:john@example.com', approved_at = now() where number = '%s'" % p)
    rc, out, err = x.run()
    ok("request: on another kind is refused and pauses the automatic approvals",
       status(p) == "failed" and flag().startswith("true|system|") and x.site.calls == [], out + err + flag())
    n2 = prep_daily_for(x)
    psql(PROD, "update meta.data_release set status = 'approved', approved_by = 'request:' where number = '%s'" % n2)
    x.run()
    ok("the same for a bare 'request:' name", status(n2) == "failed")


def prep_daily_for(x):
    psql(PROD, "update meta.auto_approval set paused = false")
    psql(DS1, "update meta.auto_approval set paused = false")
    sched(2)
    n, _ = prep_daily(T_ENV[0])
    return n


def request_lock(x):
    x.reset()
    sched(3)
    q = queue()
    held = daily_lock.Lock(dsn(DS1))
    ok("the lock can be taken", held.try_acquire())
    other = daily_lock.Lock(dsn(DS1))
    ok("and is exclusive: nobody else gets it", other.try_acquire() is False)
    rc, out, err = x.run()
    ok("while the scheduled daily job holds the lock the request stays queued and nothing runs",
       req(q)["status"] == "queued" and x.calls_of_stub() == [] and "holds the lock" in out, out + err)
    cli = subprocess.run([sys.executable, "-I", os.path.join(os.path.dirname(RELEASE), "daily_lock.py"), "--", "true"],
                         capture_output=True, text=True, env=dict(os.environ, PGHOST=HOST, PGPORT=PORT, PGUSER="postgres", PGDATABASE=T.DS1))
    ok("the lock command refuses to start a job meanwhile (exit 75)", cli.returncode == daily_lock.BUSY, cli.stderr)
    held.release()
    cli = subprocess.run([sys.executable, "-I", os.path.join(os.path.dirname(RELEASE), "daily_lock.py"), "--", sys.executable, "-c", "raise SystemExit(7)"],
                         capture_output=True, text=True, env=dict(os.environ, PGHOST=HOST, PGPORT=PORT, PGUSER="postgres", PGDATABASE=T.DS1))
    ok("free again: the lock command runs the job and passes its exit code on", cli.returncode == 7, cli.stderr)
    # the daily job's heartbeat
    psql(DS1, "create schema if not exists ingest")
    psql(DS1, "\\i %s" % os.path.join(REPO, "db", "migrations", "048_ingest_daily_run.sql"))
    psql(DS1, "insert into ingest.daily_run (outcome) values ('running')")
    rc, out, err = x.run()
    ok("a daily run that is running (heartbeat) also keeps the request queued", req(q)["status"] == "queued" and x.calls_of_stub() == [] and "daily job is running" in out, out + err)
    psql(DS1, "update ingest.daily_run set outcome = 'ok', finished_at = now()")
    rc, out, err = x.run()
    ok("when it has ended the request runs", req(q)["status"] == "done" and len(x.calls_of_stub()) == 1, out + err + str(req(q)))
    ok("and the lock is free again afterwards", (lambda lk: (lk.try_acquire(), lk.release())[0])(daily_lock.Lock(dsn(DS1))))


def revalidate_cases(x):
    # a plain release
    x.reset()
    psql(DS1, "update core.person set nickname = 'rv' where person_id = (select min(person_id) from core.person)")
    rc, out, err = x.env.rel("prepare", "--title", "A person", "--tables", "core.person")
    n = number_of(out)
    ok("nothing is sent before the approval", x.site.calls == [])
    approve(n)
    rc, out, err = x.run()
    ok("one request per release, after the commit", status(n) == "done" and len(x.site.calls) == 1, out + err)
    tags = x.site.calls[0]["body"]["tags"]
    views = psql(DS1, "select string_agg(distinct c.relname, ',') from pg_class c join pg_depend d on d.refobjid = 'core.person'::regclass "
                      "join pg_rewrite r on r.oid = d.objid and d.classid = 'pg_rewrite'::regclass and r.ev_class = c.oid where c.relnamespace = 'api'::regnamespace")
    ok("a release that cannot name leagues refreshes the whole view: api:<view> for the views that read the table",
       "data-version" in tags and all("api:%s" % v in tags for v in views.split(",")) and not any(t.count(":") == 2 for t in tags), (tags, views))
    res = json.loads(psql(DS1, "select result::text from meta.data_release where number = '%s'" % n))
    ok("the result records it", res["revalidate"] == "ok (%d tags)" % len(tags), res.get("revalidate"))
    ok("the views come from DS1's catalog", views and "api:" + views.split(",")[0] in tags, views)
    # a table no api view reads: every api tag is refreshed
    x.reset()
    psql(DS1, "update core.venue set city = city || ' (a)' where venue_id = (select min(venue_id) from core.venue)")
    rc, out, err = x.env.rel("prepare", "--title", "Venue city", "--tables", "core.venue")
    n = number_of(out)
    approve(n)
    x.run()
    ok("a table with no api view behind it refreshes every api tag", x.site.calls and x.site.calls[0]["body"]["tags"] == ["data-version", "api"], x.site.calls)
    # the site is down: the release still counts
    x.reset()
    x.site.code = 500
    psql(DS1, "update core.venue set city = city || ' (s)' where venue_id = (select min(venue_id) from core.venue)")
    rc, out, err = x.env.rel("prepare", "--title", "Venue city", "--tables", "core.venue")
    n = number_of(out)
    approve(n)
    rc, out, err = x.run()
    res = json.loads(psql(DS1, "select result::text from meta.data_release where number = '%s'" % n))
    ok("a site that answers 500 does not fail the release; it is recorded, and tried once", status(n) == "done" and res["revalidate"].startswith("failed") and len(x.site.calls) == 1, res.get("revalidate"))
    # not configured
    x.reset()
    psql(DS1, "update core.venue set city = city || ' (t)' where venue_id = (select min(venue_id) from core.venue)")
    rc, out, err = x.env.rel("prepare", "--title", "Venue city", "--tables", "core.venue")
    n = number_of(out)
    approve(n)
    rc, out, err = x.run(revalidate=False)
    res = json.loads(psql(DS1, "select result::text from meta.data_release where number = '%s'" % n))
    ok("without REVALIDATE_URL / REVALIDATE_SECRET nothing is sent and the release is fine", status(n) == "done" and res["revalidate"] == "off" and x.site.calls == [], out + err)
    # not https
    x.reset()
    psql(DS1, "update core.venue set city = city || ' (u)' where venue_id = (select min(venue_id) from core.venue)")
    rc, out, err = x.env.rel("prepare", "--title", "Venue city", "--tables", "core.venue")
    n = number_of(out)
    approve(n)
    x.env.rel("--daily-script", x.stub, "run", env={"REVALIDATE_URL": "http://example.com/api/revalidate", "REVALIDATE_SECRET": REV_SECRET})
    res = json.loads(psql(DS1, "select result::text from meta.data_release where number = '%s'" % n))
    ok("a plain http address (other than this computer) is never used", res["revalidate"].startswith("failed") and "https" in res["revalidate"], res.get("revalidate"))
    # a refused release and a ds1_step change nothing on production: no call
    x.reset()
    psql(DS1, "update core.venue set city = city || ' (v)' where venue_id = (select min(venue_id) from core.venue)")
    rc, out, err = x.env.rel("prepare", "--title", "Venue city", "--tables", "core.venue")
    n = number_of(out)
    psql(DS1, "update core.venue set city = city || ' (w)' where venue_id = (select min(venue_id) from core.venue)")
    approve(n)
    rc, out, err = x.run()
    ok("a release refused before it changed anything makes no call", status(n) == "failed" and x.site.calls == [], out + err)
    # a rollback changes production again
    x.reset()
    psql(DS1, "update core.venue set city = city || ' (x)' where venue_id = (select min(venue_id) from core.venue)")
    rc, out, err = x.env.rel("prepare", "--title", "Venue city", "--tables", "core.venue")
    n = number_of(out)
    approve(n)
    x.run()
    rc, out, err = x.env.rel("rollback", "--release", n)
    rb = number_of(out)
    approve(rb)
    x.site.calls.clear()
    rc, out, err = x.run()
    ok("a rollback asks for one refresh too", status(rb) == "done" and len(x.site.calls) == 1, out + err)


def ask_drift(actor="john@example.com", secret=None):
    return req_call("api.request_drift_check('SECRET', '%s')" % actor, secret)


def old_sync():
    for db in (DS1, PROD):
        psql(db, "delete from meta.sync_status; insert into meta.sync_status (table_name, ds1_rows, prod_rows, state, checked_at, detail) values "
                 "('core.person', 1, 2, 'differs', now() - interval '2 days', 'old'), ('core.game', 1, 1, 'differs', now() - interval '2 days', 'old')")


def sync_row(db, table):
    return psql(db, "select state || '|' || (checked_at > now() - interval '5 minutes') || '|' || coalesce(detail, '') from meta.sync_status where table_name = '%s'" % table)


def sync_cases(x):
    x.reset()
    old_sync()
    psql(DS1, "update core.person set nickname = 'sy' where person_id = (select min(person_id) from core.person)")
    rc, out, err = x.env.rel("prepare", "--title", "A person", "--tables", "core.person")
    n = number_of(out)
    ok("before the release the sync status is the old comparison", sync_row(PROD, "core.person") == "differs|false|old")
    approve(n)
    rc, out, err = x.run()
    res = json.loads(psql(DS1, "select result::text from meta.data_release where number = '%s'" % n))
    ok("after a committed release its tables are compared again, on both sides",
       status(n) == "done" and res["sync_status"] == "ok" and sync_row(PROD, "core.person") == "same|true|" and sync_row(DS1, "core.person") == "same|true|", out + err)
    ok("other tables keep the older result", sync_row(PROD, "core.game") == "differs|false|old" and sync_row(DS1, "core.game") == "differs|false|old")
    # a release that was refused changed nothing, so the status stays
    x.reset()
    old_sync()
    psql(DS1, "update core.person set nickname = 'sz' where person_id = (select min(person_id) from core.person)")
    rc, out, err = x.env.rel("prepare", "--title", "A person", "--tables", "core.person")
    n = number_of(out)
    psql(DS1, "update core.person set nickname = 'sw' where person_id = (select min(person_id) from core.person)")
    approve(n)
    x.run()
    ok("a refused release leaves the sync status alone", status(n) == "failed" and sync_row(PROD, "core.person") == "differs|false|old")

    # "Check now"
    x.reset()
    good, err_ = ask_drift(secret="wrong" * 10)
    ok("a drift request needs the secret", not good and "not allowed" in err_, err_)
    ok("and refuses the runner's names", not ask_drift("system")[0] and not ask_drift("request:x")[0])
    good, err_ = ask_drift()
    ok("a drift request is queued with its kind", good and req()["kind"] == "drift" and req()["status"] == "queued", err_)
    ok("one open request at a time, whatever the kind", not ask_drift()[0] and not ask()[0])
    end_request(2)
    ok("a drift request waits for the cooldown", not ask_drift()[0])
    good, err_ = ask()
    ok("the cooldown is per kind: a scores request can be made", good and req()["kind"] == "scores", err_)
    # the runner does it, with the stub never called
    x.reset()
    psql(DS1, "update core.person set nickname = 'dr' where person_id = (select min(person_id) from core.person)")
    q = queue_drift()
    rc, out, err = x.run()
    r = req(q)
    ok("the runner runs the drift check and says what it found, with the fix release",
       r["status"] == "done" and "differ" in r["summary"] and "core.person" in r["summary"] and r["release_number"] and "Fix release" in r["summary"], out + err + str(r))
    ok("the fix is a pending release prepared by drift, not approved", status(r["release_number"]) == "pending"
       and psql(DS1, "select created_by from meta.data_release where number = '%s'" % r["release_number"]) == "drift")
    ok("the sync status is written on both sides", sync_row(PROD, "core.person").startswith("differs|true|") and sync_row(DS1, "core.person").startswith("differs|true|"))
    ok("no scores job was started and the site was not asked to refresh", x.calls_of_stub() == [] and x.site.calls == [])
    x.reset()
    q = queue_drift()
    rc, out, err = x.run()
    ok("with nothing different it says everything matches", req(q)["status"] == "done" and "all match" in req(q)["summary"] and not req(q)["release_number"], req(q))


def queue_drift():
    good, err_ = ask_drift()
    assert good, err_
    return req()["id"]


CASES = (requests_db, request_flow, request_policy, request_lock, revalidate_cases, sync_cases)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="spx_stats", help="database to copy the small template from (only read)")
    ap.add_argument("--only", help="run only the named test functions (comma-separated)")
    a = ap.parse_args()
    T.make_base(a.source)
    env = T.Env()
    T_ENV[0] = env
    site = Site()
    x = Ctx2(env, site)
    try:
        for fn in CASES:
            if a.only and fn.__name__ not in a.only.split(","):
                continue
            print("--- " + fn.__name__, flush=True)
            fn(x)
    finally:
        site.close()
        env.close()
    print("\n%d failed" % len(T.failures) if T.failures else "\nall passed")
    for f in T.failures:
        print("  FAILED: " + f)
    return 1 if T.failures else 0


if __name__ == "__main__":
    sys.exit(main())

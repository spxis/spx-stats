#!/usr/bin/env python3
"""End-to-end test of the data release flow on a local Postgres (the Docker container spx-stats-local), with no DS1,
no production and no Supabase. Two scratch databases stand in for DS1 and production, and mock_api.py stands in for the
Management API. The source database is only used as a template and is never modified.

    python3 -I scripts/release/test/test_release.py [--source spx_stats]

Needs psql, git and python3 (standard library only). Environment: TEST_PG_HOST (127.0.0.1), TEST_PG_PORT (55432).
Exit code: 0 all passed, 1 a check failed.
"""
import argparse
import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RELEASE = os.path.join(HERE, "..", "release.py")
COMPARE = os.path.join(REPO, "scripts", "sync", "compare.py")
MOCK = os.path.join(HERE, "mock_api.py")
HOST = os.environ.get("TEST_PG_HOST", "127.0.0.1")
PORT = os.environ.get("TEST_PG_PORT", "55432")
BASE, DS1, PROD = "spx_rel_base", "spx_rel_ds1", "spx_rel_prod"
SECRET = secrets.token_hex(24)
failures = []


def dsn(db):
    return "host=%s port=%s user=postgres dbname=%s" % (HOST, PORT, db)


def psql(db, sql, check=True, role=None):
    text = ("set role %s;\n" % role if role else "") + sql
    r = subprocess.run(["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", HOST, "-p", PORT, "-U", "postgres", "-d", db, "-f", "-"],
                       input=text, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError("psql %s failed: %s" % (db, r.stderr.strip()))
    return r if not check else r.stdout.strip()


def ok(name, cond, detail=""):
    print("%s  %s%s" % ("PASS" if cond else "FAIL", name, ("  -> " + str(detail)) if (detail and not cond) else ""), flush=True)
    if not cond:
        failures.append(name)


def make_base(source):
    exists = psql("postgres", "select 1 from pg_database where datname = '%s'" % BASE)
    if exists:
        return
    print("building the small template database %s from %s (one time, about a minute)" % (BASE, source), flush=True)
    psql("postgres", "create database %s template %s" % (BASE, source))
    psql(BASE, """
        drop schema if exists legacy_alignment, legacy_files, legacy_franchise_info, legacy_lahman, legacy_mongo, legacy_nflverse,
          legacy_nhlapi, legacy_people, legacy_retrosheet, legacy_spx, legacy_team_brand, legacy_wikidata, legacy_wikipedia_awards,
          legacy_wikipedia_cfl, legacy_wikipedia_nba cascade;
        delete from core.game where game_date not between '2012-10-01' and '2012-12-31';
        truncate core.external_id, core.betting_line, meta.verification, meta.data_issue;
        delete from core.player_season_stat where random() > 0.02;
        \\i %s
    """ % os.path.join(REPO, "db", "migrations", "045_data_releases.sql"))
    psql(BASE, "vacuum full")


def fresh():
    for db in (DS1, PROD):
        psql("postgres", "drop database if exists %s with (force)" % db)
        psql("postgres", "create database %s template %s" % (db, BASE))
        psql(db, "\\i %s" % os.path.join(REPO, "db", "migrations", "047_auto_approval.sql"))
    h = __import__("hashlib").sha256(SECRET.encode()).hexdigest()
    psql(PROD, "insert into meta.release_secret (secret_hash) values ('%s')" % h)


class Env:
    def __init__(self):
        self.tmp = tempfile.mkdtemp(prefix="relt-")
        self.snap = os.path.join(self.tmp, "snap")
        self.ctl = os.path.join(self.tmp, "ctl.json")
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
        self.url = "http://127.0.0.1:%d/v1/projects/test/database/query" % port
        self.mock = subprocess.Popen([sys.executable, "-I", MOCK, str(port), dsn(PROD), self.ctl])
        for _ in range(50):
            try:
                socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
                break
            except OSError:
                time.sleep(0.1)
        self.repo = None

    def close(self):
        self.mock.terminate()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def api(self, sql):
        req = urllib.request.Request(self.url, data=json.dumps({"query": sql}).encode(), method="POST",
                                     headers={"Authorization": "Bearer test", "Content-Type": "application/json"})
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read().decode())

    def rel(self, *args, env=None):
        e = dict(os.environ, SUPABASE_ACCESS_TOKEN="test", RELEASE_SNAPSHOT_DIR=self.snap, RELEASE_MAIN_REF="HEAD")
        if self.repo:
            e["RELEASE_REPO"] = self.repo
        e.update(env or {})
        r = subprocess.run([sys.executable, "-I", RELEASE, "--ds1-dsn", dsn(DS1), "--api-url", self.url] + list(args),
                           capture_output=True, text=True, env=e)
        return r.returncode, r.stdout, r.stderr


def number_of(out):
    for line in out.splitlines():
        if line.startswith("release "):
            return line.split()[1]
    return None


def rid(num):
    return int(psql(PROD, "select id from meta.data_release where number = '%s'" % num))


def status(num, db=PROD):
    return psql(db, "select status from meta.data_release where number = '%s'" % num)


def approve(num, yes=True, secret=None, role="anon"):
    r = psql(PROD, "select api.approve_release('%s', %d, %s, 'tester@example.com')" % (secret or SECRET, rid(num), "true" if yes else "false"),
             check=False, role=role)
    return r.returncode == 0, r.stderr.strip()


def person_fp(db):
    return psql(db, "select md5(string_agg(t::text, ',' order by person_id)) from core.person t")


def compare_same(tables):
    out = tempfile.mkdtemp(prefix="cmp-")
    r = subprocess.run([sys.executable, "-I", COMPARE, "--out", out, "--tables", tables, "--ds1-dsn", dsn(DS1), "--prod-dsn", dsn(PROD)],
                       capture_output=True, text=True)
    shutil.rmtree(out, ignore_errors=True)
    return r.returncode == 0, r.stdout


def main_flow(env):
    fresh()
    rc, out, err = env.rel("checks")
    ok("checks pass on the template data", rc == 0, out + err)

    psql(DS1, """
        insert into core.person (full_name, kind) select 'Test Person ' || g, 'player' from generate_series(1, 20) g;
        update core.person set nickname = 'nick' || person_id where person_id in (select person_id from core.person order by person_id limit 10);
    """)
    psql(PROD, "insert into core.person (person_id, full_name, kind) overriding system value select 900000 + g, 'Prod Only ' || g, 'player' from generate_series(1, 3) g")

    # prepare
    rc, out, err = env.rel("--by", "tester", "prepare", "--title", "Test people", "--tables", "core.person", "--ticket", "T-1")
    n1 = number_of(out)
    ok("prepare succeeds", rc == 0 and n1, out + err)
    pv = json.loads(psql(DS1, "select preview::text from meta.data_release where number = '%s'" % n1))
    p = pv["tables"]["core.person"]
    ok("preview counts: add 20, change 10, remove 3", (p["add"], p["change"], p["remove"]) == (20, 10, 3), p)
    ok("release exists on both sides, pending", status(n1) == "pending" and status(n1, DS1) == "pending")
    ok("same digest on both sides", psql(PROD, "select digest from meta.data_release where number = '%s'" % n1) == psql(DS1, "select digest from meta.data_release where number = '%s'" % n1))
    ok("number looks like YYYY.MM.DD-N", len(n1.split("-")) == 2 and n1.count(".") == 2)

    # the approval path is narrow
    r = psql(PROD, "update meta.data_release set status = 'approved' where number = '%s'" % n1, check=False, role="anon")
    ok("anon cannot update a release", r.returncode != 0 and "permission denied" in r.stderr, r.stderr)
    r = psql(PROD, "select * from meta.data_release", check=False, role="anon")
    ok("anon cannot read releases", r.returncode != 0 and "permission denied" in r.stderr)
    r = psql(PROD, "select * from meta.release_secret", check=False, role="anon")
    ok("anon cannot read the secret hash", r.returncode != 0)
    r = psql(PROD, "insert into meta.data_release (id, number, kind, title, tables, status, digest, created_by) values (99, '2026.01.01-9', 'publish', 'x y z', '{}', 'approved', 'd', 'x')", check=False, role="anon")
    ok("anon cannot insert an approved release", r.returncode != 0)
    good, err_ = approve(n1, secret="wrong" * 10)
    ok("wrong secret is refused", not good and "not allowed" in err_, err_)
    good, err_ = approve(n1, secret="short")
    ok("short secret is refused", not good)
    r = psql(PROD, "select api.release_dashboard('nope')", check=False, role="anon")
    ok("dashboard needs the secret", r.returncode != 0 and "not allowed" in r.stderr)
    dash = json.loads(psql(PROD, "select api.release_dashboard('%s')::text" % SECRET, role="anon"))
    ok("dashboard lists the pending release", [x["number"] for x in dash["pending"]] == [n1] and "digest" not in dash["pending"][0], dash["pending"])
    ok("dashboard has sync, space, database size", "sync" in dash and len(dash["space"]) > 5 and dash["database_bytes"] > 0)

    # nothing approved: run does nothing
    rc, out, err = env.rel("run")
    ok("run with nothing approved does nothing", rc == 0 and status(n1) == "pending", out + err)

    pre_fp = person_fp(PROD)
    good, err_ = approve(n1)
    ok("approve works through the function as anon", good, err_)
    good, err_ = approve(n1)
    ok("approving twice is refused", not good, err_)
    ok("DS1 copy is still pending until the runner sees it", status(n1, DS1) == "pending")

    rc, out, err = env.rel("run")
    ok("run succeeds", rc == 0, out + err)
    ok("release is done on both sides", status(n1) == "done" and status(n1, DS1) == "done", (status(n1), status(n1, DS1), out, err))
    ok("approver recorded on both sides", psql(DS1, "select approved_by from meta.data_release where number = '%s'" % n1) == "tester@example.com")
    ok("production now equals DS1 for core.person", compare_same("core.person")[0])
    ok("person fingerprints equal", person_fp(PROD) == person_fp(DS1))
    res = json.loads(psql(PROD, "select result::text from meta.data_release where number = '%s'" % n1))
    ok("result has counts and verification", res["tables"]["core.person"]["add"] == 20 and res["verified"] is True, res)
    snap = os.path.join(env.snap, n1)
    ok("snapshot files written", os.path.exists(os.path.join(snap, "core_person.tsv.gz")) and os.path.exists(os.path.join(snap, "manifest.json")))
    ok("DS1 backup schema holds the replaced and removed rows",
       psql(DS1, 'select count(*) from backup_release_%d."core.person"' % rid(n1)) == "13")
    ok("nothing was written into production for the backup",
       psql(PROD, "select count(*) from pg_namespace where nspname like 'backup_release%'") == "0")
    ok("no staging tables left on production", psql(PROD, "select count(*) from pg_class where relname ~ '^r[sd]_[0-9]'") == "0")
    ok("footer view shows the latest done release", psql(PROD, "select number from api.data_version", role="anon") == n1)

    # rollback
    rc, out, err = env.rel("rollback", "--release", n1)
    n2 = number_of(out)
    ok("rollback is prepared as its own release", rc == 0 and n2 and status(n2) == "pending", out + err)
    rc, out, err = env.rel("run")
    ok("the rollback does not run without approval", status(n2) == "pending")
    approve(n2)
    rc, out, err = env.rel("run")
    ok("rollback runs", rc == 0 and status(n2) == "done", out + err + status(n2))
    ok("production is exactly as before the release", person_fp(PROD) == pre_fp)
    ok("original release is marked rolled_back", status(n1) == "rolled_back" and status(n1, DS1) == "rolled_back")
    ok("footer shows the rollback", psql(PROD, "select number from api.data_version", role="anon") == n2)
    rc, out, err = env.rel("rollback", "--release", n1)
    ok("a rolled-back release cannot be rolled back again", rc == 0 and "BLOCKER" in out and "only a finished publish" in out, out + err)
    bl = number_of(out)
    good, err_ = approve(bl)
    ok("a release with blockers cannot be approved", not good, err_)
    approve(bl, yes=False)
    ok("but it can be rejected", status(bl) == "rejected")


def guardrails(env):
    fresh()
    psql(DS1, "delete from core.person_career where ctid in (select ctid from core.person_career limit 1000)")
    rc, out, err = env.rel("prepare", "--title", "Shrink test", "--tables", "core.person_career")
    n = number_of(out)
    ok("a shrinking release is prepared with a blocker", rc == 0 and n and "would shrink" in out, out + err)
    good, err_ = approve(n)
    ok("the blocker stops the approval", not good and status(n) == "pending", err_)
    approve(n, yes=False)
    before = psql(PROD, "select count(*) from core.person_career")
    rc, out, err = env.rel("prepare", "--title", "Shrink test, on purpose", "--tables", "core.person_career", "--replace")
    n = number_of(out)
    ok("with --replace there is no shrink blocker", rc == 0 and "BLOCKER" not in out, out + err)
    rc, out, err = env.rel("prepare", "--title", "Too big", "--tables", "core.person_career", "--replace", env={"RELEASE_MAX_DB_MB": "1"})
    ok("the database size limit is a blocker", "production would reach" in out, out + err)
    approve(number_of(out), yes=False)
    approve(n)
    rc, out, err = env.rel("run")
    ok("replace release runs", status(n) == "done", out + err + status(n))
    ok("production now has the smaller table", psql(PROD, "select count(*) from core.person_career") == psql(DS1, "select count(*) from core.person_career") != before)
    ok("the deleted rows are in the snapshot", psql(DS1, 'select count(*) from backup_release_%d."core.person_career"' % rid(n)) == "1000")

    # changed since the preview
    psql(DS1, "update core.venue set city = city || ' (x)' where venue_id = (select min(venue_id) from core.venue)")
    rc, out, err = env.rel("prepare", "--title", "Venue name", "--tables", "core.venue")
    n = number_of(out)
    ok("venue release prepared", rc == 0 and n, out + err)
    approve(n)
    psql(DS1, "update core.venue set city = city || ' (y)' where venue_id = (select max(venue_id) from core.venue)")
    pv = psql(PROD, "select count(*) from core.venue where city like '%(%)'")
    rc, out, err = env.rel("run")
    ok("a release is refused when DS1 changed after the preview", status(n) == "failed" and "changed since the preview" in psql(PROD, "select error from meta.data_release where number = '%s'" % n), out + err)
    ok("production is unchanged by the refused release", psql(PROD, "select count(*) from core.venue where city like '%(%)'") == pv)
    ok("the refusal is recorded on both sides", status(n, DS1) == "failed")

    # a failed check blocks a release
    psql(DS1, "insert into core.standing (team_season_id, phase, as_of, source_id, is_final) select team_season_id, phase, as_of + 1, source_id, true from core.standing where is_final limit 1")
    rc, out, err = env.rel("prepare", "--title", "Blocked by a check", "--tables", "core.venue")
    n = number_of(out)
    ok("a failing check is a blocker", rc == 0 and "check 020_duplicate_keys" in out, out + err)
    good, _ = approve(n)
    ok("and the release cannot be approved", not good)
    approve(n, yes=False)
    psql(DS1, "delete from core.standing where as_of in (select max(as_of) from core.standing where is_final)")


def failure_cases(env):
    fresh()
    psql(DS1, """
        insert into core.person (full_name, kind) select 'Test Person ' || g, 'player' from generate_series(1, 20) g;
        insert into core.person (full_name, kind) values ('BAD NAME', 'player');
    """)
    psql(PROD, "alter table core.person add constraint no_bad check (full_name <> 'BAD NAME')")
    pre = person_fp(PROD)
    rc, out, err = env.rel("prepare", "--title", "Fails halfway", "--tables", "core.person")
    n = number_of(out)
    approve(n)
    rc, out, err = env.rel("run")
    ok("a failing apply marks the release failed", status(n) == "failed" and status(n, DS1) == "failed", out + err)
    ok("the error names the problem", "no_bad" in psql(PROD, "select error from meta.data_release where number = '%s'" % n))
    ok("production is unchanged after a failure mid-apply", person_fp(PROD) == pre)
    ok("no staging tables are left on production", psql(PROD, "select count(*) from pg_class where relname ~ '^r[sd]_[0-9]'") == "0")
    ok("the snapshot of a failed release stays on DS1 only", psql(PROD, "select count(*) from pg_namespace where nspname like 'backup_release%'") == "0")

    # an answer lost after the commit is not a failure
    psql(PROD, "alter table core.person drop constraint no_bad")
    rc, out, err = env.rel("prepare", "--title", "Lost answer", "--tables", "core.person")
    n = number_of(out)
    approve(n)
    with open(env.ctl, "w") as f:
        json.dump({"drop_after_commit": "do \\$apply\\$"}, f)
    rc, out, err = env.rel("run")
    os.remove(env.ctl)
    ok("a lost answer after the commit is detected and the release counted as applied",
       status(n) == "done" and person_fp(PROD) == person_fp(DS1), out + err + status(n))

    # a run that stopped leaves a release 'running': it is marked failed, never run again
    psql(DS1, "insert into core.person (full_name, kind) values ('Another', 'player')")
    rc, out, err = env.rel("prepare", "--title", "Stopped runner", "--tables", "core.person")
    n = number_of(out)
    psql(DS1, "update meta.data_release set status = 'running' where number = '%s'" % n)
    rc, out, err = env.rel("run")
    ok("a release left running is marked failed", status(n, DS1) == "failed", out + err)

    # a tampered approval (production row differs from DS1's copy) is refused
    rc, out, err = env.rel("prepare", "--title", "Tampered", "--tables", "core.person")
    n = number_of(out)
    psql(PROD, "update meta.data_release set status = 'approved', digest = 'forged' where number = '%s'" % n)
    rc, out, err = env.rel("run")
    ok("an approved release that does not match DS1's copy is refused", status(n, DS1) == "failed" and status(n) == "failed", out + err)
    psql(PROD, "insert into meta.data_release (id, number, kind, title, tables, status, digest, created_by) values (9999, '2026.01.01-9', 'publish', 'unknown one', '{core.person}', 'approved', 'd', 'x')")
    rc, out, err = env.rel("run")
    ok("a release DS1 never prepared is refused", psql(PROD, "select status from meta.data_release where id = 9999") == "failed", out + err)


def drift_case(env):
    fresh()
    psql(DS1, "update core.venue set city = city || ' (z)' where venue_id = (select min(venue_id) from core.venue)")
    psql(PROD, "delete from core.franchise_owner where ctid in (select ctid from core.franchise_owner limit 2)")
    rc, out, err = env.rel("drift")
    ok("drift reports differences (exit 1)", rc == 1, out + err)
    ok("sync_status written on DS1 and production",
       psql(DS1, "select count(*) from meta.sync_status") == psql(PROD, "select count(*) from meta.sync_status") != "0")
    ok("sync_status says venue differs", psql(PROD, "select state from meta.sync_status where table_name = 'core.venue'") == "differs")
    ok("sync_status says game is the same", psql(PROD, "select state from meta.sync_status where table_name = 'core.game'") == "same")
    ok("release bookkeeping tables are not compared", psql(PROD, "select count(*) from meta.sync_status where table_name in ('meta.data_release', 'meta.sync_status')") == "0")
    pend = psql(PROD, "select number || ' ' || created_by || ' ' || array_to_string(tables, ',') from meta.data_release where status = 'pending'")
    ok("one pending fix release proposed by drift", pend.count("drift") == 1 and "core.venue" in pend and "core.franchise_owner" in pend, pend)
    rc, out, err = env.rel("drift")
    ok("a second drift run replaces the proposal", psql(PROD, "select count(*) from meta.data_release where status = 'pending'") == "1"
       and psql(PROD, "select count(*) from meta.data_release where status = 'rejected'") == "1")
    n = psql(PROD, "select number from meta.data_release where status = 'pending'")
    ok("drift never approves", status(n) == "pending")
    approve(n)
    rc, out, err = env.rel("run")
    ok("the approved fix runs", status(n) == "done", out + err)
    rc, out, err = env.rel("drift")
    ok("after the fix drift is clean", rc == 0 and psql(PROD, "select count(*) from meta.data_release where status = 'pending'") == "0", out + err)
    ok("sync_status all same", psql(PROD, "select count(*) from meta.sync_status where state <> 'same'") == "0")


def step_cases(env):
    fresh()
    repo = os.path.join(env.tmp, "repo")
    os.makedirs(os.path.join(repo, "db", "build"))
    shutil.copytree(os.path.join(REPO, "db", "checks"), os.path.join(repo, "db", "checks"))
    files = {
        "900_good.sql": "begin;\ncreate table meta.step_probe (n int);\ninsert into meta.step_probe select generate_series(1, 3);\ncommit;\n",
        "901_syntax.sql": "create tabel meta.nope (n int);\n",
        "902_worse.sql": "insert into core.external_id (entity_kind, entity_id, source_id, external_key) values ('game', 999999999, 1, 'x');\n",
        "903_shell.sql": "\\! echo hi\n",
    }
    for name, body in files.items():
        with open(os.path.join(repo, "db", "build", name), "w") as f:
            f.write(body)
    for cmd in (["init", "-q"], ["add", "."], ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "x"]):
        subprocess.run(["git", "-C", repo] + cmd, check=True, capture_output=True)
    env.repo = repo
    rc, out, err = env.rel("prepare", "--kind", "ds1_step", "--file", "db/build/900_good.sql", "--title", "Probe table")
    n = number_of(out)
    ok("ds1_step prepared with a dry run", rc == 0 and n and "BLOCKER" not in out, out + err)
    ok("the dry run changed nothing on DS1", psql(DS1, "select to_regclass('meta.step_probe') is null") == "t")
    pv = json.loads(psql(DS1, "select preview::text from meta.data_release where number = '%s'" % n))
    ok("preview shows the counts after", pv["after"].get("meta.step_probe") == 3, pv)
    ok("ds1_step also on production for approval", status(n) == "pending")
    approve(n)
    rc, out, err = env.rel("run")
    ok("ds1_step runs on DS1", status(n) == "done" and psql(DS1, "select count(*) from meta.step_probe") == "3", out + err + status(n))
    ok("ds1_step does not touch production", psql(PROD, "select to_regclass('meta.step_probe') is null") == "t")
    ok("footer ignores a ds1_step", psql(PROD, "select count(*) from api.data_version", role="anon") == "0")
    rc, out, err = env.rel("prepare", "--kind", "ds1_step", "--file", "db/build/901_syntax.sql", "--title", "Syntax error")
    ok("a file that fails on DS1 is a blocker", rc == 0 and "BLOCKER: the file fails on DS1" in out, out + err)
    rc, out, err = env.rel("prepare", "--kind", "ds1_step", "--file", "db/build/902_worse.sql", "--title", "Makes a check worse")
    ok("a file that makes a check worse is a blocker", "makes a check worse" in out, out + err)
    rc, out, err = env.rel("prepare", "--kind", "ds1_step", "--file", "db/build/903_shell.sql", "--title", "Shell command")
    ok("a file with a psql backslash command is refused", rc == 1 and "backslash" in err, out + err)
    rc, out, err = env.rel("prepare", "--kind", "ds1_step", "--file", "../etc/passwd", "--title", "Path escape")
    ok("a file outside db/ is refused", rc != 0)
    with open(os.path.join(repo, "db", "build", "900_good.sql"), "a") as f:
        f.write("-- edited\n")
    rc, out, err = env.rel("prepare", "--kind", "ds1_step", "--file", "db/build/900_good.sql", "--title", "Uncommitted")
    ok("an uncommitted file is refused", rc != 0 and "committed" in err, out + err)
    env.repo = None

def float_case(env):
    fresh()
    ids = "(select person_id from core.person order by person_id limit 40)"
    psql(DS1, "update core.person set birth_lat = random() * 180 - 90, birth_lon = 49.89555555555555 + random() where person_id in %s" % ids)
    psql(DS1, "insert into core.person (full_name, kind, birth_lat, birth_lon) select 'Float ' || g, 'player', 1.0 / (g + 2), -123.45678901234567 from generate_series(1, 5) g")
    psql(PROD, "update core.person set birth_lat = 49.89555555555555 where person_id = (select min(person_id) from core.person)")
    shown = env.api("select to_json(birth_lat::text) from core.person where birth_lat = 49.89555555555555")[0]["j"]
    ok("the mock API rounds floats to 15 digits like the real one", shown == "49.8955555555556", shown)
    exact = "set extra_float_digits = 3; select md5(string_agg(person_id || ':' || coalesce(birth_lat::text, '') || ':' || coalesce(birth_lon::text, ''), ',' order by person_id)) from core.person"
    before = psql(PROD, exact).splitlines()[-1]
    rc, out, err = env.rel("prepare", "--title", "Float values", "--tables", "core.person")
    n = number_of(out)
    ok("float release prepared", rc == 0 and n, out + err)
    approve(n)
    rc, out, err = env.rel("run")
    ok("a release with float columns verifies and is done", status(n) == "done", out + err + psql(PROD, "select error from meta.data_release where number = '%s'" % n))
    ok("the stored float values are identical on both sides", psql(PROD, exact).splitlines()[-1] == psql(DS1, exact).splitlines()[-1])
    ok("compare.py agrees", compare_same("core.person")[0])
    psql(DS1, "update core.person set birth_lat = birth_lat + 1e-14 where person_id = (select min(person_id) from core.person where birth_lat is not null and person_id not in (select min(person_id) from core.person))")
    rc, out, err = env.rel("prepare", "--title", "Tiny float change", "--tables", "core.person")
    pv = json.loads(psql(DS1, "select preview::text from meta.data_release where number = '%s'" % number_of(out)))["tables"]["core.person"]
    ok("a change in the 14th decimal of a float is seen", (pv["add"], pv["change"], pv["remove"]) == (0, 1, 0), pv)
    approve(number_of(out), yes=False)
    rc, out, err = env.rel("rollback", "--release", n)
    rn = number_of(out)
    approve(rn)
    rc, out, err = env.rel("run")
    ok("rolling back a float release restores the exact values", status(rn) == "done" and psql(PROD, exact).splitlines()[-1] == before, out + err)


def restore_case(env):
    fresh()
    ddl = "create table core.rel_swap (id int primary key, code text not null unique, note text);\ninsert into core.rel_swap values (1, 'a'), (2, 'b');"
    psql(DS1, ddl)
    psql(PROD, ddl + """
        create function core.rel_swap_tamper() returns trigger language plpgsql as $$ begin if new.code = 'c' then new.note := 'tampered'; end if; return new; end $$;
        create trigger tamper before insert or update on core.rel_swap for each row execute function core.rel_swap_tamper();""")
    psql(DS1, "update core.rel_swap set code = case id when 1 then 'c' else 'a' end")
    rc, out, err = env.rel("prepare", "--title", "Codes swap places", "--tables", "core.rel_swap")
    n = number_of(out)
    ok("swap release prepared", rc == 0 and n, out + err)
    approve(n)
    rc, out, err = env.rel("run")
    error = psql(PROD, "select error from meta.data_release where number = '%s'" % n)
    ok("a failed verification restores the snapshot even when ids swap natural keys",
       status(n) == "failed" and "snapshot was restored" in error, error + out + err)
    ok("production is exactly as it was", psql(PROD, "select string_agg(id || code || coalesce(note, ''), ',' order by id) from core.rel_swap") == "1a,2b")


def refresh_case(env):
    fresh()
    psql(PROD, "create table public.refresh_probe (n serial);\n"
               "create or replace function api.refresh() returns void language sql security definer as $$ insert into public.refresh_probe default values $$")

    def runs():
        return int(psql(PROD, "select count(*) from public.refresh_probe"))

    def result(num):
        return json.loads(psql(PROD, "select coalesce(result, '{}')::text from meta.data_release where number = '%s'" % num))

    psql(DS1, "update core.venue set city = city || ' (r)' where venue_id = (select min(venue_id) from core.venue)")
    rc, out, err = env.rel("prepare", "--title", "Refresh after apply", "--tables", "core.venue")
    n = number_of(out)
    approve(n)
    rc, out, err = env.rel("run")
    ok("a release that is applied runs api.refresh once and records it", status(n) == "done" and runs() == 1 and result(n)["refresh"] == "ok", out + err)

    psql(PROD, "create or replace function api.refresh() returns void language sql security definer as $$ select 1 / 0 $$")
    psql(DS1, "update core.venue set city = city || ' (s)' where venue_id = (select min(venue_id) from core.venue)")
    rc, out, err = env.rel("prepare", "--title", "Refresh fails", "--tables", "core.venue")
    n = number_of(out)
    approve(n)
    rc, out, err = env.rel("run")
    ok("a failing api.refresh is recorded and the release is still done", status(n) == "done" and result(n)["refresh"].startswith("failed"), out + err + str(result(n)))
    psql(PROD, "create or replace function api.refresh() returns void language sql security definer as $$ insert into public.refresh_probe default values $$")

    # an apply that fails before it commits changes nothing, so there is nothing to refresh
    psql(DS1, "insert into core.person (full_name, kind) values ('BAD NAME', 'player')")
    psql(PROD, "alter table core.person add constraint no_bad check (full_name <> 'BAD NAME')")
    rc, out, err = env.rel("prepare", "--title", "Fails halfway", "--tables", "core.person")
    n = number_of(out)
    approve(n)
    before = runs()
    rc, out, err = env.rel("run")
    ok("a failed apply does not refresh", status(n) == "failed" and runs() == before and "refresh" not in result(n), out + err)
    psql(PROD, "alter table core.person drop constraint no_bad")
    psql(DS1, "delete from core.person where full_name = 'BAD NAME'")

    # verification fails after the commit: the snapshot is restored and the views are still refreshed
    ddl = "create table core.rel_swap (id int primary key, code text not null unique, note text);\ninsert into core.rel_swap values (1, 'a'), (2, 'b');"
    psql(DS1, ddl)
    psql(PROD, ddl + """
        create function core.rel_swap_tamper() returns trigger language plpgsql as $$ begin if new.code = 'c' then new.note := 'tampered'; end if; return new; end $$;
        create trigger tamper before insert or update on core.rel_swap for each row execute function core.rel_swap_tamper();""")
    psql(DS1, "update core.rel_swap set code = case id when 1 then 'c' else 'a' end")
    rc, out, err = env.rel("prepare", "--title", "Codes swap places", "--tables", "core.rel_swap")
    n = number_of(out)
    approve(n)
    before = runs()
    rc, out, err = env.rel("run")
    ok("a failed verification still runs api.refresh, after the restore, and records it",
       status(n) == "failed" and runs() == before + 1 and result(n).get("refresh") == "ok" and result(n).get("verified") is False
       and "snapshot was restored" in psql(PROD, "select error from meta.data_release where number = '%s'" % n), out + err + str(result(n)))
    ok("the result is on DS1 too", json.loads(psql(DS1, "select result::text from meta.data_release where number = '%s'" % n)).get("refresh") == "ok")

    # a rollback refreshes too
    psql(DS1, "update core.venue set city = city || ' (t)' where venue_id = (select min(venue_id) from core.venue)")
    rc, out, err = env.rel("prepare", "--title", "To undo", "--tables", "core.venue")
    n = number_of(out)
    approve(n)
    env.rel("run")
    rc, out, err = env.rel("rollback", "--release", n)
    rn = number_of(out)
    approve(rn)
    before = runs()
    rc, out, err = env.rel("run")
    ok("a rollback runs api.refresh and records it", status(rn) == "done" and runs() == before + 1 and result(rn)["refresh"] == "ok", out + err)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="spx_stats", help="database to copy the small template from (only read)")
    ap.add_argument("--only", help="run only the named test functions (comma-separated)")
    a = ap.parse_args()
    make_base(a.source)
    env = Env()
    try:
        for fn in (main_flow, guardrails, failure_cases, drift_case, step_cases, float_case, restore_case, refresh_case):
            if a.only and fn.__name__ not in a.only.split(","):
                continue
            print("--- " + fn.__name__, flush=True)
            fn(env)
    finally:
        env.close()
    print("\n%d failed" % len(failures) if failures else "\nall passed")
    for f in failures:
        print("  FAILED: " + f)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

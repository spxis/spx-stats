#!/usr/bin/env python3
"""The order of the apply block: foreign keys and unique keys must hold after every statement, with no deferrable keys.

    python3 -I scripts/release/test/test_apply_order.py

Starts a throwaway Postgres (initdb from PATH, else Docker postgres:17-alpine) on a port in 3100-3199 (TEST_ORDER_PORT, 3150)
and stops it afterwards. It needs no template database, no DS1 and no Management API. Two databases stand in for DS1 and
production, seeded with a tiny schema with the same shapes as the real failures:
  - core.conference / core.division / core.team_season: parents rebuilt with NEW ids on DS1, the child re-pointed (release 2026.10.13-8)
  - core.franchise_brand, core.team_note: rows replaced by new-id rows with the same unique natural key (release 2026.10.13-1)
  - core.rel_swap: rows that swap unique values
It runs the real publish_plan, stage_and_apply, snapshot and restore from release.py. Exit code: 0 all passed, 1 a check failed.
"""
import importlib.util
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
sys.path.insert(0, os.path.join(HERE, "..", "..", "sync"))
spec = importlib.util.spec_from_file_location("release", os.path.join(HERE, "..", "release.py"))
R = importlib.util.module_from_spec(spec)
spec.loader.exec_module(R)
C = R.C

PORT = os.environ.get("TEST_ORDER_PORT", "3150")
HOST = "127.0.0.1"
OLD, NEW = "ord_prod", "ord_ds1"
failures = []

DDL = """
create schema core; create schema meta; create schema ref;
create table core.conference (conference_id int generated always as identity primary key, name text not null);
create table core.division (division_id int generated always as identity primary key,
  conference_id int references core.conference, name text not null);
create table core.team_season (team_season_id int primary key, division_id int references core.division,
  conference_id int references core.conference, name text);
create table core.team_season_stat (id int primary key, team_season_id int not null references core.team_season);
create table core.team_note (note_id int generated always as identity primary key,
  division_id int not null references core.division, note text not null, unique (division_id, note));
create table core.franchise_brand (franchise_brand_id int generated always as identity primary key,
  franchise_id int not null, valid text not null, logo text, unique (franchise_id, valid));
create table core.rel_swap (id int primary key, code text not null unique);
"""
SEED_OLD = """
insert into core.conference overriding system value values (1, 'East'), (2, 'West');
insert into core.division overriding system value values (10, 1, 'Atlantic'), (11, 2, 'Pacific');
insert into core.team_season values (1, 10, 1, 'A'), (2, 10, 1, 'B'), (3, 11, 2, 'C'), (4, 11, 2, 'D');
insert into core.team_season_stat values (1, 1), (2, 2), (3, 3);
insert into core.team_note overriding system value values (1, 10, 'x'), (2, 11, 'x');
insert into core.franchise_brand overriding system value values (1, 1, 'a', 'old1'), (2, 2, 'a', 'old2');
insert into core.rel_swap values (1, 'a'), (2, 'b');
"""
# the same data rebuilt on DS1: new ids everywhere in the parents, children re-pointed, team_season 4 gone
SEED_NEW = """
insert into core.conference overriding system value values (101, 'East'), (102, 'West');
insert into core.division overriding system value values (110, 101, 'Atlantic'), (111, 102, 'Pacific');
insert into core.team_season values (1, 110, 101, 'A'), (2, 110, 101, 'B'), (3, 111, 102, 'C');
insert into core.team_season_stat values (1, 1), (2, 2), (3, 3);
insert into core.team_note overriding system value values (5, 110, 'x'), (6, 111, 'x');
insert into core.franchise_brand overriding system value values (5, 1, 'a', 'new1'), (6, 2, 'a', 'new2');
insert into core.rel_swap values (1, 'b'), (2, 'a');
"""
TABLES = ["core.conference", "core.division", "core.team_season", "core.team_note", "core.franchise_brand", "core.rel_swap"]


def ok(name, cond, detail=""):
    print("%s  %s%s" % ("PASS" if cond else "FAIL", name, ("  -> " + str(detail)) if (detail and not cond) else ""), flush=True)
    if not cond:
        failures.append(name)


def dsn(db):
    return "host=%s port=%s user=postgres dbname=%s" % (HOST, PORT, db)


def psql(db, sql, check=True):
    r = subprocess.run(["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", dsn(db), "-f", "-"], input=sql, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError("psql %s: %s" % (db, r.stderr.strip()))
    return r.stdout.strip() if check else r


class Prod(C.ApiSide):
    """Production stand-in: the same calls as the Management API, run with psql on a local database."""

    def __init__(self, db):
        super().__init__("test", "test")
        self.db = db

    def post(self, query, attempts=5, timeout=90):
        r = psql(self.db, query, check=False)
        if r.returncode != 0:
            raise RuntimeError("production: query failed: " + r.stderr.strip())
        return [{"j": r.stdout.strip()}] if r.stdout.strip() else []


def start_server():
    tmp = tempfile.mkdtemp(prefix="ordpg-")
    if shutil.which("initdb") and shutil.which("pg_ctl"):
        data = os.path.join(tmp, "data")
        subprocess.run(["initdb", "-D", data, "-U", "postgres", "-A", "trust", "-E", "UTF8"], check=True, capture_output=True)
        subprocess.run(["pg_ctl", "-D", data, "-l", os.path.join(tmp, "log"), "-w", "-o",
                        "-p %s -c listen_addresses=%s -c unix_socket_directories=%s -c fsync=off" % (PORT, HOST, tmp), "start"],
                       check=True, capture_output=True)
        return tmp, lambda: subprocess.run(["pg_ctl", "-D", data, "-m", "immediate", "stop"], capture_output=True)
    name = "spx-order-test-%s" % PORT
    subprocess.run(["docker", "run", "-d", "--rm", "--name", name, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-p", "%s:%s:5432" % (HOST, PORT),
                    "postgres:17-alpine"], check=True, capture_output=True)
    for _ in range(60):
        if subprocess.run(["pg_isready", "-h", HOST, "-p", PORT], capture_output=True).returncode == 0:
            break
        time.sleep(1)
    time.sleep(2)
    return tmp, lambda: subprocess.run(["docker", "stop", name], capture_output=True)


def dump(db):
    out = {}
    for t in TABLES:
        out[t] = psql(db, "select coalesce(string_agg(x::text, ';' order by x::text), '') from %s x" % t)
    return out


def main():
    snap = tempfile.mkdtemp(prefix="ordsnap-")
    tmp, stop = start_server()
    try:
        for db, seed in ((OLD, SEED_OLD), (NEW, SEED_NEW)):
            psql("postgres", "create database %s" % db)
            psql(db, DDL + seed)
        R.SNAP_DIR = snap
        ds1 = C.PsqlSide("DS1", dsn(NEW))
        ctx = types.SimpleNamespace(ds1=ds1, prod=Prod(OLD), w=R.Ds1Writer(dsn(NEW)))
        before = dump(OLD)

        diffs, blockers, _ = R.diff_tables(ctx, TABLES)
        ok("no blockers on the tiny schema", not any(blockers.values()), blockers)
        order = R.ordered(ctx, TABLES)
        items = [(n, diffs[n][0], diffs[n][1]) for n in order]
        ok("parents come before children", order.index("core.conference") < order.index("core.division") < order.index("core.team_season"), order)
        ok("the division shape re-keys parents and removes the old ones",
           len(diffs["core.division"][1]["only1"]) == 2 and len(diffs["core.division"][1]["only2"]) == 2)

        plan = R.publish_plan(ctx, items)
        fresh = {p["t"].name.split(".")[1]: p["fresh"] for p in plan}
        ok("referenced tables are not fresh, tables nothing references are",
           fresh == {"conference": False, "division": False, "team_season": False, "team_note": True, "franchise_brand": True, "rel_swap": True}, fresh)

        # the generated block, captured as it is sent
        sent = []
        real_block = R.apply_block
        R.apply_block = lambda steps: sent.append(real_block(steps)) or sent[-1]
        R.snapshot(ctx, 1, "2026.10.13-t", items)
        try:
            R.stage_and_apply(ctx, 1, plan)
            committed = True
        except Exception as e:  # noqa: BLE001
            committed, err = False, e
        ok("the block commits against keys that are not deferrable", committed, "" if committed else err)
        block = sent[0].splitlines()

        def at(pattern):
            hits = [i for i, line in enumerate(block) if re.search(pattern, line)]
            return hits[0] if hits else None

        def ins(table):
            return at(r'^insert into "core"\."%s"' % table)

        def dele(table, alias="d"):
            return at(r'^delete from "core"\."%s" t using \S+ %s ' % (table, alias))

        ok("1. unique-key replacements are deleted before their inserts (franchise_brand, team_note)",
           dele("franchise_brand") < ins("franchise_brand") and dele("team_note") < ins("team_note"))
        ok("1. the rows a fresh table writes are deleted first too (rel_swap)", dele("rel_swap", "u") < ins("rel_swap"))
        ok("1. a fresh child is cleared before any parent is deleted", dele("team_note") < dele("division"))
        ok("2. new parents are inserted before the children that point at them",
           ins("conference") < ins("division") < ins("team_season") and ins("division") < ins("team_note"))
        ok("3. old parents are deleted after the children are re-pointed",
           ins("team_season") < dele("division") and ins("team_season") < dele("conference"))
        ok("3. old divisions are deleted before old conferences", dele("division") < dele("conference"))
        ok("3. a removed child row goes before its removed parents", dele("team_season") < dele("division"))
        ok("no delete of a referenced table comes before the last insert",
           max(ins(t) for t in ("conference", "division", "team_season", "team_note", "franchise_brand", "rel_swap"))
           < min(dele("conference"), dele("division"), dele("team_season")))

        ok("production now equals DS1", dump(OLD) == dump(NEW), (dump(OLD), dump(NEW)))
        ok("team_season_stat rows (not in the release) still point at team_season",
           psql(OLD, "select count(*) from core.team_season_stat s join core.team_season t using (team_season_id)") == "3")

        # the restore path builds its plan from the snapshot and goes through the same block
        sent.clear()
        R.restore(ctx, 1, TABLES, orig_rows={n: diffs[n][1]["prod"] for n in TABLES})
        ok("restore commits through the same block", len(sent) == 1)
        ok("restore puts production back exactly as it was", dump(OLD) == before, (dump(OLD), before))
        r = sent[0].splitlines()
        ok("restore inserts the old parents before it deletes the new ones",
           max(i for i, line in enumerate(r) if line.startswith('insert into "core"."team_season"'))
           < min(i for i, line in enumerate(r) if line.startswith('delete from "core"."division" t using')))

        # DS1 moves on by one more row and the release is applied again, now with the real block
        psql(NEW, "update core.team_season set division_id = 111 where team_season_id = 1")
        diffs2, _, _ = R.diff_tables(ctx, TABLES)
        items2 = [(n, diffs2[n][0], diffs2[n][1]) for n in R.ordered(ctx, TABLES)]
        R.apply_block = real_block
        R.stage_and_apply(ctx, 2, R.publish_plan(ctx, items2))
        ok("and commits again", dump(OLD) == dump(NEW))
    finally:
        stop()
        shutil.rmtree(tmp, ignore_errors=True)
        shutil.rmtree(snap, ignore_errors=True)
    print("\n%s" % ("all passed" if not failures else "FAILED: " + "; ".join(failures)))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

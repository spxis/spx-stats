#!/usr/bin/env python3
"""The order of the apply block: foreign keys and unique keys must hold after every statement, with no deferrable keys.

    python3 -I scripts/release/test/test_apply_order.py

Starts a throwaway Postgres (initdb from PATH, else Docker postgres:17-alpine) on a port in 7700-7799 (TEST_ORDER_PORT, 7740)
and stops it afterwards. It needs no template database, no DS1 and no Management API. Two databases stand in for DS1 and
production, seeded with a tiny schema with the same shapes as the real failures:
  - core.conference / core.division / core.team_season: parents rebuilt with NEW ids on DS1, the child re-pointed (release 2026.10.13-8)
  - core.franchise_brand, core.team_note: rows replaced by new-id rows with the same unique natural key (release 2026.10.13-1)
  - core.rel_swap: rows that swap unique values
  - the position release (2026.10.13-11 and -13): a new, empty parent code table (ref.position_code), a list table named with a keyword
    (ref."position"), an alias table with a composite key to it, a person table with a NOT VALID key to the code table and a trigger that
    reads it, a re-keyed stats child of person, removed persons, redirects, and a table that points at itself
  - exclusion constraints on referenced tables (release 2026.10.15-11): franchise_identity rebuilt with new ids and the same ranges, a
    child re-pointed, a range that shrinks while a new row takes its old part, and tables where the block must not empty a range
  - a foreign key loop, which must be refused at prepare, with the loop built from both databases' keys
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

PORT = os.environ.get("TEST_ORDER_PORT", "7740")
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


def dump(db, tables=None):
    out = {}
    for t in (tables or TABLES):
        out[t] = psql(db, "select coalesce(string_agg(x::text, ';' order by x::text), '') from %s x" % t)
    return out


def scenario_divisions(snap):
    if True:
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
        R.apply_block = lambda steps: sent.append(REAL_BLOCK(steps)) or sent[-1]
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
        R.apply_block = REAL_BLOCK
        R.stage_and_apply(ctx, 2, R.publish_plan(ctx, items2))
        ok("and commits again", dump(OLD) == dump(NEW))


REAL_BLOCK = R.apply_block
POS_TABLES = ["core.org_unit", "core.person", "core.person_redirect", "core.player_season_stat",
              "ref.position", "ref.position_alias", "ref.position_code"]
POS_DDL = """
create schema core; create schema meta; create schema ref;
create table ref.league (league_code text primary key);
create table ref.position_code (code text primary key);
create table ref."position" (league_code text not null references ref.league, code text not null references ref.position_code,
  name_en text not null, primary key (league_code, code));
create table ref.position_alias (source_code text not null, league_code text not null, raw_value text not null, code text not null,
  primary key (source_code, league_code, raw_value),
  foreign key (league_code, code) references ref."position" (league_code, code) on delete cascade);
create table core.person (person_id bigint primary key, name text not null, primary_position text, positions text[]);
create function core.check_person_positions() returns trigger language plpgsql as $$
declare bad text;
begin
  select c into bad from unnest(new.positions) c where not exists (select 1 from ref.position_code k where k.code = c) limit 1;
  if bad is not null then raise exception 'core.person.positions: % is not a position code', bad using errcode = '23503'; end if;
  return new;
end $$;
create trigger person_positions_check before insert or update of positions on core.person
  for each row when (new.positions is not null) execute function core.check_person_positions();
create table core.person_redirect (old_person_id bigint primary key, person_id bigint not null references core.person on delete cascade);
create table core.player_season_stat (stat_id bigint primary key, person_id bigint not null references core.person,
  season int not null, goals int, unique (person_id, season));
create table core.org_unit (unit_id int primary key, parent_id int references core.org_unit, name text);
insert into ref.league values ('NHL');
"""
# added after the seed: the old rows hold free text, which a NOT VALID key allows (and the trigger only looks at positions)
POS_KEY = "alter table core.person add constraint person_primary_position_fk foreign key (primary_position) references ref.position_code (code) not valid;"
# production: the code tables exist and are empty; people still hold free text (allowed: the key is NOT VALID)
POS_OLD = """
insert into core.person values (1, 'A', 'Left Wing', null), (2, 'B', 'Center', null), (3, 'C', null, null), (4, 'D', 'Center', null),
  (5, 'E', null, null), (6, 'F', 'Goalie', null);
insert into core.player_season_stat values (1, 1, 2019, 5), (2, 2, 2019, 7), (3, 4, 2018, 3), (4, 5, 2018, 2);
insert into core.org_unit values (1, null, 'root'), (2, 1, 'old child'), (3, 2, 'leaf');
"""
# DS1: codes, the list, the aliases; persons 4 and 5 merged into 1 and 2 (removed, redirected); every stats row re-keyed
POS_NEW = """
insert into ref.position_code values ('LW'), ('C'), ('G');
insert into ref."position" values ('NHL', 'LW', 'Left Wing'), ('NHL', 'C', 'Center'), ('NHL', 'G', 'Goalie');
insert into ref.position_alias values ('spx', 'NHL', 'left wing', 'LW'), ('spx', 'NHL', 'center', 'C'), ('spx', 'NHL', 'goalie', 'G');
insert into core.person values (1, 'A', 'LW', '{LW}'), (2, 'B', 'C', '{C,LW}'), (3, 'C', null, null), (6, 'F', 'G', '{G}');
insert into core.person_redirect values (4, 1), (5, 2);
insert into core.player_season_stat values (11, 1, 2019, 5), (12, 2, 2019, 7), (13, 1, 2018, 3), (14, 2, 2018, 2);
insert into core.org_unit values (1, null, 'root'), (10, 1, 'new child'), (3, 10, 'leaf');
"""


def block_index(block):
    def at(pattern):
        hits = [i for i, line in enumerate(block) if re.search(pattern, line)]
        return hits[0] if hits else None
    return at


def scenario_positions(snap, free_text):
    """free_text: production's people still hold the old free text in primary_position (the real state, NOT VALID key). Otherwise
    those cells are empty, so the restore, which writes the old cells back, has nothing the key refuses."""
    tag = "pos" if free_text else "posnull"
    seed_old = POS_OLD if free_text else re.sub(r"'(Left Wing|Center|Goalie)'", "null", POS_OLD)
    print("--- the position release, production's people hold %s" % ("free text" if free_text else "no old text"))
    for db, seed in ((tag + "_prod", seed_old), (tag + "_ds1", POS_NEW)):
        psql("postgres", "create database %s" % db)
        psql(db, POS_DDL + seed + POS_KEY)
    R.SNAP_DIR = snap
    ds1 = C.PsqlSide("DS1", dsn(tag + "_ds1"))
    ctx = types.SimpleNamespace(ds1=ds1, prod=Prod(tag + "_prod"), w=R.Ds1Writer(dsn(tag + "_ds1")))
    P = POS_TABLES
    before = dump(tag + "_prod", P)

    edges = C.fk_edges(ds1)
    ok("the keys are read as plain schema.table names, a keyword table included",
       ("ref.position_alias", "ref.position") in edges and ("ref.position", "ref.position_code") in edges, sorted(edges))
    ok("a NOT VALID key is an edge, and so is a key to the table itself",
       ("core.person", "ref.position_code") in edges and ("core.org_unit", "core.org_unit") in edges, sorted(edges))

    order = R.ordered(ctx, P)
    ix = order.index
    ok("position: the code table, then the list, then the aliases",
       ix("ref.position_code") < ix("ref.position") < ix("ref.position_alias"), order)
    ok("position: the code table comes before person (NOT VALID key and trigger)", ix("ref.position_code") < ix("core.person"), order)
    ok("position: person comes before its redirects and its stats",
       ix("core.person") < ix("core.person_redirect") and ix("core.person") < ix("core.player_season_stat"), order)
    rev = R.ordered(ctx, list(reversed(P)))
    ok("the order holds whatever order the tables are given in",
       rev.index("ref.position_code") < rev.index("ref.position") < rev.index("ref.position_alias")
       and rev.index("ref.position_code") < rev.index("core.person") < rev.index("core.person_redirect"), rev)
    ok("the same input always gives the same order", R.ordered(ctx, P) == order)

    diffs, blockers, _ = R.diff_tables(ctx, P)
    ok("the position shape has no blockers from the comparison", not any(blockers.values()), blockers)
    items = [(n, diffs[n][0], diffs[n][1]) for n in order]
    ok("the shape is there: empty code table on production, persons removed, stats re-keyed",
       len(diffs["ref.position_code"][1]["only1"]) == 3 and diffs["ref.position_code"][1]["prod"] == 0
       and len(diffs["core.person"][1]["only2"]) == 2 and len(diffs["core.player_season_stat"][1]["only1"]) == 4
       and len(diffs["core.player_season_stat"][1]["only2"]) == 4)

    plan = R.publish_plan(ctx, items)
    fresh = {p["t"].name: p["fresh"] for p in plan}
    ok("position: referenced tables are not fresh (the self-referencing one included)",
       fresh == {"core.org_unit": False, "core.person": False, "core.person_redirect": True, "core.player_season_stat": True,
                 "ref.position": False, "ref.position_alias": True, "ref.position_code": False}, fresh)

    sent = []
    R.apply_block = lambda steps: sent.append(REAL_BLOCK(steps)) or sent[-1]
    R.snapshot(ctx, 3, "2026.10.13-p", items)
    try:
        R.stage_and_apply(ctx, 3, plan)
        committed, err = True, ""
    except Exception as e:  # noqa: BLE001
        committed, err = False, e
    ok("position: the block commits (codes before list before aliases, person after the codes)", committed, err)
    at = block_index(sent[0].splitlines())

    def ins(table, schema="core"):
        return at(r'^insert into "%s"\."%s"' % (schema, table))

    def dele(table, schema="core", alias="d"):
        return at(r'^delete from "%s"\."%s" t using \S+ %s ' % (schema, table, alias))

    ok("position inserts: code, list, alias", ins("position_code", "ref") < ins("position", "ref") < ins("position_alias", "ref"))
    ok("position inserts: the codes before person", ins("position_code", "ref") < ins("person"))
    ok("person is written before its redirects and its stats", ins("person") < ins("person_redirect") and ins("person") < ins("player_season_stat"))
    ok("the old stats are cleared before the removed persons go", dele("player_season_stat", alias="[du]") < dele("person"))
    ok("the removed persons go after every insert", dele("person") > max(ins(t) for t in ("person", "person_redirect", "player_season_stat", "org_unit")))
    ok("the self-referencing table: new parent inserted before the old one is deleted", ins("org_unit") < dele("org_unit"))
    ok("position: production equals DS1 after the block", dump(tag + "_prod", P) == dump(tag + "_ds1", P), (dump(tag + "_prod", P), dump(tag + "_ds1", P)))
    ok("production's key is still NOT VALID and the trigger is still there",
       psql(tag + "_prod", "select convalidated from pg_constraint where conname = 'person_primary_position_fk'") == "f"
       and psql(tag + "_prod", "select count(*) from pg_trigger where tgname = 'person_positions_check'") == "1")

    # the restore goes through the same block: old rows back, then what the release inserted removed, children first
    sent.clear()
    try:
        R.restore(ctx, 3, P, orig_rows={n: diffs[n][1]["prod"] for n in P})
        restored, err = True, ""
    except Exception as e:  # noqa: BLE001
        restored, err = False, str(e)
    if free_text:
        # KNOWN LIMIT: the old free text is not a code, and the NOT VALID key refuses any write of it (the key is checked on every
        # insert or change of the column, valid or not). The release never changes keys, so this restore cannot succeed; it must fail
        # as a whole and leave production as the release made it.
        ok("position (free text): the restore is refused by the NOT VALID key and changes nothing (known limit)",
           not restored and "person_primary_position_fk" in err and dump(tag + "_prod", P) == dump(tag + "_ds1", P), err[:200])
    else:
        ok("position: restore commits through the same block", restored and len(sent) == 1, err)
    if restored:
        ok("position: restore puts production back exactly as it was", dump(tag + "_prod", P) == before, (dump(tag + "_prod", P), before))
        at = block_index(sent[0].splitlines())
        ok("position restore: aliases, then the list, then the codes are removed",
           dele("position_alias", "ref", "[du]") is not None
           and dele("position_alias", "ref", "[du]") < dele("position", "ref") < dele("position_code", "ref"))
        ok("position restore: persons are written back before the codes are removed", ins("person") < dele("position_code", "ref"))
    R.apply_block = REAL_BLOCK


class StubSide:
    def __init__(self, edges):
        self.edges = edges

    def run(self, sql):
        return [{"child": c, "parent": p, "name": "%s_fk" % c.split(".")[1], "validated": True} for c, p in self.edges]


def scenario_cycles(snap):
    # ordering rules without a database
    s = StubSide([("a.c", "a.b"), ("a.b", "a.a"), ("a.a", "a.a"), ("a.d", "a.x")])
    got = C.apply_order(["a.d", "a.c", "a.b", "a.a"], s)
    ok("order: parents first, ties keep the given order, a self key and a table outside the list add no edge",
       got == ["a.d", "a.a", "a.b", "a.c"], got)
    ok("order: duplicates in the list are ignored", C.apply_order(["a.a", "a.b", "a.a"], s) == ["a.a", "a.b"])
    loop = StubSide([("a.x", "a.y"), ("a.y", "a.z"), ("a.z", "a.x"), ("a.w", "a.x")])
    try:
        C.apply_order(["a.w", "a.x", "a.y", "a.z"], loop)
        msg = None
    except C.FkCycle as e:
        msg = str(e)
    ok("a loop of three tables is reported with the loop and the keys", bool(msg) and all(x in msg for x in ("a.x", "a.y", "a.z", "x_fk", "loop")), msg)
    ok("strict=False (the compare.py report) still returns every table",
       sorted(C.apply_order(["a.w", "a.x", "a.y", "a.z"], loop, strict=False)) == ["a.w", "a.x", "a.y", "a.z"])
    ok("a loop outside the list is not an error", C.apply_order(["a.w"], loop) == ["a.w"])

    # against databases: the loop exists only when DS1's keys and production's keys are put together
    for db in ("cyc_prod", "cyc_ds1"):
        psql("postgres", "create database %s" % db)
    base = ("create schema core; create schema meta; create schema ref;"
            "create table core.a (id int primary key, b_id int); create table core.b (id int primary key, a_id int);"
            "create table core.c (id int primary key, a_id int);"
            "alter table core.c add foreign key (a_id) references core.a;")
    psql("cyc_ds1", base + "alter table core.b add foreign key (a_id) references core.a;")
    psql("cyc_prod", base + "alter table core.a add foreign key (b_id) references core.b;")
    ds1 = C.PsqlSide("DS1", dsn("cyc_ds1"))
    prod = Prod("cyc_prod")
    ctx = types.SimpleNamespace(ds1=ds1, prod=prod, w=None)
    names = ["core.a", "core.b", "core.c"]
    ok("DS1's keys alone give an order", C.apply_order(names, ds1) == ["core.a", "core.b", "core.c"], C.apply_order(names, ds1))
    ok("production's keys alone give an order", C.apply_order(names, prod) == ["core.b", "core.a", "core.c"], C.apply_order(names, prod))
    try:
        R.ordered(ctx, names)
        refused = None
    except R.Refused as e:
        refused = str(e)
    ok("the two sides together form a loop and the order is refused", bool(refused) and "core.a" in refused and "core.b" in refused, refused)
    try:
        R.prepare_publish(ctx, "loop", names)
        pre = None
    except R.Refused as e:
        pre = str(e)
    except Exception as e:  # noqa: BLE001
        pre = "other error: %r" % e
    ok("prepare refuses a loop before it checks anything or writes a release", bool(pre) and "loop" in pre and "other error" not in pre, pre)
    ok("a table list without the loop still orders", R.ordered(ctx, ["core.a", "core.c"]) == ["core.a", "core.c"])


FILTER_DDL = """
create schema core; create schema meta; create schema ref;
create table core.external_id (entity_kind text not null, entity_id bigint not null, source_id smallint not null,
  external_key text not null, primary key (source_id, entity_kind, external_key));
create index external_id_entity_idx on core.external_id (entity_kind, entity_id);
create table core.plain (id int primary key, note text);
"""


def scenario_publish_filter(snap):
    """PUBLISH_FILTER: production holds core.external_id without its 'game' rows (compare.py). Production starts with ALL of DS1's rows
    plus two game rows DS1 does not have; DS1 has one new and one changed row of another kind. Checks that the preview shows every
    game row as a removal (and the shrink guard asks for replace), that the apply leaves production equal to DS1 filtered while DS1 keeps
    its game rows, that verification, the drift comparison and compare.py (the CLI) then report clean, that new DS1 game rows do not
    drift, and that a restore brings the game rows back."""
    P, D = "flt_prod", "flt_ds1"
    for db in (P, D):
        psql("postgres", "create database %s" % db)
        psql(db, FILTER_DDL)
    common = ("insert into core.external_id select 'game', g, 1, 'g' || g from generate_series(1, 40) g;\n"
              "insert into core.external_id values ('person', 1, 1, 'p1'), ('person', 2, 1, 'p2'), ('venue', 7, 2, 'v7'), "
              "('franchise', 9, 2, 'f9');\n"
              "insert into core.plain values (1, 'a'), (2, 'b');\n")
    psql(P, common + "insert into core.external_id values ('game', 900, 3, 'only-in-prod-1'), ('game', 901, 3, 'only-in-prod-2');")
    psql(D, common + "update core.external_id set entity_id = 8 where external_key = 'v7';\n"
                     "insert into core.external_id values ('season', 3, 1, 's3');\nupdate core.plain set note = 'z' where id = 2;")
    R.SNAP_DIR = snap
    ds1 = C.PsqlSide("DS1", dsn(D))
    ctx = types.SimpleNamespace(ds1=ds1, prod=Prod(P), w=R.Ds1Writer(dsn(D)))
    names = ["core.external_id", "core.plain"]
    before = dump(P, names)
    games_ds1 = psql(D, "select count(*) from core.external_id where entity_kind = 'game'")

    c1, c2 = C.catalog(ds1), C.catalog(ctx.prod)
    t = C.Table("core.external_id", c1["core.external_id"], c2["core.external_id"])
    plain = C.Table("core.plain", c1["core.plain"], c2["core.plain"])
    ok("PUBLISH_FILTER has exactly the one entry", C.PUBLISH_FILTER == {"core.external_id": "entity_kind <> 'game'"}, C.PUBLISH_FILTER)
    ok("the DS1 side reads the filtered rows, production and unfiltered tables read the table",
       "entity_kind <> 'game'" in t.src(ds1) and t.src(ctx.prod) == t.fq and plain.src(ds1) == plain.fq)
    ok("DS1 counts only the published rows", C.count_rows(ds1, t) == 5 and C.count_rows(ctx.prod, t) == 46, (C.count_rows(ds1, t), C.count_rows(ctx.prod, t)))

    # prepare: every game row in production is a removal; without replace the shrink guard refuses
    diffs, blockers, warnings = R.diff_tables(ctx, names)
    d = diffs["core.external_id"][1]
    ok("the preview comparison: 1 add, 1 change, all 42 production game rows are removals",
       (len(d["only1"]), len(d["differ"]), len(d["only2"])) == (1, 1, 42), (len(d["only1"]), len(d["differ"]), len(d["only2"])))
    ok("no game row is ever on the add side", not any(k[1] == "game" for k in d["only1"]))
    pv = R.build_preview(ctx, names, False, diffs, blockers, warnings)
    ok("without replace the shrink guard blocks it", any("core.external_id would shrink" in b for b in pv["blockers"]), pv["blockers"])
    pv = R.build_preview(ctx, names, True, diffs, blockers, warnings)
    ok("with replace there is no blocker", not pv["blockers"], pv["blockers"])
    ok("the preview says remove 42, ds1_rows is the published count",
       pv["tables"]["core.external_id"]["remove"] == 42 and pv["tables"]["core.external_id"]["ds1_rows"] == 5)

    # apply (snapshot, stage, the real block) and verify the way run_publish does
    order = R.ordered(ctx, names)
    items = [(n, diffs[n][0], diffs[n][1]) for n in order]
    R.snapshot(ctx, 7, "2026.10.14-t", items)
    R.stage_and_apply(ctx, 7, R.publish_plan(ctx, items))
    ok("production equals DS1 filtered, bucket by bucket",
       all(R.verify_equal(ctx, n, tt, dd["b1"]) for n, tt, dd in items))
    ok("production has no game rows left", psql(P, "select count(*) from core.external_id where entity_kind = 'game'") == "0")
    ok("production holds exactly DS1's other rows",
       psql(P, "select string_agg(x::text, ';' order by x::text) from core.external_id x")
       == psql(D, "select string_agg(x::text, ';' order by x::text) from core.external_id x where entity_kind <> 'game'"))
    ok("DS1 still holds all its game rows", psql(D, "select count(*) from core.external_id where entity_kind = 'game'") == games_ds1 == "40")
    ok("the unfiltered table was published as usual", dump(P, ["core.plain"]) == dump(D, ["core.plain"]))

    # clean afterwards: the drift comparison, the sync status row, compare.py itself
    row, td, _ = R.compare_table(ctx, c1, c2, "core.external_id")
    ok("drift reports external_id as the same, with the published row count", row[3] == "same" and row[1] == 5 and row[2] == 5, row)
    ok("the drift run's other table is the same too", R.compare_table(ctx, c1, c2, "core.plain")[0][3] == "same")
    out = tempfile.mkdtemp(prefix="flt-")
    cmd = [sys.executable, "-I", os.path.join(HERE, "..", "..", "sync", "compare.py"), "--out", out, "--tables", ",".join(names),
           "--ds1-dsn", dsn(D), "--prod-dsn", dsn(P)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    ok("compare.py (the CLI) exits 0 on the filtered pair", r.returncode == 0, r.stdout + r.stderr)
    # new game ids arrive on DS1: not published, so no drift and nothing to release
    psql(D, "insert into core.external_id select 'game', g, 1, 'g' || g from generate_series(100, 130) g")
    row, _, _ = R.compare_table(ctx, c1, c2, "core.external_id")
    ok("new DS1 game ids do not make drift", row[3] == "same", row)
    r = subprocess.run(cmd, capture_output=True, text=True)
    ok("nor does compare.py report them", r.returncode == 0, r.stdout + r.stderr)
    # a changed non-game row still drifts
    psql(D, "update core.external_id set external_key = 'p1b' where external_key = 'p1'")
    row, _, _ = R.compare_table(ctx, c1, c2, "core.external_id")
    ok("a changed published row still drifts", row[3] == "differs", row)
    psql(D, "update core.external_id set external_key = 'p1' where external_key = 'p1b'")
    shutil.rmtree(out, ignore_errors=True)

    # the restore (rollback and failed verification) brings production's game rows back from the snapshot
    R.restore(ctx, 7, names, orig_rows={n: dd["prod"] for n, _, dd in items})
    ok("restore puts the game rows back in production", dump(P, names) == before, (dump(P, names), before))
    diffs3, _, _ = R.diff_tables(ctx, names)
    ok("and after a restore the game rows are removals again", len(diffs3["core.external_id"][1]["only2"]) == 42)


EXCL_TABLES = ["core.franchise_identity", "core.team_season", "core.span_check", "core.span_trigger"]
EXCL_DDL = """
create extension if not exists btree_gist;
create schema core; create schema meta; create schema ref;
create table core.franchise_identity (identity_id int primary key, franchise_id int not null, valid_during daterange not null,
  name text not null,
  constraint franchise_identity_franchise_id_valid_during_excl exclude using gist (franchise_id with =, valid_during with &&));
create table core.team_season (team_season_id int primary key, identity_id int not null references core.franchise_identity, label text);
create table core.span_check (span_id int primary key, owner_id int not null, valid_during daterange not null,
  check (not isempty(valid_during)),
  exclude using gist (owner_id with =, valid_during with &&));
create table core.span_ref (span_id int primary key references core.span_check);
create table core.span_trigger (span_id int primary key, owner_id int not null, valid_during daterange not null,
  exclude using gist (owner_id with =, valid_during with &&));
create table core.span_trigger_child (id int primary key, span_id int not null references core.span_trigger);
create function core.span_trigger_noop() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger span_trigger_upd before update on core.span_trigger for each row execute function core.span_trigger_noop();
"""
# production: identity 1 and 2 of franchise 1501; identity 3 of franchise 7 is [2000,2005); every season points at an identity
EXCL_OLD = """
insert into core.franchise_identity values (1, 1501, '[1984-03-01,1999-03-01)', 'Old A'), (2, 1501, '[1999-03-01,)', 'Old B'),
  (3, 7, '[2000-01-01,2005-01-01)', 'Seven'), (4, 8, '[1990-01-01,1995-01-01)', 'Gone');
insert into core.team_season values (1, 1, 'a'), (2, 2, 'b'), (3, 3, 'c'), (4, 4, 'd');
insert into core.span_check values (1, 1, '[2000-01-01,2001-01-01)');
insert into core.span_ref values (1);
insert into core.span_trigger values (1, 1, '[2000-01-01,2001-01-01)');
insert into core.span_trigger_child values (1, 1);
"""
# DS1's rebuild: the same spans under NEW ids (1 and 2 become 11 and 12, so the new rows overlap the removed ones); identity 3 keeps
# its id but its range shrinks, and a new identity 13 takes the first part of it (overlapping row 3's OLD range); identity 4 is gone
EXCL_NEW = """
insert into core.franchise_identity values (11, 1501, '[1984-03-01,1999-03-01)', 'New A'), (12, 1501, '[1999-03-01,)', 'New B'),
  (3, 7, '[2003-01-01,2005-01-01)', 'Seven'), (13, 7, '[2000-01-01,2003-01-01)', 'Seven early');
insert into core.team_season values (1, 11, 'a'), (2, 12, 'b'), (3, 3, 'c');
insert into core.span_check values (2, 1, '[2000-01-01,2001-01-01)');
insert into core.span_ref values (2);
insert into core.span_trigger values (2, 1, '[2000-01-01,2001-01-01)');
insert into core.span_trigger_child values (1, 2);
"""


def scenario_exclusion(snap):
    """Release 2026.10.15-11: a referenced table with an exclusion constraint (franchise_id =, valid_during &&). A removed row still
    present when an incoming row with a new id and the same range is inserted made the block fail with 23P01."""
    print("--- exclusion constraints on referenced tables")
    for db, seed in (("excl_prod", EXCL_OLD), ("excl_ds1", EXCL_NEW)):
        psql("postgres", "create database %s" % db)
        psql(db, EXCL_DDL + seed)
    R.SNAP_DIR = snap
    ds1 = C.PsqlSide("DS1", dsn("excl_ds1"))
    ctx = types.SimpleNamespace(ds1=ds1, prod=Prod("excl_prod"), w=R.Ds1Writer(dsn("excl_ds1")))
    names = ["core.franchise_identity", "core.team_season"]
    cat, cat1 = C.catalog(ctx.prod), C.catalog(ds1)
    tabs = {n: C.Table(n, cat1[n], cat[n]) for n in EXCL_TABLES}
    ok("the range column of the gist exclusion is found (&& on a range type)",
       tabs["core.franchise_identity"].neutral == [("valid_during", "'empty'")], tabs["core.franchise_identity"].neutral)
    ok("a table with a check on the column is left alone, with the reason",
       tabs["core.span_check"].neutral == [] and any("check" in x for x in tabs["core.span_check"].excl_notes), tabs["core.span_check"].excl_notes)
    ok("a table with an update trigger is left alone, with the reason",
       tabs["core.span_trigger"].neutral == [] and any("trigger" in x for x in tabs["core.span_trigger"].excl_notes), tabs["core.span_trigger"].excl_notes)

    before = dump("excl_prod", names)
    diffs, blockers, _ = R.diff_tables(ctx, names)
    ok("no blockers", not any(blockers.values()), blockers)
    items = [(n, diffs[n][0], diffs[n][1]) for n in R.ordered(ctx, names)]
    plan = R.publish_plan(ctx, items)
    ok("identities are referenced, seasons are not",
       {p["t"].name: p["fresh"] for p in plan} == {"core.franchise_identity": False, "core.team_season": True})
    R.snapshot(ctx, 1, "2026.10.15-t", items)
    sent = []
    R.apply_block = lambda steps: sent.append(REAL_BLOCK(steps)) or sent[-1]
    try:
        R.stage_and_apply(ctx, 1, plan)
        committed, err = True, ""
    except Exception as e:  # noqa: BLE001
        committed, err = False, e
    ok("the block commits although a removed or changed row overlaps an incoming one", committed, err)
    block = (sent[0] if sent else "").splitlines()

    def at(pattern):
        hits = [i for i, line in enumerate(block) if re.search(pattern, line)]
        return hits[0] if hits else None

    upd = at(r'^update "core"\."franchise_identity" t set "valid_during" = \'empty\' from \S+ d ')
    upd2 = at(r'^update "core"\."franchise_identity" t set "valid_during" = \'empty\' from \S+ u .*is distinct from')
    ins = at(r'^insert into "core"\."franchise_identity"')
    dele = at(r'^delete from "core"\."franchise_identity" t using \S+ d ')
    ok("removed rows are emptied before the insert, and deleted after it", upd is not None and ins is not None and upd < ins < dele, block)
    ok("rows whose range changes are emptied before the insert", upd2 is not None and ins is not None and upd2 < ins)
    ok("the neutralised table is the only one touched",
       not any(re.match(r'^update "core"\."(team_season|span_)', line) for line in block))
    ok("production now equals DS1", dump("excl_prod", names) == dump("excl_ds1", names), (dump("excl_prod", names), dump("excl_ds1", names)))
    ok("every season points at an identity that exists",
       psql("excl_prod", "select count(*) from core.team_season s join core.franchise_identity using (identity_id)") == "3")
    ok("the constraint itself is unchanged (not deferrable, same definition)",
       psql("excl_prod", "select condeferrable::text || ':' || pg_get_constraintdef(oid) from pg_constraint where conname = "
            "'franchise_identity_franchise_id_valid_during_excl'")
       == "false:EXCLUDE USING gist (franchise_id WITH =, valid_during WITH &&)")

    # the restore goes through the same block and has the same collision the other way round
    sent.clear()
    R.restore(ctx, 1, names, orig_rows={n: diffs[n][1]["prod"] for n in names})
    ok("restore commits through the same block", len(sent) == 1)
    ok("restore puts production back exactly as it was", dump("excl_prod", names) == before, (dump("excl_prod", names), before))

    # a table where the emptying is not allowed: the old order stays, and a collision fails with the reason named
    psql("excl_prod", "insert into core.span_check values (5, 2, '[2000-01-01,2001-01-01)'); insert into core.span_ref values (5)")
    psql("excl_ds1", "insert into core.span_check values (6, 2, '[2000-01-01,2001-01-01)'); insert into core.span_ref values (6)")
    names2 = ["core.span_check", "core.span_ref"]
    R.apply_block = REAL_BLOCK
    d2, _, _ = R.diff_tables(ctx, names2)
    items2 = [(n, d2[n][0], d2[n][1]) for n in R.ordered(ctx, names2)]
    try:
        R.stage_and_apply(ctx, 3, R.publish_plan(ctx, items2))
        msg = ""
    except Exception as e:  # noqa: BLE001
        msg = str(e)
    ok("a table with a check fails as before, and the error names why it could not be emptied",
       "violates exclusion constraint" in msg and "cannot be emptied: a check constraint names it" in msg, msg)


def main():
    snap = tempfile.mkdtemp(prefix="ordsnap-")
    tmp, stop = start_server()
    try:
        scenario_divisions(snap)
        scenario_positions(snap, True)
        scenario_positions(snap, False)
        scenario_exclusion(snap)
        scenario_cycles(snap)
        scenario_publish_filter(snap)
    finally:
        stop()
        shutil.rmtree(tmp, ignore_errors=True)
        shutil.rmtree(snap, ignore_errors=True)
    print("\n%s" % ("all passed" if not failures else "FAILED: " + "; ".join(failures)))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

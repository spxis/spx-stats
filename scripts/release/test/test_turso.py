#!/usr/bin/env python3
"""End-to-end test of data releases to Turso: two scratch Postgres databases stand in for DS1 and production (as in test_release.py),
mock_api.py stands in for the Management API, and a local libSQL server (sqld, Docker image ghcr.io/tursodatabase/libsql-server)
stands in for Turso. Nothing real is touched.

    docker run -d --name <name> -p 127.0.0.1:7742:8080 ghcr.io/tursodatabase/libsql-server:latest
    TEST_PG_PORT=7741 python3 -I scripts/release/test/test_turso.py [--turso http://127.0.0.1:7742]

Exit code: 0 all passed, 1 a check failed.
"""
import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, ".."))
import test_release as TR  # noqa: E402
import turso as T  # noqa: E402

os.environ.pop("RELEASE_TURSO_TABLES", None)   # test_release sets it to none; here the real table list applies
T.TABLES.clear()
T.TABLES.update(T.SPECS)

ok, psql, DS1, PROD = TR.ok, TR.psql, TR.DS1, TR.PROD
USED = ["core.external_id", "meta.verification", "meta.data_issue", "core.batted_ball_player", "core.betting_line", "api.person_admin", "api.quality", "api.provenance"]


def turso_rows(side, table):
    return side.query("select * from %s order by 1" % table)


def reset_turso(side):
    for n in side.tables():
        side.exec_script(["drop table %s" % '"%s"' % n])


def seed_ds1():
    psql(DS1, """
        drop materialized view if exists api.person_admin cascade;
        drop materialized view if exists api.provenance cascade;
        insert into core.person (full_name, kind) select 'Turso Person ' || g, 'player' from generate_series(1, 30) g;
        create materialized view api.person_admin as
          select person_id, full_name as name, lower(full_name) as search, substring(lower(full_name) from '^[a-z]') as letter_first,
                 substring(lower(full_name) from '([a-z])[^ ]*$') as letter_last, kind::text as kind, 'CA'::text as country,
                 date '1980-02-03' + (person_id % 100)::int as birth_date, extract(year from date '1980-02-03')::smallint as birth_year,
                 array['hockey','baseball']::text[] as sports, (person_id % 2 = 0) as has_seasons, 1.5::float8 as score
          from core.person where full_name like 'Turso Person %';
        create unique index on api.person_admin (person_id);
        create materialized view api.provenance as select 'game'::text as kind, 'NHL'::text as league, 'spx'::text as source,
          null::text as checked_by, 'single'::text as outcome, 3 as n;
        insert into core.external_id (entity_kind, entity_id, source_id, external_key)
          select 'person', person_id, (select min(source_id) from meta.source), 'ext-' || person_id from core.person where full_name like 'Turso Person %';
        insert into core.external_id (entity_kind, entity_id, source_id, external_key)
          select 'game', game_id, (select min(source_id) from meta.source), 'g-' || game_id from core.game limit 5;
        insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
          select (select min(source_id) from meta.source), 'game', 'k' || g, 'Tab' || E'\\t' || 'and "quote" ' || g, case when g % 2 = 0 then null else 'ok' end
          from generate_series(1, 12) g;
        insert into meta.verification (entity_kind, entity_id, field, status, source_id, evidence_url, their_value)
          select 'game', game_id, '*', 'confirmed', (select min(source_id) from meta.source), 'https://example.org/' || game_id, null from core.game limit 10;
        insert into core.betting_line (game_id, source_id, source_key, favourite, point_spread, total, recorded_at, offered_during)
          select game_id, (select min(source_id) from meta.source), 'bl' || game_id, 'home', 3.5, 44.5, now()::timestamp,
                 tsrange('2012-10-01', '2012-10-02') from core.game limit 6;
        insert into core.batted_ball_player (person_id, season_id, role, n, traj, cells, source_id)
          select (select min(person_id) from core.person where full_name like 'Turso Person %'), (select min(season_id) from core.season), 'bat', 7,
                 '\\x0102ff'::bytea, '\\xabcd'::bytea, (select min(source_id) from meta.source);
        analyze;
    """)
    psql(PROD, "select 1")


def main_flow(env, side):
    TR.fresh()
    seed_ds1()
    reset_turso(side)
    rc, out, err = env.rel("turso-schema", "--tables", ",".join(USED))
    ok("turso-schema prints definitions from DS1's catalog", rc == 0 and 'create table if not exists "core_external_id"' in out and '"traj" TEXT' in out, out + err)
    ok("the schema has the indexes and the key", 'primary key ("person_id")' in out and "core_betting_line_game_idx" in out, out)
    rc, out, err = env.rel("turso-schema", "--apply", "--tables", ",".join(USED))
    ok("turso-schema --apply creates the tables", rc == 0 and "core_external_id" in side.tables(), out + err)
    rc, out, err = env.rel("turso-schema", "--apply", "--tables", ",".join(USED))
    ok("and is safe to repeat", rc == 0, out + err)

    # a mix of targets is refused
    rc, out, err = env.rel("prepare", "--title", "Mixed targets", "--tables", "core.person,meta.verification")
    ok("a release to two places is refused", rc == 1 and "one release goes to one place" in err, out + err)

    prod_before = psql(PROD, "select md5(string_agg(t::text, ',')) from (select * from core.person order by person_id) t")
    rc, out, err = env.rel("prepare", "--title", "First Turso load", "--tables", ",".join(USED))
    n1 = TR.number_of(out)
    ok("prepare to Turso succeeds with no blocker", rc == 0 and n1 and "BLOCKER" not in out, out + err)
    pv = json.loads(psql(DS1, "select preview::text from meta.data_release where number = '%s'" % n1))
    ok("preview counts (30 people, 5 non-game external ids, 12 issues, 10 checks, 6 lines)",
       (pv["tables"]["api.person_admin"]["add"], pv["tables"]["core.external_id"]["add"], pv["tables"]["meta.data_issue"]["add"],
        pv["tables"]["meta.verification"]["add"], pv["tables"]["core.betting_line"]["add"]) == (30, 30, 12, 10, 6), pv["tables"])
    ok("the preview says Turso and has no size estimate", pv.get("target") == "turso" and pv["tables"]["api.person_admin"]["bytes_delta"] == 0, pv)
    ok("the release is pending on both sides", TR.status(n1) == "pending" and TR.status(n1, DS1) == "pending")
    ok("Turso is still empty", turso_rows(side, "core_external_id") == [])
    TR.approve(n1)
    rc, out, err = env.rel("run")
    ok("run applies the Turso release", rc == 0 and TR.status(n1) == "done" and TR.status(n1, DS1) == "done", out + err + TR.status(n1))
    res = json.loads(psql(PROD, "select result::text from meta.data_release where number = '%s'" % n1))
    ok("result says Turso, verified", res.get("target") == "turso" and res["verified"] is True, res)
    ok("Turso rows match DS1: people", len(turso_rows(side, "api_person_admin")) == 30)
    pa = side.query("select * from api_person_admin order by person_id limit 1")[0]
    ok("arrays are JSON text, booleans 0/1, floats real", pa["sports"]["value"] == '["hockey","baseball"]' and pa["has_seasons"]["type"] == "integer"
       and pa["score"]["type"] == "float" and pa["birth_year"]["type"] == "integer", pa)
    di = side.query("select issue, resolution from meta_data_issue order by data_issue_id limit 1")[0]
    ok("text with tabs and quotes survives", di["issue"]["value"].startswith("Tab\tand \"quote\"") and di["resolution"]["type"] in ("text", "null"), di)
    bb = side.query("select traj, cells from core_batted_ball_player")[0]
    ok("bytea is hex text", bb["traj"]["value"] == "0102ff" and bb["cells"]["value"] == "abcd", bb)
    bl = side.query("select point_spread, offered_during from core_betting_line limit 1")[0]
    ok("numeric and ranges keep their text", bl["point_spread"]["value"] == "3.5" and "2012-10-01" in bl["offered_during"]["value"], bl)
    ok("the external id publish filter keeps games out", side.query("select count(*) as n from core_external_id where entity_kind = 'game'")[0]["n"]["value"] == "0")
    ok("production was not touched", psql(PROD, "select md5(string_agg(t::text, ',')) from (select * from core.person order by person_id) t") == prod_before
       and psql(PROD, "select count(*) from core.external_id") == "0")
    ok("snapshot written, DS1 backup schema made", os.path.exists(os.path.join(env.snap, n1, "manifest.json"))
       and psql(DS1, "select count(*) from information_schema.schemata where schema_name = 'backup_release_%d'" % TR.rid(n1)) == "1")

    # nothing differs now
    rc, out, err = env.rel("prepare", "--title", "Again", "--tables", ",".join(USED))
    ok("nothing to release when Turso equals DS1", rc == 1 and "already match" in err, out + err)

    # change, add, remove
    psql(DS1, """
        update meta.data_issue set resolution = 'changed' where entity_key = 'k1';
        delete from meta.verification where entity_id in (select entity_id from meta.verification order by entity_id limit 2);
        insert into core.betting_line (game_id, source_id, source_key, favourite, point_spread, total)
          select game_id, (select min(source_id) from meta.source), 'bl2' || game_id, 'away', 1.5, 40 from core.game order by game_id desc limit 3;
        refresh materialized view api.person_admin;
    """)
    pre = {t: turso_rows(side, t) for t in ("meta_verification", "core_betting_line", "meta_data_issue")}
    rc, out, err = env.rel("prepare", "--title", "Second Turso load", "--tables", ",".join(USED), "--ticket", "T-2", "--replace")
    n2 = TR.number_of(out)
    pv = json.loads(psql(DS1, "select preview::text from meta.data_release where number = '%s'" % n2))["tables"]
    ok("second preview: 1 change, 2 removals, 3 additions", (pv["meta.data_issue"]["change"], pv["meta.verification"]["remove"], pv["core.betting_line"]["add"]) == (1, 2, 3), pv)
    TR.approve(n2)
    rc, out, err = env.rel("run")
    ok("second release runs", TR.status(n2) == "done", out + err + TR.status(n2))
    ok("Turso now has the change, the removals and the additions",
       side.query("select resolution from meta_data_issue where entity_key = 'k1'")[0]["resolution"]["value"] == "changed"
       and len(turso_rows(side, "meta_verification")) == 8 and len(turso_rows(side, "core_betting_line")) == 9)

    # rollback
    rc, out, err = env.rel("rollback", "--release", n2)
    n3 = TR.number_of(out)
    ok("rollback of a Turso release is prepared", rc == 0 and n3 and TR.status(n3) == "pending", out + err)
    TR.approve(n3)
    rc, out, err = env.rel("run")
    ok("rollback runs", TR.status(n3) == "done" and TR.status(n2) == "rolled_back", out + err + TR.status(n3))
    ok("Turso is exactly as before the second release", all(turso_rows(side, t) == pre[t] for t in pre))

    # drift
    rc, out, err = env.rel("drift")
    ss = psql(DS1, "select table_name || ':' || state from meta.sync_status where table_name in ('meta.verification', 'core.betting_line') order by 1")
    ok("drift compares Turso tables: they differ (the second release was rolled back)", rc == 1 and "core.betting_line:differs" in ss, out + err + ss)
    prop = psql(DS1, "select title from meta.data_release where status = 'pending' and created_by = 'drift'")
    ok("drift proposes a Turso fix release", "(Turso)" in prop, prop)
    sp = psql(PROD, "select prod_rows from meta.sync_status where table_name = 'core.betting_line'")
    ok("sync status holds Turso's row count", sp == "6", sp)


def failure_cases(env, side):
    TR.fresh()
    seed_ds1()
    reset_turso(side)
    env.rel("turso-schema", "--apply", "--tables", ",".join(USED))
    psql(DS1, "insert into core.external_id (entity_kind, entity_id, source_id, external_key) select 'person', 900000 + g, (select min(source_id) from meta.source), 'many-' || g from generate_series(1, 700) g")
    rc, out, err = env.rel("prepare", "--title", "Load", "--tables", "core.external_id")
    n = TR.number_of(out)
    TR.approve(n)
    env.rel("run")
    ok("a 730-row table loads in several batches", len(turso_rows(side, "core_external_id")) == 730 and TR.status(n) == "done", err)
    before = turso_rows(side, "core_external_id")

    # a row Turso refuses, in the last batch
    psql(DS1, "insert into core.external_id (entity_kind, entity_id, source_id, external_key) select 'person', 910000 + g, (select min(source_id) from meta.source), 'zzz-' || g from generate_series(1, 700) g;"
              "insert into core.external_id (entity_kind, entity_id, source_id, external_key) values ('person', 920000, (select min(source_id) from meta.source), 'zzz-boom')")
    side.exec_script(["create trigger boom before insert on core_external_id when new.external_key = 'zzz-boom' begin select raise(abort, 'boom'); end"])
    rc, out, err = env.rel("prepare", "--title", "Fails halfway", "--tables", "core.external_id")
    n = TR.number_of(out)
    TR.approve(n)
    rc, out, err = env.rel("run")
    ok("a failing apply marks the release failed on both sides", TR.status(n) == "failed" and TR.status(n, DS1) == "failed", out + err)
    msg = psql(PROD, "select error from meta.data_release where number = '%s'" % n)
    ok("the error says the snapshot was restored", "snapshot was restored" in msg and "boom" in msg, msg)
    ok("Turso is exactly as before", turso_rows(side, "core_external_id") == before)
    side.exec_script(["drop trigger boom"])

    # DS1 moved after the preview
    rc, out, err = env.rel("prepare", "--title", "Moves", "--tables", "core.external_id")
    n = TR.number_of(out)
    TR.approve(n)
    psql(DS1, "delete from core.external_id where external_key = 'zzz-1'")
    rc, out, err = env.rel("run")
    ok("a release is refused when DS1 changed after the preview", TR.status(n) == "failed" and "changed since the preview" in psql(PROD, "select error from meta.data_release where number = '%s'" % n), out + err)
    ok("Turso is unchanged by the refused release", turso_rows(side, "core_external_id") == before)

    # shrinking needs replace
    psql(DS1, "delete from core.external_id where external_key like 'zzz-%' or external_key like 'many-%'")
    rc, out, err = env.rel("prepare", "--title", "Shrink", "--tables", "core.external_id")
    ok("shrinking by more than 5 percent is a blocker for Turso too", "would shrink" in out, out + err)

    # no Turso: a clear error, nothing half done
    rc, out, err = env.rel("prepare", "--title", "No Turso", "--tables", "core.external_id", env={"TURSO_DATABASE_URL": "", "TURSO_AUTH_TOKEN": ""}, no_turso=True)
    ok("without TURSO_DATABASE_URL the error names it", rc == 2 and "TURSO_DATABASE_URL" in err, out + err)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="spx_stats")
    ap.add_argument("--turso", default=os.environ.get("TEST_TURSO_URL", "http://127.0.0.1:7742"))
    ap.add_argument("--only")
    a = ap.parse_args()
    TR.make_base(a.source)
    env = TR.Env()
    # db/checks of this checkout need newer tables than the scratch database has: a small repository with one empty check stands in
    env.repo = os.path.join(env.tmp, "repo")
    os.makedirs(os.path.join(env.repo, "db", "checks"))
    with open(os.path.join(env.repo, "db", "checks", "000_none.sql"), "w") as f:
        f.write("-- what: always empty\nselect 1 where false\n")
    for cmd in (["init", "-q"], ["add", "."], ["-c", "user.name=t", "-c", "user.email=t@example.org", "commit", "-q", "-m", "x"]):
        subprocess.run(["git", "-C", env.repo] + cmd, check=True, capture_output=True)
    base_rel = env.rel

    def rel(*args, env=None, no_turso=False):
        e = dict(env or {})
        if not no_turso:
            e.setdefault("TURSO_DATABASE_URL", a.turso)
        return base_rel(*args, env=e)
    env.rel = rel
    side = T.TursoSide(a.turso)
    try:
        for fn in (main_flow, failure_cases):
            if a.only and fn.__name__ not in a.only.split(","):
                continue
            print("--- " + fn.__name__, flush=True)
            fn(env, side)
    finally:
        env.close()
    print("\n%d failed" % len(TR.failures) if TR.failures else "\nall passed")
    for f in TR.failures:
        print("  FAILED: " + f)
    return 1 if TR.failures else 0


if __name__ == "__main__":
    sys.exit(main())

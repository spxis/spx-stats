#!/usr/bin/env python3
"""Tests of db/migrations/131_drop_turso_tables_production.sql on a small stand-in for production (a scratch database with the tables, views and
matviews it touches, in the shape the migrations leave them). The stand-in is not production: it proves the file's logic and that the two
view definitions are the latest ones (118, 078) with only `checked` changed.

    TEST_PG_PORT=7741 python3 -I scripts/release/test/test_drop_migration.py

Exit code: 0 all passed, 1 a check failed.
"""
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
HOST, PORT = os.environ.get("TEST_PG_HOST", "127.0.0.1"), os.environ.get("TEST_PG_PORT", "55432")
DB = "spx_drop_mig"
MIG = os.path.join(REPO, "db", "migrations", "131_drop_turso_tables_production.sql")
failures = []


def psql(db, sql, check=True, single=False):
    cmd = ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", HOST, "-p", PORT, "-U", "postgres", "-d", db] + (["-1"] if single else []) + ["-f", "-"]
    r = subprocess.run(cmd, input=sql, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError("psql failed: " + r.stderr.strip())
    return r.stdout.strip() if check else r


def ok(name, cond, detail=""):
    print("%s  %s%s" % ("PASS" if cond else "FAIL", name, ("  -> " + str(detail)) if (detail and not cond) else ""), flush=True)
    if not cond:
        failures.append(name)


def original(path, name):
    text = open(os.path.join(REPO, "db", "migrations", path)).read()
    return re.search(r"create or replace view api\.%s as.*?;\n" % name, text, re.S).group(0)


def view_statement(path, name, kind):
    stmt = original(path, name)
    sub = re.compile(r"\(select max\(case v\.status when 'confirmed' then 1 when 'disputed' then -1 end\) from meta\.verification v\s+where v\.entity_kind = '%s' and v\.entity_id = [a-z]\.[a-z_]+\) as checked" % kind)
    assert sub.search(stmt), "the verification sub-select of %s was not found in %s" % (name, path)
    return sub.sub("null::integer as checked", stmt)


def norm(s):
    return re.sub(r"\s+", " ", s).strip().rstrip(";")


STAND_IN = """
drop schema if exists api, core, meta cascade;
create schema api; create schema core; create schema meta;
create type meta.verification_status as enum ('confirmed', 'disputed', 'not_found');
create table meta.source (source_id smallint primary key, code text);
create table core.season (season_id int primary key, league_code text, start_year int);
create table core.game (game_id bigint primary key, season_id int, status text, game_date date, away_team_season_id bigint, home_team_season_id bigint, source_id smallint,
  away_score int, home_score int, phase text, went_to_overtime boolean, starts_at timestamptz, source_key text);
create table core.team_season (team_season_id bigint primary key, franchise_id bigint);
create table core.award_winner (id int primary key);
create table core.game_league_id (game_id bigint primary key, nhl_id text);
create table core.person (person_id bigint primary key);
create table meta.verification (verification_id bigint primary key, entity_kind text, entity_id bigint, status meta.verification_status, source_id smallint);
create table meta.data_issue (data_issue_id bigint primary key, source_id smallint, entity_kind text, issue text, resolution text);
create table core.external_id (entity_kind text, entity_id bigint, source_id smallint, external_key text, primary key (source_id, entity_kind, external_key));
create table core.batted_ball_player (person_id bigint, season_id int, role text, primary key (person_id, season_id, role));
create table core.betting_line (betting_line_id bigint primary key, game_id bigint);
create function api.team_name(bigint) returns text language sql as 'select ''x''::text';
create function api.refresh_order() returns table (view_name text) language sql as $$ select format('%I.%I', schemaname, matviewname) from pg_matviews where schemaname = 'api' $$;
create table core.soccer_match (match_id bigint primary key, source_key text, tournament_id int, stage_key text, stage_order int, group_name text, match_number int, match_date date,
  kickoff_local text, utc_offset text, home_team_id bigint, home_goals int, away_team_id bigint, away_goals int, home_goals_90 int, away_goals_90 int, extra_time boolean, shootout boolean,
  home_penalties int, away_penalties int, winner_team_id bigint, is_replay boolean, venue_name text, venue_city text, venue_country text, venue_wikidata_id text, venue_id bigint,
  source_id smallint, attendance int, shootout_style text);
create table core.soccer_tournament (tournament_id int primary key, league_code text, year int);
create table core.soccer_team (team_id bigint primary key, name text, slug text, flag_code text);
create table core.soccer_tournament_team (tournament_id int, team_id bigint, team_name text);
create table core.soccer_appearance (match_id bigint);
create table core.soccer_goal (match_id bigint);
create materialized view api.totals as select 1 as games, 2 as finals, (select count(*) from core.betting_line) as lines, (select count(*) from meta.verification) as confirmed,
  (select count(*) from meta.data_issue) as issues, 3 as award_winners, 4 as franchises, 5 as seasons, now() as refreshed_at;
create unique index totals_refreshed_at_key on api.totals (refreshed_at);
create materialized view api.quality as select 'check'::text as kind, count(*) as n from meta.verification;
create materialized view api.provenance as select 'game'::text as kind, count(*) as n from meta.verification;
create materialized view api.person_admin as select person_id from core.person p where exists (select 1 from core.external_id);
create view api.person_admin_countries as select person_id from api.person_admin;
create view api.person_admin_sports as select person_id from api.person_admin;
create view api.person_admin_sources as select person_id from api.person_admin;
create view api.person_admin_letters as select person_id from api.person_admin;
create view api.person_admin_span as select person_id from api.person_admin;
create view api.batted_ball_player as select person_id from core.batted_ball_player;
"""


def main():
    psql("postgres", "drop database if exists %s with (force)" % DB)
    psql("postgres", "create database %s" % DB)
    psql(DB, STAND_IN)
    psql(DB, original("118_game_box_link.sql", "games") + original("078_mls.sql", "soccer_matches"))
    text = open(MIG).read()
    games, soc = view_statement("118_game_box_link.sql", "games", "game"), view_statement("078_mls.sql", "soccer_matches", "soccer_match")
    ok("the migration holds the latest api.games (118) with only `checked` changed", norm(games) in norm(text))
    ok("the migration holds the latest api.soccer_matches (078) with only `checked` changed", norm(soc) in norm(text))
    ok("no cascade anywhere", "cascade" not in re.sub(r"--.*", "", text).lower())

    # a view the file does not know about stops it, and nothing changes
    psql(DB, "create view api.extra as select count(*) from meta.verification")
    r = psql(DB, text, check=False, single=True)
    ok("an unknown dependent stops the file", r.returncode != 0 and "depends on" in r.stderr, r.stderr[-200:])
    ok("and the file left nothing half done", psql(DB, "select count(*) from meta.verification") == "0"
       and psql(DB, "select to_regclass('api.totals') is not null") == "t" and psql(DB, "select to_regclass('api.quality') is not null") == "t")
    psql(DB, "drop view api.extra")

    # DS1 is recognised
    psql(DB, "create schema legacy_files")
    r = psql(DB, text, check=False, single=True)
    ok("it refuses to run on DS1", r.returncode != 0 and "production only" in r.stderr, r.stderr[-200:])
    psql(DB, "drop schema legacy_files")

    # the real run
    psql(DB, text, single=True)
    gone = ["meta.verification", "meta.data_issue", "core.external_id", "core.batted_ball_player", "core.betting_line", "api.quality", "api.provenance",
            "api.person_admin", "api.person_admin_span", "api.person_admin_letters", "api.batted_ball_player"]
    ok("the tables, matviews and views are gone", all(psql(DB, "select to_regclass('%s') is null" % n) == "t" for n in gone))
    ok("api.games and api.soccer_matches still exist, and `checked` is null", psql(DB, "select count(*) from api.games where checked is not null") == "0"
       and psql(DB, "select pg_typeof(checked)::text from api.soccer_matches limit 1") in ("integer", ""))
    ok("api.totals has the same columns, the three counts 0 and its key", psql(DB, "select string_agg(attname, ',' order by attnum) from pg_attribute where attrelid = 'api.totals'::regclass and attnum > 0")
       == "games,finals,lines,confirmed,issues,award_winners,franchises,seasons,refreshed_at"
       and psql(DB, "select count(*) from pg_indexes where indexname = 'totals_refreshed_at_key'") == "1")
    ok("what stays is untouched", psql(DB, "select count(*) from pg_tables where schemaname = 'core' and tablename in ('game', 'person', 'season')") == "3")
    print("\n%d failed" % len(failures) if failures else "\nall passed")
    for f in failures:
        print("  FAILED: " + f)
    psql("postgres", "drop database if exists %s with (force)" % DB)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

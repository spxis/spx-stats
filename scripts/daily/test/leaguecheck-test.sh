#!/bin/bash
# Tests scripts/daily/leaguecheck.sql on a scratch Postgres (Docker, removed by name afterwards): one league's rows are broken, the other leagues
# must still pass. Made-up rows, no DS1.
#   bash scripts/daily/test/leaguecheck-test.sh [port]      (port in 7740-7749, default 7742)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
CHECK="$HERE/../leaguecheck.sql"
PORT="${1:-7742}"
NAME="spx-leaguecheck-test-$PORT"
fail=0
docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:$PORT:5432 postgres:17-alpine >/dev/null || { echo "docker failed"; exit 1; }
trap 'docker rm -f "$NAME" >/dev/null 2>&1' EXIT
for i in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 2
docker cp "$CHECK" "$NAME:/leaguecheck.sql"

# $1 label; $2 the league this run applies (scope); $3 the check names expected to FAIL, '|' separated, empty for none.
# Fixture: the NBA has a daily team season with no identity, a staged result that is no game and a staged schedule of an owned season;
# the MLB is clean.
run() {
  local label="$1" league="$2" want="$3"
  local sql
  sql="drop schema if exists core cascade; create schema core;
create table core.season (season_id int, league_code text, start_year int);
create table core.team_season (team_season_id int, season_id int, source_id int, franchise_identity_id int);
create table core.game (game_id int, source_key text, source_id int);
create table core.external_id (source_id int, entity_kind text, external_key text);
insert into core.season values (1, 'nba', 2026), (2, 'mlb', 2026);
insert into core.team_season values (1, 1, 9, null), (2, 2, 9, 5);
insert into core.game values (1, 'mlb:1', 9);
create temp table src as select 9 as source_id;
create temp table _checks (name text, ok boolean, detail text);
create temp table sg (source_key text, league text, season int, act text);
insert into sg values ('nba:1', 'nba', 2026, 'result'), ('nba:2', 'nba', 2026, 'schedule'), ('mlb:1', 'mlb', 2026, 'result');
create temp table owned_season (league text, season int);
insert into owned_season values ('nba', 2026), ('mlb', 2026);
create temp table scope as select * from (values ('nba', 2026), ('mlb', 2026)) v(league, season);
delete from scope where '$league' <> '' and league <> '$league';
\\i /leaguecheck.sql
\\pset tuples_only on
\\pset format unaligned
select 'FAILED ' || name from _checks where not ok;
select 'COUNT ' || count(*) from _checks;"
  local out failed n
  out="$(printf '%s\n' "$sql" | docker exec -i "$NAME" psql -U postgres -X -q -v ON_ERROR_STOP=1 2>&1)"
  failed="$(printf '%s\n' "$out" | sed -n 's/^FAILED //p' | cut -c1-20 | sort | paste -sd'|' -)"
  n="$(printf '%s\n' "$out" | sed -n 's/^COUNT //p')"
  if [ "$failed" = "$want" ] && [ "$n" = 3 ]; then echo "ok   $label"
  else echo "FAIL $label: failed '$failed' (want '$want'), $n checks"; printf '%s\n' "$out" | head -8; fail=1; fi
}

run "the MLB run passes while the NBA's rows are broken" mlb ""
run "the NBA run fails on its own rows"                  nba "every result and can|every staged schedul|team seasons made he"
run "a run of all leagues sees every fault"              ""  "every result and can|every staged schedul|team seasons made he"
[ "$fail" = 0 ] && echo "leaguecheck: all passed" || { echo "leaguecheck: FAILED"; exit 1; }

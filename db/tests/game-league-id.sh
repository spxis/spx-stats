#!/bin/bash
# Migration 115 adds core.game_league_id and nhl_id on api.games. core.game_official is already
# the referees table (migration 020) and must still be that table afterwards. Build 212 copies a
# 10-digit nhl_api external key and ignores anything else. Scratch Postgres, removed by name.
#   bash db/tests/game-league-id.sh
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="spx-game-league-id-$$"
PORT=""
for p in 7740 7741 7742 7743 7744 7745 7746 7747 7748 7749; do
  if ! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then PORT=$p; break; fi
done
[ -n "$PORT" ] || { echo "no free port in 7740-7749"; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker info >/dev/null 2>&1 || { echo "Docker is not running"; exit 1; }
docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx \
  -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
docker exec -i "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 <<'SQL'
create role anon;
create role authenticated;
create schema core;
create schema meta;
create schema api;
grant usage on schema api to anon, authenticated;
create function api.team_name(integer) returns text language sql as $$ select 'Club' $$;
create table core.season (season_id int primary key, league_code text, start_year int);
create table core.team_season (team_season_id int primary key, season_id int, franchise_id int);
create table meta.source (source_id smallint primary key, code text);
create table meta.verification (entity_kind text, entity_id bigint, status text);
create table core.game (
  game_id bigint primary key, season_id int, phase text, game_date date, starts_at timestamptz,
  home_team_season_id int, away_team_season_id int, status text, home_score int, away_score int,
  went_to_overtime boolean, source_id int
);
create table core.external_id (
  entity_kind text, entity_id bigint, source_id int, external_key text
);
insert into core.season values (1, 'nhl', 2026);
insert into core.team_season values (10, 1, 100), (11, 1, 101);
insert into meta.source values (1, 'nhl_api'), (2, 'retrosheet');
insert into core.game values
  (7, 1, 'regular', '2026-10-16', null, 10, 11, 'scheduled', null, null, null, 1),
  (8, 1, 'playoffs', '2026-04-20', null, 11, 10, 'final', 3, 2, null, 1),
  (9, 1, 'regular', '2026-10-17', null, 10, 11, 'scheduled', null, null, null, 1);
insert into core.external_id values
  ('game', 7, 1, '2026020001'),
  ('game', 8, 1, '2026030416'),
  ('game', 9, 1, 'nhlapi:2026020002'),
  ('game', 9, 2, '2026020099'),
  ('franchise', 100, 1, 'team:BOS');
create table core.person (person_id bigint primary key);
insert into core.person values (42);
create table core.game_official (
  game_id bigint not null references core.game on delete cascade,
  person_id bigint not null references core.person,
  assignment text not null,
  jersey_number smallint,
  source_id smallint not null references meta.source,
  primary key (game_id, person_id, assignment)
);
insert into core.game_official values (7, 42, 'referee', 12, 1);
create view api.games as
select s.league_code as league, s.start_year as year, g.game_id, g.game_date, g.phase::text as phase, g.status::text as status,
       g.away_team_season_id as away_id, api.team_name(g.away_team_season_id) as away, g.away_score,
       g.home_team_season_id as home_id, api.team_name(g.home_team_season_id) as home, g.home_score,
       g.went_to_overtime as overtime, src.code as source,
       (select max(case v.status when 'confirmed' then 1 when 'disputed' then -1 end) from meta.verification v
         where v.entity_kind = 'game' and v.entity_id = g.game_id) as checked,
       (select franchise_id from core.team_season where team_season_id = g.away_team_season_id) as away_f,
       (select franchise_id from core.team_season where team_season_id = g.home_team_season_id) as home_f,
       g.starts_at
from core.game g join core.season s using (season_id) join meta.source src on src.source_id = g.source_id
where g.status <> 'cancelled';
SQL
docker cp "$REPO/db/migrations/115_game_league_id.sql" "$NAME:/tmp/115.sql"
docker cp "$REPO/db/build/212_game_league_id.sql" "$NAME:/tmp/212.sql"
docker exec "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -f /tmp/115.sql >/dev/null
docker exec "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -f /tmp/212.sql >/dev/null
got="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select game_id || '|' || coalesce(nhl_id::text, '') from api.games order by game_id;")"
want=$'7|2026020001\n8|2026030416\n9|'
if [ "$got" != "$want" ]; then echo "FAIL view got: $got"; exit 1; fi
refs="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select game_id || '|' || person_id || '|' || assignment || '|' || jersey_number from core.game_official order by game_id;")"
if [ "$refs" != "7|42|referee|12" ]; then echo "FAIL referees got: $refs"; exit 1; fi
cols="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'core' and table_name = 'game_official';")"
if [ "$cols" != "game_id,person_id,assignment,jersey_number,source_id" ]; then echo "FAIL referee columns: $cols"; exit 1; fi
ids="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'core' and table_name = 'game_league_id';")"
if [ "$ids" != "game_id,nhl_id" ]; then echo "FAIL league_id columns: $ids"; exit 1; fi
anon="$(docker exec "$NAME" psql -U postgres -d spx -q -Atc "set role anon; select game_id || '|' || coalesce(nhl_id::text, '') from api.games order by game_id;")"
if [ "$anon" != "$want" ]; then echo "FAIL anon view got: $anon"; exit 1; fi
if docker exec "$NAME" psql -U postgres -d spx -q -Atc "set role anon; select 1 from core.game_official limit 1;" >/dev/null 2>&1; then
  echo "FAIL anon can read core.game_official"; exit 1
fi
if docker exec "$NAME" psql -U postgres -d spx -q -Atc "set role anon; select 1 from core.game_league_id limit 1;" >/dev/null 2>&1; then
  echo "FAIL anon can read core.game_league_id"; exit 1
fi
echo "ok   nhl_id is on the view; the referees table is unchanged; anon can read the view"

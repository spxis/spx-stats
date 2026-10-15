#!/bin/bash
# Migration 112 adds starts_at to api.games without dropping a column. Scratch Postgres, removed by name.
#   bash db/tests/games-starts-at.sh
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="spx-game-time-$$"
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
create function api.team_name(integer) returns text language sql as $$ select 'Club' $$;
create table core.season (season_id int primary key, league_code text, start_year int);
create table core.team_season (team_season_id int primary key, season_id int, franchise_id int);
create table meta.source (source_id int primary key, code text);
create table meta.verification (entity_kind text, entity_id bigint, status text);
create table core.game (
  game_id bigint primary key, season_id int, phase text, game_date date, starts_at timestamptz,
  home_team_season_id int, away_team_season_id int, status text, home_score int, away_score int,
  went_to_overtime boolean, source_id int
);
insert into core.season values (1, 'nhl', 2025);
insert into core.team_season values (10, 1, 100), (11, 1, 101);
insert into meta.source values (1, 'nhlapi');
insert into core.game values (7, 1, 'regular', '2026-07-15', '2026-07-16 02:00+00', 10, 11, 'scheduled', null, null, null, 1);
insert into core.game values (8, 1, 'regular', '2026-07-16', null, 11, 10, 'scheduled', null, null, null, 1);
create view api.games as
select s.league_code as league, s.start_year as year, g.game_id, g.game_date, g.phase::text as phase, g.status::text as status,
       g.away_team_season_id as away_id, api.team_name(g.away_team_season_id) as away, g.away_score,
       g.home_team_season_id as home_id, api.team_name(g.home_team_season_id) as home, g.home_score,
       g.went_to_overtime as overtime, src.code as source,
       (select max(case v.status when 'confirmed' then 1 when 'disputed' then -1 end) from meta.verification v
         where v.entity_kind = 'game' and v.entity_id = g.game_id) as checked,
       (select franchise_id from core.team_season where team_season_id = g.away_team_season_id) as away_f,
       (select franchise_id from core.team_season where team_season_id = g.home_team_season_id) as home_f
from core.game g join core.season s using (season_id) join meta.source src on src.source_id = g.source_id
where g.status <> 'cancelled';
SQL
docker cp "$REPO/db/migrations/112_games_starts_at.sql" "$NAME:/tmp/112.sql"
docker exec "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -f /tmp/112.sql >/dev/null
got="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select game_id || '|' || coalesce(starts_at::text, '') from api.games order by game_id;")"
want=$'7|2026-07-16 02:00:00+00\n8|'
if [ "$got" = "$want" ]; then echo "ok   starts_at is on the view, and a null stays null"; exit 0; fi
echo "FAIL got: $got"; exit 1

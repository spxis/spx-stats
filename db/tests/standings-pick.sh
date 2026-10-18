#!/bin/bash
# Migration 132 (api.standings: best published row, stale row dropped) and db/checks/092_standings_pick.sql.
# Scratch Postgres with a small hand-made core schema (the real tables are far too big to copy), removed by name.
# Builds the NHL 1999-00, NHL 2001-02 and NHL 2026-27 faults of ticket cmvdqrnqw0006l5068m0oyhko, plus control cases,
# runs the OLD view (migration 085), then the NEW one (132) as anon, then the check.
#   bash db/tests/standings-pick.sh            # port 7741, name spx-scratch-nhlstand
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="${SCRATCH_NAME:-spx-scratch-nhlstand}"
PORT="${SCRATCH_PORT:-7741}"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && { echo "port $PORT is busy"; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker info >/dev/null 2>&1 || { echo "Docker is not running"; exit 1; }
docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx \
  -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
psql_() { docker exec -i "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -X -q "$@"; }

OLD_VIEW="$(awk '/^create or replace view api.standings as/{p=1} /^create or replace view api.team_seasons as/{p=0} p' "$REPO/db/migrations/085_fast_standings_career.sql")"
CHECK="$(grep -v '^--' "$REPO/db/checks/092_standings_pick.sql")"

psql_ -o /dev/null <<'SQL'
create role anon nologin;
create role authenticated nologin;
create schema core; create schema meta; create schema api;
grant usage on schema api to anon, authenticated;
create type core.season_phase as enum ('preseason', 'regular', 'playoffs', 'all_star');
create function api.team_name(integer) returns text language sql as $$ select 'Club ' || $1 $$;
create table meta.source (source_id smallint primary key, code text);
insert into meta.source values (1, 'spx_database'), (2, 'nhl_api');
create table core.season (season_id int primary key, league_code text, start_year int, games_per_team smallint);
create table core.conference (conference_id int primary key, name text, short_name text);
create table core.division (division_id int primary key, name text, short_name text);
create table core.team_season (team_season_id int primary key, season_id int references core.season, franchise_id int, conference_id int, division_id int);
create table core.standing (
  team_season_id int not null references core.team_season, phase core.season_phase not null default 'regular', as_of date not null,
  source_id smallint not null references meta.source, games_played smallint, wins smallint, losses smallint, ties smallint, ot_losses smallint,
  points smallint, points_for integer, points_against integer, home_record text, road_record text, last_ten text, streak text,
  division_rank smallint, games_behind numeric(4,1), source_key text, primary key (team_season_id, phase, as_of, source_id));
create table core.game (game_id bigint generated always as identity primary key, season_id int, phase core.season_phase, game_date date,
  home_team_season_id int, away_team_season_id int, status text, home_score int, away_score int, went_to_overtime boolean, decided_by_shootout boolean);
create index game_home_idx on core.game (home_team_season_id);
create index game_away_idx on core.game (away_team_season_id);

-- seasons: 1 = NHL 1999-00, 2 = NHL 2001-02, 3 = NHL 2026-27 (games_per_team not set), 4 = NBA 2021-22
insert into core.season values (1, 'nhl', 1999, 82), (2, 'nhl', 2001, 82), (3, 'nhl', 2026, null), (4, 'nba', 2021, 82);
-- one opponent per season (900 + season) takes the other side of every game
insert into core.team_season (team_season_id, season_id, franchise_id) values
  (901, 1, 9), (902, 2, 9), (903, 3, 9), (904, 4, 9),
  (1, 1, 1), (2, 2, 2), (3, 3, 3), (4, 3, 4), (5, 4, 5), (6, 4, 6), (7, 4, 7), (8, 1, 8);

-- n final regular games for team t against the season's opponent, a day apart from d0; the team wins w of them, the rest are regulation losses
create function pg_temp.games(t int, n int, d0 date, w int) returns void language sql as $$
  insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, status, home_score, away_score, went_to_overtime, decided_by_shootout)
  select ts.season_id, 'regular', d0 + i, t, 900 + ts.season_id, 'final', case when i <= w then 3 else 1 end, case when i <= w then 1 else 3 end, false, false
  from core.team_season ts, generate_series(1, n) i where ts.team_season_id = t $$;

-- case 1, NHL 1999-00 (club 1): the NHL API's 82-game final line, and an SPX reload dated 2004 with 57 games (11-36-6-4)
insert into core.standing (team_season_id, as_of, source_id, games_played, wins, losses, ties, ot_losses, points, source_key) values
  (1, '2000-04-09', 2, 82, 14, 57, 7, 4, 39, 'nhlapi:19992000:2000-04-09:ATL'),
  (1, '2004-12-21', 1, 57, 11, 36, 6, 4, 32, 'spx:history:7:2');
select pg_temp.games(1, 82, '1999-10-01', 14);
-- case 1b (club 8): only the SPX 57-game reload and 82 final games: the published row is all there is, it stays (games not newer than as_of)
insert into core.standing (team_season_id, as_of, source_id, games_played, wins, losses, ties, ot_losses, points, source_key) values
  (8, '2004-12-21', 1, 57, 11, 36, 6, 4, 32, 'spx:history:7:9');
select pg_temp.games(8, 82, '1999-10-01', 14);

-- case 2, NHL 2001-02 (club 2): early snapshot, the 82-game final line, then a playoff run filed as regular (5 games, 1-4)
insert into core.standing (team_season_id, as_of, source_id, games_played, wins, losses, ties, ot_losses, points, source_key) values
  (2, '2001-10-12', 1, 4, 1, 2, 1, 0, 3, 'spx:history:19:21'),
  (2, '2002-04-14', 2, 82, 40, 27, 9, 6, 95, 'nhlapi:20012002:2002-04-14:PHX'),
  (2, '2002-04-20', 1, 82, 40, 27, 9, 6, 95, 'spx:history:19:21'),
  (2, '2002-05-01', 1, 5, 1, 4, 0, 0, 0, 'spx:history:19:21');
select pg_temp.games(2, 82, '2001-10-01', 40);

-- case 3, NHL 2026-27 (clubs 3, 4; games_per_team null): club 3's published line (3 games, 2026-10-09) is older than its 5 final games (to 2026-10-14);
-- club 4's published line is dated after its last game and stays
insert into core.standing (team_season_id, as_of, source_id, games_played, wins, losses, ties, ot_losses, points, source_key) values
  (3, '2026-10-09', 2, 3, 2, 1, null, 0, 4, 'nhlapi:20262027:2026-10-09:X'),
  (4, '2026-10-15', 2, 5, 2, 3, null, 0, 4, 'nhlapi:20262027:2026-10-15:Y');
select pg_temp.games(3, 5, '2026-10-09', 3);
select pg_temp.games(4, 5, '2026-10-09', 2);

-- case 4, NBA 2021-22 (clubs 5, 6, 7; games_per_team 82): club 5 has 84 games (play-in filed as regular), above games_per_team: the published 82 stays;
-- club 6 has a published 80 and 82 newer final games within games_per_team: the scores win; club 7 has games only
insert into core.standing (team_season_id, as_of, source_id, games_played, wins, losses, source_key) values
  (5, '2022-04-10', 1, 82, 50, 32, 'wp:5'), (6, '2021-12-01', 1, 80, 40, 40, 'wp:6');
select pg_temp.games(5, 84, '2021-10-20', 50);
select pg_temp.games(6, 82, '2021-10-20', 41);
select pg_temp.games(7, 82, '2021-10-20', 30);

SQL
# the real previous definition, from migration 085
psql_ -c "$OLD_VIEW" -c "grant select on api.standings to anon, authenticated"
psql_ -c "create materialized view api.standing_index as select * from api.standings" -c "create unique index standing_index_key on api.standing_index (team_id)" -c "grant select on api.standing_index to anon"

show() { psql_ -P pager=off -c "select team_id as team, year, gp, w, l, t, otl, pts, basis from api.standings where team_id < 900 order by team_id"; }
echo "== OLD view (085)"; show
echo "== check 092 on the old view (rows by reason)"
psql_ -P pager=off -c "select what, count(*) as rows from ($CHECK) q group by 1 order by 1"

echo "== apply migration 132 (twice: rerunnable)"
psql_ < "$REPO/db/migrations/132_standings_best_published_row.sql"
psql_ < "$REPO/db/migrations/132_standings_best_published_row.sql"
psql_ -c "refresh materialized view concurrently api.standing_index"
echo "== NEW view (132)"; show

FAIL=0
expect() { # team, gp, basis
  got="$(psql_ -At -F' ' -c "select gp, basis from api.standings where team_id = $1")"
  if [ "$got" = "$2 $3" ]; then echo "ok   club $1: $got"; else echo "FAIL club $1: got '$got', want '$2 $3'"; FAIL=1; fi
}
expect 1 82 published     # 1999-00: the 82-game final line beats the later 57-game reload
expect 8 57 published     # only a short row, nothing newer in the scores: stays
expect 2 82 published     # 2001-02: the playoff run (5 games) no longer wins
expect 3 5 scores         # 2026-27: the 3-game snapshot is older than 5 final games
expect 4 5 published      # snapshot dated after the last game: stays
expect 5 82 published     # extra play-in games above games_per_team: published stands
expect 6 82 scores        # a shorter and older published row inside games_per_team: the scores
expect 7 82 scores        # no published row at all
c1="$(psql_ -At -c "select w || '-' || l || '-' || coalesce(otl, 0) || ' pts ' || pts from api.standings where team_id = 3")"
[ "$c1" = "3-2-0 pts 6" ] && echo "ok   club 3 record from scores: $c1" || { echo "FAIL club 3 record: $c1"; FAIL=1; }

echo "== anon can read both views"
psql_ -At -c "set role anon; select count(*) from api.standings; select count(*) from api.standing_index" | tr '\n' ' '; echo
echo "== check 092 on the new view (must be 0 rows)"
n="$(psql_ -At -c "select count(*) from ($CHECK) q")"
[ "$n" = "0" ] && echo "ok   check 092 rows: 0" || { echo "FAIL check 092 rows: $n"; psql_ -P pager=off -c "$CHECK"; FAIL=1; }
[ "$FAIL" = "0" ] && echo "ALL OK" || { echo "FAILED"; exit 1; }

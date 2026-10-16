#!/bin/bash
# Migrations 116 and 117 pack core.player_season_stat.stats as int4[] and expand it back to jsonb
# in api.person_stats. Build 213 rebuilds the two matviews that read the column. Scratch Postgres,
# a few dozen rows, removed by name. Nothing here is DS1 or production.
#   bash db/tests/stat-pack.sh
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="spx-stat-pack-$$"
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
docker exec "$NAME" pg_isready -U postgres >/dev/null

docker exec -i "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 <<'SQL'
create role anon;
create role authenticated;
create schema core;
create schema meta;
create schema api;
create type core.season_phase as enum ('regular', 'playoffs');
create function api.team_name(integer) returns text language sql as $$ select 'Club' $$;
create table core.season (season_id int primary key, league_code text, start_year int);
create table core.team_season (team_season_id int primary key, season_id int, franchise_id int);
create table core.person (
  person_id bigint primary key, full_name text, kind text, primary_position text,
  birth_country_code text, nationality_code text);
create table core.roster_stint (
  roster_stint_id bigint generated always as identity primary key,
  person_id bigint, team_season_id int, role text);
create table meta.source (source_id smallint primary key);
create table core.player_season_stat (
  person_id bigint not null,
  team_season_id int not null,
  phase core.season_phase not null,
  stat_group text not null,
  stats jsonb not null check (jsonb_typeof(stats) = 'object'),
  source_id smallint not null,
  games_played smallint,
  games_started smallint,
  is_total boolean,
  stat_basis text,
  source_key text,
  primary key (person_id, team_season_id, phase, stat_group, source_id)
);
create index player_season_stat_team_season_idx on core.player_season_stat (team_season_id);
create view api.person_stats as select 1 as person_id;
create view api.person_career_totals as select 1 as person_id;
create materialized view api.stat_reference as select 1 as n;
create materialized view api.country_franchise as select 1 as n;
insert into meta.source values (1);
insert into core.season values
  (1, 'nhl', 1999), (2, 'nba', 1999), (3, 'mlb', 1999), (4, 'nfl', 1999);
insert into core.team_season values
  (1, 1, 10), (2, 1, 11), (3, 2, 20), (4, 3, 30), (5, 4, 40), (6, 4, 41);
insert into core.person (person_id, full_name, kind, primary_position, birth_country_code) values
  (1, 'Skater One', 'player', 'C', 'CA'),
  (2, 'Skater Two', 'player', 'D', 'US'),
  (3, 'Goalie One', 'player', 'G', 'CA'),
  (4, 'Goalie Two', 'player', 'G', 'FI'),
  (5, 'Batter One', 'player', null, 'US'),
  (6, 'Batter Two', 'player', null, 'DO'),
  (7, 'Pitcher One', 'player', 'P', 'US'),
  (8, 'Pitcher Two', 'player', 'P', 'JP'),
  (9, 'Hooper One', 'player', null, 'US'),
  (10, 'Hooper Two', 'player', null, 'FR'),
  (11, 'Passer One', 'player', null, 'US'),
  (12, 'Passer Two', 'player', null, 'US'),
  (13, 'Rusher One', 'player', null, 'US'),
  (14, 'Rusher Two', 'player', null, 'US'),
  (15, 'Catcher One', 'player', null, 'US'),
  (16, 'Catcher Two', 'player', null, 'US'),
  (17, 'Defense One', 'player', null, 'US'),
  (18, 'Defense Two', 'player', null, 'US'),
  (19, 'Kicker One', 'player', null, 'US'),
  (20, 'Kicker Two', 'player', null, 'US'),
  (21, 'Punter One', 'player', null, 'US'),
  (22, 'Punter Two', 'player', null, 'US'),
  (23, 'Defense Three', 'player', null, 'CA');
insert into core.player_season_stat
  (person_id, team_season_id, phase, stat_group, stats, source_id, games_played, is_total, stat_basis) values
  (1, 1, 'regular', 'skater', '{"gp":82,"g":40,"a":50,"pts":90,"pim":30,"pm":-7,"sog":200,"ppg":10,"shg":2,"gwg":5}', 1, 82, false, null),
  (2, 2, 'playoffs', 'skater', '{"gp":12,"g":3,"a":4,"pts":7,"pim":6}', 1, 12, false, null),
  (3, 1, 'regular', 'goalie', '{"gp":40,"gs":38,"w":22,"l":12,"t":4,"otl":2,"ga":90,"sa":1100,"sv":1010,"so":3,"toi":240000}', 1, 40, false, null),
  (4, 2, 'playoffs', 'goalie', '{"gp":6,"gs":6,"w":4,"l":2,"ga":12,"sa":180,"sv":168,"so":1,"toi":36000}', 1, 6, false, null),
  (5, 4, 'regular', 'batting', '{"g":150,"ab":500,"r":80,"h":160,"2b":30,"3b":4,"hr":20,"rbi":90,"sb":10,"cs":3,"bb":50,"so":100,"ibb":5,"hbp":4,"sh":2,"sf":6,"gidp":12}', 1, 150, false, null),
  (6, 4, 'playoffs', 'batting', '{"g":5,"ab":20,"r":3,"h":7,"hr":1,"rbi":4}', 1, 5, false, null),
  (7, 4, 'regular', 'pitching', '{"w":15,"l":8,"g":32,"gs":32,"cg":2,"sho":1,"sv":0,"ipouts":600,"h":180,"er":70,"hr":18,"bb":50,"so":180,"bfp":850,"r":75,"wp":4,"bk":1,"hbp":6}', 1, 32, false, null),
  (8, 4, 'playoffs', 'pitching', '{"w":1,"l":0,"g":2,"gs":1,"ipouts":15,"h":4,"er":1,"so":6}', 1, 2, false, null),
  (9, 3, 'regular', 'basketball', '{"gp":82,"gs":82,"min":3000,"pts":2200,"reb":400,"ast":300,"stl":100,"blk":40,"a_min":36.6,"a_pts":27.35,"a_reb":4.88,"a_ast":3.7,"a_stl":1.22,"a_blk":0.49,"p_fg":0.456,"p_3p":0.381,"p_ft":0.9}', 1, 82, false, 'both'),
  (10, 3, 'playoffs', 'basketball', '{"gp":20,"pts":500,"reb":80,"a_pts":25}', 1, 20, false, 'per_game'),
  (11, 5, 'regular', 'passing', '{"gp":16,"cmp":300,"att":480,"yds":4200,"td":32,"int":10,"sck":40,"sckyds":250,"fd":200,"2pt":1,"ay":1800,"yac":2100}', 1, 16, false, 'total'),
  (12, 6, 'playoffs', 'passing', '{"gp":2,"cmp":40,"att":60,"yds":500,"td":4,"int":1,"sck":0,"sckyds":0}', 1, 2, false, 'total'),
  (13, 5, 'regular', 'rushing', '{"gp":16,"att":200,"yds":900,"td":8,"fum":2,"fl":1,"fd":40,"2pt":0}', 1, 16, false, 'total'),
  (14, 6, 'regular', 'rushing', '{"gp":8,"att":20,"yds":80,"td":1}', 1, 8, false, 'total'),
  (15, 5, 'regular', 'receiving', '{"gp":16,"rec":90,"tgt":140,"yds":1200,"td":8,"fum":1,"fl":0,"fd":50,"ay":800,"yac":400,"2pt":1}', 1, 16, false, 'total'),
  (16, 6, 'playoffs', 'receiving', '{"gp":2,"rec":8,"yds":110,"td":1}', 1, 2, false, 'total'),
  (17, 5, 'regular', 'defense', '{"gp":16,"tkl":80,"ast":30,"tfl":12,"sck":3.5,"sckyds":22.5,"qbh":10,"int":2,"intyds":40,"pd":8,"ff":3,"fr":1,"td":1,"sfty":0}', 1, 16, false, 'total'),
  (18, 6, 'regular', 'defense', '{"gp":16,"tkl":40,"ast":20,"sck":1.5,"sckyds":8}', 1, 16, false, 'total'),
  (23, 5, 'playoffs', 'defense', '{"gp":1,"tkl":4,"sck":0.5}', 1, 1, false, 'total'),
  (19, 5, 'regular', 'kicking', '{"gp":16,"fgm":30,"fga":35,"fgl":54,"fg40":8,"fg50":4,"fg60":1,"xpm":40,"xpa":42}', 1, 16, false, 'total'),
  (20, 6, 'regular', 'kicking', '{"gp":16,"fgm":20,"fga":28,"xpm":30,"xpa":32}', 1, 16, false, 'total'),
  (21, 5, 'regular', 'punting', '{"gp":16,"punts":60,"yds":2700,"long":68,"in20":22,"tb":5,"blk":1}', 1, 16, false, 'total'),
  (22, 6, 'playoffs', 'punting', '{"gp":2,"punts":8,"yds":360,"long":55,"in20":3,"tb":1,"blk":0}', 1, 2, false, 'total');
create table expected as
  select person_id, team_season_id, phase::text as phase, stat_group, stats from core.player_season_stat;
create view core.club_season_player as
with seen as (
  select person_id, team_season_id from core.roster_stint where role = 'player'
  union select person_id, team_season_id from core.player_season_stat)
select s.league_code as league, s.start_year as year, ts.franchise_id, ts.team_season_id, p.person_id,
       coalesce(p.birth_country_code, p.nationality_code, 'ZZ') as country
from seen t
join core.team_season ts using (team_season_id)
join core.season s using (season_id)
join core.person p using (person_id)
where p.kind = 'player';
SQL

docker cp "$REPO/db/migrations/116_stat_pack.sql" "$NAME:/tmp/116.sql"
docker cp "$REPO/db/migrations/117_stat_pack_rewrite.sql" "$NAME:/tmp/117.sql"
docker cp "$REPO/db/build/213_player_stat_pack.sql" "$NAME:/tmp/213.sql"
docker exec "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -1 -f /tmp/116.sql >/dev/null

sizes="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select pg_column_size('{\"gp\":82,\"g\":40,\"a\":50,\"pts\":90,\"pim\":30,\"pm\":-7,\"sog\":200,\"ppg\":10,\"shg\":2,\"gwg\":5}'::jsonb) || ' ' || pg_column_size(core.stats_pack('skater', '{\"gp\":82,\"g\":40,\"a\":50,\"pts\":90,\"pim\":30,\"pm\":-7,\"sog\":200,\"ppg\":10,\"shg\":2,\"gwg\":5}'::jsonb));")"
echo "sample bytes jsonb array: $sizes"

docker exec "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -1 -f /tmp/117.sql >/dev/null
docker exec "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -1 -f /tmp/117.sql >/dev/null

bad="$(docker exec "$NAME" psql -U postgres -d spx -Atc "
select count(*) from expected e
join api.person_stats p using (person_id, team_season_id, stat_group)
where p.phase = e.phase and exists (
  select 1 from jsonb_each(e.stats) a
  full join jsonb_each(p.stats) b using (key)
  where a.key is null or b.key is null or (a.value #>> '{}')::numeric is distinct from (b.value #>> '{}')::numeric);
")"
[ "$bad" = "0" ] || { echo "round trip mismatch: $bad rows"; exit 1; }

sack="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select stats ->> 'sck' from api.person_stats where person_id = 17 and stat_group = 'defense';")"
[ "$sack" = "3.5" ] || { echo "sacks came back as '$sack', want 3.5"; exit 1; }

career="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select (stats ->> 'sck')::numeric from api.person_career_totals where person_id = 17 and stat_group = 'defense';")"
[ "$career" = "3.5" ] || { echo "career sacks '$career', want 3.5"; exit 1; }

neg="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select stats ->> 'pm' from api.person_stats where person_id = 1;")"
[ "$neg" = "-7" ] || { echo "plus-minus '$neg', want -7"; exit 1; }

avg="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select (stats ->> 'a_pts') || ' ' || (stats ->> 'p_fg') from api.person_stats where person_id = 9;")"
[ "$avg" = "27.35 0.456" ] || { echo "basketball decimals '$avg', want 27.35 0.456"; exit 1; }

miss="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select stats ? 'stl' from api.person_stats where person_id = 10;")"
[ "$miss" = "f" ] || { echo "absent steal was stored"; exit 1; }

gap="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select (j ->> 'gwg') || ' ' || case when j ? 'gp' then 'yes' else 'no' end from (select core.stats_json('skater', core.stats_pack('skater', '{\"gwg\":5,\"pm\":-7}')) as j) s;")"
[ "$gap" = "5 no" ] || { echo "gap pack '$gap', want 5 no"; exit 1; }

merged="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select core.stats_json('skater', core.stats_merge(core.stats_pack('skater', '{\"gp\":1,\"g\":2}'), core.stats_pack('skater', '{\"a\":4,\"g\":9}')))::text;")"
echo "$merged" | grep -q '"gp": 1' && echo "$merged" | grep -q '"g": 9' && echo "$merged" | grep -q '"a": 4' || { echo "merge '$merged'"; exit 1; }

if docker exec "$NAME" psql -U postgres -d spx -Atc "select core.stats_pack('skater', '{\"gp\":1,\"nope\":2}');" >/dev/null 2>&1; then
  echo "unknown key was packed"; exit 1
fi

docker exec "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -1 -f /tmp/213.sql >/dev/null
scktot="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select top[1] from api.stat_reference where stat_group = 'defense' and metric = 'sck' and kind = 'total' and phase = 'regular' and bucket = 'all';")"
echo "$scktot" | grep -q "3.5" || { echo "stat_reference sacks '$scktot'"; exit 1; }

rows="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select count(*) from core.player_season_stat;")"
[ "$rows" = "23" ] || { echo "row count $rows, want 23"; exit 1; }

# Client-side copy, truncate (returns the file), copy back. Same order production must use, on this small table.
docker exec "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -c "\\copy (select person_id, team_season_id, phase::text as phase, stat_group, source_id, games_played, games_started, is_total, stat_basis, source_key, stats from core.player_season_stat) to '/tmp/pack.csv' csv header"
before="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select pg_database_size(current_database());")"
docker exec "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -c "truncate core.player_season_stat;"
after="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select pg_database_size(current_database());")"
[ "$after" -lt "$before" ] || { echo "truncate did not return space ($before -> $after)"; exit 1; }
docker exec "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -c "\\copy core.player_season_stat (person_id, team_season_id, phase, stat_group, source_id, games_played, games_started, is_total, stat_basis, source_key, stats) from '/tmp/pack.csv' csv header"
back="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select (select count(*) from core.player_season_stat)::text || ' ' || (select stats ->> 'sck' from api.person_stats where person_id = 17 and stat_group = 'defense');")"
[ "$back" = "23 3.5" ] || { echo "reload '$back', want 23 3.5"; exit 1; }

# The production refusal predicate, with the measured figures. This database is small, so 117 was allowed to rewrite.
refuse="$(docker exec "$NAME" psql -U postgres -d spx -Atc "select (376426 > 0 and 458 < 600 and (458 + 126 / 2) > 480)::text;")"
[ "$refuse" = "true" ] || { echo "production predicate would not refuse"; exit 1; }

echo "ok rows=$rows sack=$sack bytes=$sizes truncate $before->$after"

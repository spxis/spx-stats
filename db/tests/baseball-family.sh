#!/bin/bash
# The baseball family: db/build/139 and 140, db/seed/baseball_club.csv and the DS1 repair db/build/pending/baseball_family_repair.sql.
# A scratch Postgres with a small hand-made core schema and a few Retrosheet games of five leagues, removed by name. It builds the database as step 140
# used to (all games in mlb, the Cardinals' American Association years under a franchise of their own, the Brooklyn Gladiators filed under the Dodgers),
# runs the repair, then the new 140 twice, and checks that no game, team season, season or surviving franchise changed its id, that every game sits in
# the season of its own league, that the ghost franchises are folded, and that a rerun changes nothing.
#   bash db/tests/baseball-family.sh            # port 7747, name spx-scratch-baseball-fam
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="${SCRATCH_NAME:-spx-scratch-baseball-fam}"
PORT="${SCRATCH_PORT:-7747}"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && { echo "port $PORT is busy"; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker info >/dev/null 2>&1 || { echo "Docker is not running"; exit 1; }
pass=0 fail=0
ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; }

docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx \
  -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
psql_() { docker exec -i -w /work "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }

docker exec "$NAME" mkdir -p /work/db/build/pending /work/db/seed
docker cp "$REPO/db/build/139_baseball_leagues.sql" "$NAME:/work/db/build/139_baseball_leagues.sql"
docker cp "$REPO/db/build/140_mlb_from_retrosheet.sql" "$NAME:/work/db/build/140_mlb_from_retrosheet.sql"
docker cp "$REPO/db/build/pending/baseball_family_repair.sql" "$NAME:/work/db/build/pending/baseball_family_repair.sql"
docker cp "$REPO/db/seed/baseball_club.csv" "$NAME:/work/db/seed/baseball_club.csv"
# the step as it was before the family: the git version this change started from
git -C "$REPO" show "${OLD140_REF:-origin/main}:db/build/140_mlb_from_retrosheet.sql" | docker exec -i "$NAME" sh -c 'cat > /work/db/build/140_old.sql'

psql_ -o /dev/null <<'SQL'
create extension if not exists btree_gist;
create schema core; create schema meta; create schema ingest; create schema ref; create schema legacy_retrosheet;
create table meta.source (source_id smallint generated always as identity primary key, code text not null unique, name text, kind text, licence text,
  attribution text, url text, covers_from date, notes text);
insert into meta.source (code, name, kind) values ('spx_database', 'SPX', 'database');
create type meta.verification_status as enum ('confirmed', 'disputed', 'not_found');
create table meta.verification (entity_kind text, entity_id bigint, field text, status meta.verification_status, source_id smallint, their_value text);
create table meta.data_issue (source_id smallint, entity_kind text, entity_key text, issue text, resolution text);
create table ref.league (league_code text primary key, sport_code text not null, country_code text, founded_on date, dissolved_on date, notes text);
create table ref.league_name (league_code text not null references ref.league, valid_during daterange not null, name text, short_name text, primary key (league_code, valid_during));
insert into ref.league (league_code, sport_code) values ('mlb', 'baseball');
create type core.season_phase as enum ('preseason', 'regular', 'playoffs', 'all_star', 'exhibition', 'tournament');
create type core.game_status as enum ('scheduled', 'in_progress', 'final', 'postponed', 'suspended', 'cancelled', 'forfeit');
create table core.franchise (franchise_id integer generated always as identity primary key, sport_code text not null, source_id smallint, source_key text);
create table core.franchise_identity (
  franchise_identity_id integer generated always as identity primary key, franchise_id integer not null references core.franchise on delete cascade,
  valid_during daterange not null, location text not null, nickname text not null, full_name text not null, abbreviation text, region text,
  country_code text not null, source_id smallint, exclude using gist (franchise_id with =, valid_during with &&));
create table core.franchise_league (franchise_id integer not null references core.franchise on delete cascade, league_code text not null,
  valid_during daterange not null, source_id smallint, primary key (franchise_id, valid_during), exclude using gist (franchise_id with =, valid_during with &&));
create table core.franchise_brand (franchise_brand_id integer generated always as identity primary key, franchise_id integer not null references core.franchise on delete cascade,
  valid_during daterange not null default daterange(null, null), source_id smallint not null default 1, source_key text not null default '', unique (franchise_id, valid_during, source_id));
create table core.season (season_id integer generated always as identity primary key, league_code text not null references ref.league, start_year smallint not null,
  end_year smallint not null, label text not null, games_per_team smallint, source_id smallint, unique (league_code, start_year));
create table core.team_season (team_season_id integer generated always as identity primary key, franchise_id integer not null references core.franchise,
  season_id integer not null references core.season, franchise_identity_id integer references core.franchise_identity, source_id smallint, unique (franchise_id, season_id));
create table core.game (game_id bigint generated always as identity primary key, season_id integer not null references core.season, phase core.season_phase not null,
  game_date date not null, starts_at timestamptz, home_team_season_id integer not null references core.team_season, away_team_season_id integer not null references core.team_season,
  status core.game_status not null, home_score smallint, away_score smallint, went_to_overtime boolean, notes text, source_id smallint not null, source_key text not null,
  updated_at timestamptz not null default now());
create table core.external_id (entity_kind text not null, entity_id integer not null, source_id smallint not null, external_key text not null, primary key (source_id, entity_kind, external_key));
create table core.venue_game_season (season_id integer references core.season);
create table core.venue_final_game (season_id integer references core.season);
create table ingest.row_id_map (tbl text not null, natural_key text not null, row_id bigint not null, primary key (tbl, natural_key));
create view ingest.row_id_current as
select 'core.game'::text as tbl, source_id::text || '/' || source_key as natural_key, game_id::bigint as id from core.game
union all select 'core.franchise', source_id::text || '/' || source_key, franchise_id from core.franchise where source_key is not null
union all select 'core.season', league_code || '/' || start_year, season_id from core.season
union all select 'core.team_season', franchise_id || '/' || season_id, team_season_id from core.team_season;
create function ingest.identity_id_for(p_franchise integer, p_start date) returns integer language sql as $$
  select coalesce(
    (select m.row_id::integer from ingest.row_id_map m
      where m.tbl = 'core.franchise_identity' and m.natural_key = p_franchise || '/' || coalesce(p_start::text, '')
        and not exists (select 1 from core.franchise_identity y where y.franchise_identity_id = m.row_id)),
    nextval(pg_get_serial_sequence('core.franchise_identity', 'franchise_identity_id'))::integer) $$;

-- the SPX franchises 140 maps Retrosheet's current franchises onto (rmap: ATL 60, CHN 63, LAN 72, SLN 84)
insert into core.franchise (sport_code, source_id, source_key) select 'baseball', 1, 'team:' || t from unnest(array[60, 63, 72, 84]) t;
insert into core.external_id select 'franchise', franchise_id, 1, source_key from core.franchise;

create table legacy_retrosheet.current_name (franchise_id text not null, team_id text not null, league text, division text, city text, nickname text,
  alt_nickname text, first_game date not null, last_game date, home_city text, home_state text);
create table legacy_retrosheet.team (team_id text not null, league text not null, city text, nickname text, first_year integer, last_year integer);
create table legacy_retrosheet.game_log (game_date date, game_number smallint, game_type text, visitor text, visitor_league text, visitor_game int, home text, home_league text,
  home_game int, visitor_score smallint, home_score smallint, outs smallint, day_night text, completion text, forfeit text, protest text, park_id text, attendance int,
  minutes int, fields text[], source_file text);
insert into legacy_retrosheet.current_name (franchise_id, team_id, league, city, nickname, first_game, last_game) values
  ('ATL', 'BS1', 'NA', 'Boston', 'Red Stockings', '1871-05-05', '1875-10-30'), ('ATL', 'BSN', 'NL', 'Boston', 'Beaneaters', '1876-04-22', null),
  ('CHN', 'CH1', 'NA', 'Chicago', 'White Stockings', '1871-05-08', '1871-10-30'), ('CHN', 'CHN', 'NL', 'Chicago', 'White Stockings', '1876-04-25', null),
  ('LAN', 'BR3', 'AA', 'Brooklyn', 'Dodgers', '1884-05-01', '1887-10-10'), ('LAN', 'BR4', 'AA', 'Brooklyn', 'Bridegrooms', '1888-04-08', '1889-10-14'),
  ('LAN', 'BRO', 'NL', 'Brooklyn', 'Bridegrooms', '1890-04-19', null),
  ('SLN', 'SLN', 'AA', 'St. Louis', 'Browns', '1882-05-02', '1891-10-04'), ('SLN', 'SLN', 'NL', 'St. Louis', 'Cardinals', '1892-10-15', null);
insert into legacy_retrosheet.team values
  ('SL4', 'AA', 'St. Louis', 'Cardinals', 1882, 1891), ('BR4', 'AA', 'Brooklyn', 'Gladiators', 1890, 1890),
  ('LS2', 'AA', 'Louisville', 'Colonels', 1882, 1891), ('LS3', 'NL', 'Louisville', 'Colonels', 1892, 1899);
insert into legacy_retrosheet.game_log (game_date, game_number, game_type, visitor, visitor_league, home, home_league, visitor_score, home_score) values
  ('1871-05-06', 0, 'regular', 'CH1', 'NA', 'BS1', 'NA', 1, 2),
  ('1876-04-25', 0, 'regular', 'CHN', 'NL', 'BSN', 'NL', 3, 2),
  ('1885-06-01', 0, 'regular', 'LS2', 'AA', 'SL4', 'AA', 1, 4),
  ('1885-06-02', 0, 'regular', 'LS2', 'AA', 'SL4', 'AA', 5, 4),
  ('1890-04-20', 0, 'regular', 'LS2', 'AA', 'BR4', 'AA', 2, 3),
  ('1890-04-21', 0, 'regular', 'CHN', 'NL', 'BRO', 'NL', 2, 6),
  ('1890-04-22', 0, 'regular', 'CHN', 'NL', 'BRO', 'NL', 4, 1),
  ('1892-05-01', 0, 'regular', 'LS3', 'NL', 'SLN', 'NL', 0, 7);
SQL

snap() {  # snap NAME: the ids a rerun must keep
  psql_ <<SQL
drop schema if exists $1 cascade; create schema $1;
create table $1.game as select game_id, source_key, season_id, home_team_season_id, away_team_season_id from core.game;
create table $1.ts as select team_season_id, franchise_id, season_id from core.team_season;
create table $1.season as select season_id, league_code, start_year from core.season where exists (select 1 from core.team_season t where t.season_id = season.season_id);
create table $1.ident as select franchise_identity_id, franchise_id, valid_during from core.franchise_identity;
create table $1.fr as select franchise_id, source_key from core.franchise;
create table $1.fl as select franchise_id, league_code, valid_during from core.franchise_league;
SQL
}
diff_() {  # diff_ A B WHAT-IS-ALLOWED: number of rows of each table that differ between two snapshots
  psql_ -c "select (select count(*) from $1.game a full join $2.game b using (game_id) where a.game_id is null or b.game_id is null or (a.source_key, a.season_id, a.home_team_season_id, a.away_team_season_id) is distinct from (b.source_key, b.season_id, b.home_team_season_id, b.away_team_season_id)),
  (select count(*) from $1.ts a full join $2.ts b using (team_season_id) where a.team_season_id is null or b.team_season_id is null or (a.franchise_id, a.season_id) is distinct from (b.franchise_id, b.season_id)),
  (select count(*) from $1.fr a full join $2.fr b using (franchise_id) where a.franchise_id is null or b.franchise_id is null or a.source_key is distinct from b.source_key),
  (select count(*) from $1.ident a full join $2.ident b using (franchise_identity_id) where a.franchise_identity_id is null or b.franchise_identity_id is null or (a.franchise_id, a.valid_during) is distinct from (b.franchise_id, b.valid_during)),
  (select count(*) from (select * from $1.fl except select * from $2.fl) x) + (select count(*) from (select * from $2.fl except select * from $1.fl) x)"
}
expect() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got $2, wanted $3)"; fi; }

# ---- the database as the old step 140 built it
psql_ -o /dev/null -f /work/db/build/140_old.sql
expect "old step: every game is in mlb" "$(psql_ -c "select count(distinct s.league_code) from core.game g join core.season s using (season_id)")" "1"
expect "old step: the Cardinals' AA years are a franchise of their own" "$(psql_ -c "select count(*) from core.franchise where source_key in ('SL4', 'LS2', 'LS3')")" "3"
expect "old step: the Gladiators' games sit in the Dodgers' 1890 team season" "$(psql_ -c "select count(distinct g.home_team_season_id) from core.game g where g.source_key like 'retro:1890042%:BR%'")" "1"
psql_ -o /dev/null <<'SQL'
insert into ingest.row_id_map select tbl, natural_key, id from ingest.row_id_current on conflict do nothing;
SQL
snap s_old

# ---- the split, in place
psql_ -o /dev/null -f /work/db/build/139_baseball_leagues.sql
psql_ -1 -o /dev/null -f /work/db/build/pending/baseball_family_repair.sql
expect "repair: the three ghost franchises are gone" "$(psql_ -c "select count(*) from core.franchise where source_key in ('SL4', 'LS3')")" "0"
expect "repair: a rerun of the repair changes nothing" "$(psql_ -1 -f /work/db/build/pending/baseball_family_repair.sql 2>&1 | grep -c 'rows moved to the surviving franchise, 0 dropped')" "1"
snap s_repair
psql_ -o /dev/null -f /work/db/build/140_mlb_from_retrosheet.sql
snap s_140a
psql_ -o /dev/null -f /work/db/build/140_mlb_from_retrosheet.sql
snap s_140b

r="$(diff_ s_140a s_140b)"
expect "a rerun of 140 changes no game, team season, franchise, identity or league membership" "$r" "0|0|0|0|0"
r="$(diff_ s_repair s_140a)"
expect "140 after the repair changes no game or team season id, no franchise" "$(echo "$r" | cut -d'|' -f1-3)" "0|0|0"

expect "games: the 1871 game is in the NA, 1885 and 1890 in the AA, the National League's in mlb" \
  "$(psql_ -c "select string_agg(distinct s.league_code || s.start_year, ',' order by s.league_code || s.start_year) from core.game g join core.season s using (season_id)")" "aa1885,aa1890,mlb1876,mlb1890,mlb1892,na1871"
expect "mlb holds no season of the National Association" "$(psql_ -c "select count(*) from core.season where league_code = 'mlb' and start_year = 1871")" "0"
expect "the Cardinals are one franchise: their AA and NL team seasons share it" \
  "$(psql_ -c "select count(distinct t.franchise_id) from core.team_season t join core.franchise_identity i using (franchise_identity_id) where i.full_name like 'St. Louis%'")" "1"
expect "the folded ids point at the survivor in core.external_id" \
  "$(psql_ -c "select count(distinct entity_id) from core.external_id where entity_kind = 'franchise' and source_id = (select source_id from meta.source where code = 'retrosheet') and external_key in ('franchise:SLN', 'franchise:SL4')")" "1"
expect "Louisville is one franchise across the AA and the NL" \
  "$(psql_ -c "select count(distinct t.franchise_id) from core.team_season t join core.franchise_identity i using (franchise_identity_id) where i.full_name = 'Louisville Colonels'")" "1"
expect "the Dodgers' 1890 team season holds only the National League games" \
  "$(psql_ -c "select count(*) from core.game g join core.season s using (season_id) join core.team_season t on t.team_season_id in (g.home_team_season_id, g.away_team_season_id) join core.franchise_identity i using (franchise_identity_id) where i.full_name = 'Brooklyn Bridegrooms' and s.start_year = 1890 and s.league_code <> 'mlb'")" "0"
expect "the Gladiators are a franchise of their own, in the AA only" \
  "$(psql_ -c "select string_agg(l.league_code, ',') from core.franchise f join core.franchise_league l using (franchise_id) where f.source_key = 'BR4'")" "aa"
expect "the Cardinals' memberships: AA, then MLB, no gap or overlap" \
  "$(psql_ -c "select string_agg(l.league_code || l.valid_during::text, ' ' order by lower(l.valid_during)) from core.franchise_league l join core.external_id e on e.entity_id = l.franchise_id and e.external_key = 'franchise:SLN' and e.entity_kind = 'franchise'")" "aa[1882-05-02,1892-01-01) mlb[1892-01-01,)"
expect "every team season is inside its club's membership of that league" \
  "$(psql_ -c "select count(*) from core.team_season t join core.season s using (season_id) where not exists (select 1 from core.franchise_league l where l.franchise_id = t.franchise_id and l.league_code = s.league_code and l.valid_during && daterange(make_date(s.start_year, 1, 1), make_date(s.start_year + 1, 1, 1)))")" "0"

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]

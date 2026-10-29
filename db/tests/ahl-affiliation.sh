#!/bin/bash
# The AHL's NHL affiliations (migration 160, db/build/232_ahl_affiliation.sql) on a scratch Postgres that has every migration of the repository applied (the two files that
# only production or a later api object can take are skipped), the rows scripts/hockey_minor/season.py loads for 1940-41, 1985-86 and 2018-19 (db/tests/ahl-fixture.sql),
# the AHL build (229) and a small NHL made here: one franchise per code the fixture names, each with an identity carrying its abbreviation for the years it played.
# Checks: a code is placed on the NHL franchise whose identity carries it that season (two codes in a season are two rows, in order); "independent" has no parent; a code no
# identity carries that season, and a code two franchises carry, keep their label with no parent and are logged in meta.data_issue, never guessed; a rerun (twice more)
# changes no row and adds none; a row of another league is left alone; the api view answers as the anon role.
# The scratch container is removed by name afterwards.
#   bash db/tests/ahl-affiliation.sh            # port 7748, name spx-scratch-ahl-affil
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="${SCRATCH_NAME:-spx-scratch-ahl-affil}"
PORT="${SCRATCH_PORT:-7748}"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && { echo "port $PORT is busy"; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker info >/dev/null 2>&1 || { echo "Docker is not running"; exit 1; }
pass=0 fail=0
ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1: got '$2', want '$3'"; fi; }

docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx_stats -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
psql_() { docker exec -i -w /work "$NAME" psql -U postgres -d spx_stats -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }
docker exec "$NAME" mkdir -p /work/db
docker cp "$REPO/db/seed" "$NAME:/work/db/seed"
docker cp "$REPO/db/build" "$NAME:/work/db/build"
psql_ -c "create role anon nologin; create role authenticated nologin; create role ingest_writer nologin; create role service_role nologin; create extension if not exists btree_gist; create extension if not exists pg_trgm; create extension if not exists unaccent;" >/dev/null
for f in $(ls "$REPO"/db/migrations/*.sql | sort); do
  case "$(basename "$f")" in 131_*|149_*) continue;; esac     # production only / needs api.stat_reference
  psql_ -1 -o /dev/null < "$f" 2>/dev/null || { bad "migration $(basename "$f") applies"; }
done
ok "migrations applied"
psql_ -o /dev/null < "$HERE/ahl-fixture.sql"
# two clubs of 2018-19 get a code no franchise can take: one that no identity carries that year, one that two franchises carry
psql_ -c "update legacy_wikipedia_hockey_minor.team_season set affiliation = 'ATL' where league = 'ahl' and season = 2018 and affiliation = 'ANA';
          update legacy_wikipedia_hockey_minor.team_season set affiliation = 'TWIN' where league = 'ahl' and season = 2018 and affiliation = 'ARI'" >/dev/null
psql_ -f db/build/229_ahl_from_wikipedia.sql >/dev/null

# a small NHL: one franchise per code, each with an identity that carries the code for the years it played; ATL only 1999-2011 (so 2018 has none), TWIN twice
psql_ -o /dev/null <<'SQL'
insert into ref.sport (sport_code, name) values ('hockey', 'Ice hockey') on conflict do nothing;
insert into ref.league (league_code, sport_code, country_code) values ('nhl', 'hockey', 'US') on conflict do nothing;
create temp table nhl_code (code text, from_on date, to_on date);
insert into nhl_code select c, date '1917-07-01', null from unnest(string_to_array('BOS CHI DET MTL NYR BUF CGY EDM LAK NYI PHI PIT TOR VAN WSH CAR CBJ COL DAL FLA MIN NJD NSH OTT SJS STL TBL VGK WPG', ' ')) c;
insert into nhl_code values ('NYA', date '1925-07-01', date '1942-07-01'), ('HFD', date '1979-07-01', date '1997-07-01'), ('MNS', date '1967-07-01', date '1993-07-01'),
  ('QUE', date '1979-07-01', date '1995-07-01'), ('WIN', date '1979-07-01', date '1996-07-01'), ('ATL', date '1999-07-01', date '2011-07-01'),
  ('TWIN', date '1990-07-01', null), ('TWIN', date '1990-07-01', null);
do $$
declare r record; fid int;
begin
  for r in select * from nhl_code loop
    insert into core.franchise (sport_code) values ('hockey') returning franchise_id into fid;
    insert into core.franchise_league (franchise_id, league_code, valid_during) values (fid, 'nhl', daterange(r.from_on, r.to_on));
    insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, abbreviation, country_code)
      values (fid, daterange(r.from_on, r.to_on), r.code, 'Club', r.code || ' Club', r.code, 'US');
  end loop;
end $$;
-- a row of another league: the step must leave it alone
insert into core.season (league_code, start_year, end_year, label) values ('nhl', 2018, 2019, '2018-19');
insert into core.team_season (franchise_id, season_id) select franchise_id, (select season_id from core.season where league_code = 'nhl') from core.franchise_identity where abbreviation = 'BOS';
insert into core.team_season_affiliation (team_season_id, position, label) select team_season_id, 1, 'other-league-row' from core.team_season ts join core.season using (season_id) where league_code = 'nhl';
SQL

q() { psql_ -c "$1"; }
step() { psql_ -f db/build/232_ahl_affiliation.sql; }
step >/dev/null
total="$(q "select count(*) from core.team_season_affiliation a join core.team_season ts using (team_season_id) join core.season s using (season_id) where s.league_code = 'ahl'")"
check "lines: 9 clubs in 1940, 20 lines in 1985 (13 clubs, 7 with two), 31 in 2018" "$total" "60"
aff() { q "select string_agg(coalesce(f.full_name, '-'), '+' order by a.position) from core.team_season_affiliation a join core.team_season ts using (team_season_id) join core.season s using (season_id) join core.franchise_identity i on i.franchise_identity_id = ts.franchise_identity_id left join core.franchise_identity f on f.franchise_id = a.parent_franchise_id and f.valid_during @> make_date(s.start_year, 11, 15) where s.league_code = 'ahl' and s.start_year = $1 and i.full_name = '$2'"; }
check "Hershey 1940-41 is a farm team of the Boston club" "$(aff 1940 'Hershey Bears')" "BOS Club"
check "the Americans (NYA) of 1940 are placed through an identity that ended in 1942" "$(q "select count(*) from core.team_season_affiliation a join core.franchise_identity i on i.franchise_id = a.parent_franchise_id where a.label = 'NYA' and i.abbreviation = 'NYA'")" "1"
check "two NHL clubs in a season are two rows, in the order the article prints them (1985)" "$(q "select count(*) from core.team_season_affiliation a join core.team_season ts using (team_season_id) join core.season s using (season_id) where s.league_code = 'ahl' and s.start_year = 1985 and a.position = 2")" "7"
check "every 1985 line with two codes has both placed" "$(q "select count(*) from core.team_season_affiliation a join core.team_season ts using (team_season_id) join core.season s using (season_id) where s.league_code = 'ahl' and s.start_year = 1985 and a.parent_franchise_id is null")" "0"
check "independent: 3 clubs of 1940, no parent league, no parent franchise" "$(q "select count(*) from core.team_season_affiliation where label = 'independent' and parent_franchise_id is null and parent_league_code is null")" "3"
check "a placed parent is a franchise of the NHL" "$(q "select count(*) from core.team_season_affiliation a where a.parent_franchise_id is not null and a.parent_league_code is distinct from 'nhl'")" "0"
check "a code no identity carries that year (ATL in 2018) keeps its label and has no parent" "$(q "select concat_ws('/', label, coalesce(parent_franchise_id::text, 'none')) from core.team_season_affiliation where label = 'ATL'")" "ATL/none"
check "a code two franchises carry (TWIN) keeps its label and has no parent" "$(q "select concat_ws('/', label, coalesce(parent_franchise_id::text, 'none')) from core.team_season_affiliation where label = 'TWIN'")" "TWIN/none"
check "both are logged in meta.data_issue, nothing else is" "$(q "select count(*) from meta.data_issue where issue like 'AHL affiliation:%'")" "2"
check "resolved lines: 60 - 3 independent - 2 unplaced" "$(q "select count(*) from core.team_season_affiliation a join core.team_season ts using (team_season_id) join core.season s using (season_id) where s.league_code = 'ahl' and a.parent_franchise_id is not null")" "55"

keys() { q "select md5(string_agg(team_season_id || ':' || position || ':' || label || ':' || coalesce(parent_franchise_id::text, '') || ':' || coalesce(parent_league_code, ''), ',' order by team_season_id, position)) from core.team_season_affiliation"; }
before="$(keys)"; n0="$(q "select count(*) from core.team_season_affiliation")"
step >/dev/null; step >/dev/null
check "a rerun (twice) changes no row" "$(keys)" "$before"
check "a rerun adds no row and no data issue" "$(q "select count(*) from core.team_season_affiliation")/$(q "select count(*) from meta.data_issue where issue like 'AHL affiliation:%'")" "$n0/2"
check "the other league's row is still there" "$(q "select count(*) from core.team_season_affiliation where label = 'other-league-row'")" "1"

# a club season that drops out of a later load loses its row; the rest stay
psql_ -c "delete from legacy_wikipedia_hockey_minor.team_season where league = 'ahl' and season = 1940 and team_name = 'Hershey Bears'" >/dev/null
step >/dev/null
check "a dropped club season loses its row only" "$(q "select count(*) from core.team_season_affiliation")" "$((n0 - 1))"
check "the other league's row is still there" "$(q "select count(*) from core.team_season_affiliation where label = 'other-league-row'")" "1"

# the view reads as the anon role, with names
check "api.team_season_affiliation answers as anon" "$(psql_ -c "set role anon; select count(*) from api.team_season_affiliation where league = 'ahl'")" "$((n0 - 2))"
check "the view names the club and its parent that season" "$(psql_ -c "select concat_ws(' / ', team, parent_team) from api.team_season_affiliation where league = 'ahl' and year = 2018 and team = 'Charlotte Checkers'")" "Charlotte Checkers / CAR Club"

echo "$pass ok, $fail failed"
[ "$fail" = 0 ]

#!/bin/bash
# Build steps 140, 145, 146, 150, 151, 154, 216, 218 and 219 delete the franchise identities they own and add them again. A rerun must give every
# identity the id it had (core.team_season and the data release carry franchise_identity_id): the id of each deleted identity goes to
# ingest.row_id_map and ingest.identity_id_for (migration 146) gives it back by franchise and first day.
# Scratch Postgres with a small hand-made core schema, removed by name. The SQL under test is cut out of the real step files (from the
# "-- An identity keeps" comment to the end of the identity or league insert), so the test follows the steps. Migration 146 and
# db/build/221_row_id_map.sql are applied from the repository.
#   bash db/tests/identity-ids.sh            # port 7743, name spx-scratch-identids
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
B="$REPO/db/build"
NAME="${SCRATCH_NAME:-spx-scratch-identids}"
PORT="${SCRATCH_PORT:-7743}"
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
psql_() { docker exec -i "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }

# cut FILE END-REGEX: from the first "-- An identity keeps" line to the first line matching END-REGEX
cut_() {
  local out
  out="$(awk -v e="$2" '/^-- An identity keeps/{p=1} p{print} p&&$0~e{exit}' "$1")"
  [ -n "$out" ] && echo "$out" | grep -q 'identity_id_for' && echo "$out" | grep -q 'row_id_map' || { echo "could not cut the SQL out of $1" >&2; exit 1; }
  printf '%s\n' "$out"
}
F140="$(cut_ "$B/140_mlb_from_retrosheet.sql" 'group by franchise_id;$')"
F145="$(cut_ "$B/145_nhl_from_nhlapi.sql" 'group by franchise_id;$')"
F146="$(cut_ "$B/146_cfl_from_wikipedia.sql" 'where not r.covered;$')"
F150="$(cut_ "$B/150_nfl_from_nflverse.sql" 'group by franchise_id;$')"
F151="$(cut_ "$B/151_nfl_from_wikipedia.sql" '^where not isempty[(]p.rng[)];$')"
F154="$(cut_ "$B/154_hockey_rivals_from_wikipedia.sql" '^where not isempty[(]p.rng[)];$')"
F216="$(cut_ "$B/216_wnba_from_wikipedia.sql" '^where not isempty[(]p.rng[)];$')"
F218="$(cut_ "$B/218_pwhl_from_wikipedia.sql" '^where not isempty[(]p.rng[)];$')"
F219="$(cut_ "$B/219_nwsl_from_wikipedia.sql" '^where not isempty[(]p.rng[)];$')"

psql_ -o /dev/null <<'SQL'
create extension if not exists btree_gist;
create schema core; create schema meta; create schema ingest; create schema legacy_retrosheet;
create table meta.source (source_id smallint primary key, code text);
insert into meta.source values (1, 'spx_database'), (2, 'retrosheet'), (3, 'nhl_api'), (4, 'wikipedia_cfl'), (5, 'nflverse'), (6, 'wikipedia_nfl'),
  (7, 'wikipedia_hockey'), (8, 'wikipedia_wnba'), (9, 'wikipedia_pwhl'), (10, 'wikipedia_nwsl');
create table core.franchise (franchise_id int primary key, source_id smallint, source_key text);
create table core.franchise_identity (
  franchise_identity_id integer generated always as identity primary key, franchise_id integer not null references core.franchise,
  valid_during daterange not null, location text not null, nickname text not null, full_name text not null, abbreviation text, region text,
  country_code text not null, source_id smallint, exclude using gist (franchise_id with =, valid_during with &&));
create table core.franchise_league (franchise_id integer not null references core.franchise, league_code text not null, valid_during daterange not null,
  source_id smallint, primary key (franchise_id, valid_during), exclude using gist (franchise_id with =, valid_during with &&));
create table core.season (season_id int generated always as identity primary key, league_code text, start_year int);
create table core.team_season (team_season_id int generated always as identity primary key, franchise_id int, season_id int, probe date,
  franchise_identity_id int references core.franchise_identity);
-- the other tables migration 146's view reads
create table core.game (game_id bigint, source_id smallint, source_key text);
create table core.series (series_id bigint, source_id smallint, source_key text);
create table core.venue (venue_id int, source_id smallint, source_key text);
create table core.award (award_id int, code text);
create table core.soccer_match (match_id int, source_key text);
create table core.cup_series (cup_series_id int, cup_year int, seq int);
create table core.roster_stint (roster_stint_id int, source_id smallint, person_id int, team_season_id int, role text, captaincy text, valid_during daterange);
create table core.franchise_owner (franchise_owner_id int, source_id smallint, franchise_id int, owner_name text, valid_during daterange, share_note text);
create table ingest.row_id_map (tbl text not null, natural_key text not null, row_id bigint not null, first_seen timestamptz not null default now(), primary key (tbl, natural_key));
SQL
psql_ -o /dev/null < "$REPO/db/migrations/146_row_id_map_identity.sql"

snap() { psql_ -c "select franchise_id || ':' || coalesce(lower(valid_during)::text, '') || ':' || full_name || '=' || franchise_identity_id from core.franchise_identity order by franchise_id, lower(valid_during)"; }
links() { psql_ -c "select team_season_id || '=' || coalesce(franchise_identity_id, 0) from core.team_season order by 1"; }
remember221() { psql_ -o /dev/null < "$B/221_row_id_map.sql"; }
relink() {
  psql_ -c "update core.team_season ts set franchise_identity_id = (select i.franchise_identity_id from core.franchise_identity i
            where i.franchise_id = ts.franchise_id and i.valid_during @> ts.probe limit 1) where ts.franchise_identity_id is null"
}
# check LABEL: snapshot, run step again (map holds only what the first run's delete wrote), step again after step 221, compare each time
# usage: check LABEL RUN-FUNCTION
check() {
  local label="$1" run="$2" a b c la lb lc n
  $run; relink >/dev/null; a="$(snap)"; la="$(links)"
  n="$(echo "$a" | wc -l | tr -d ' ')"
  $run; relink >/dev/null; b="$(snap)"; lb="$(links)"
  [ "$a" = "$b" ] && ok "$label: a rerun keeps all $n identity ids" || bad "$label: ids changed on a rerun: $(diff <(echo "$a") <(echo "$b") | tr '\n' ' ')"
  [ "$la" = "$lb" ] && ok "$label: the team seasons link to the same identities" || bad "$label: links changed"
  remember221; $run; relink >/dev/null; c="$(snap)"; lc="$(links)"
  [ "$a" = "$c" ] && ok "$label: and after step 221 has remembered them" || bad "$label: ids changed after 221: $(diff <(echo "$a") <(echo "$c") | tr '\n' ' ')"
  [ "$la" = "$lc" ] && ok "$label: links unchanged after 221" || bad "$label: links changed after 221"
  SNAP="$a"
}
run_sql() { psql_ -o /dev/null; }

# ---------------------------------------------------------------- 140 MLB (Retrosheet): replaces every identity of its franchises, SPX's too
psql_ -o /dev/null <<'SQL'
insert into core.franchise values (1, 2, 'f1'), (2, 2, 'f2'), (3, 2, 'f3');
insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, country_code, source_id) values
  (1, '[1901-01-01,)', 'Old', 'Club', 'Old Club', 'US', 1), (2, '[1969-04-01,)', 'Gam', 'Bears', 'Gam Bears', 'US', 1);
insert into core.team_season (franchise_id, season_id, probe) values (1, 1, '1920-06-01'), (1, 2, '1960-06-01'), (2, 3, '1980-06-01'), (3, 4, '1905-06-01');
create table legacy_retrosheet.current_name (franchise_id text, team_id text, city text, nickname text, first_game date, last_game date);
create table legacy_retrosheet.team (team_id text, first_year int, last_year int, city text, nickname text);
insert into legacy_retrosheet.current_name values ('AAA', 'AA1', 'Alpha', 'Birds', '1901-04-01', '1950-10-01'), ('AAA', 'AA1', 'Beta', 'Birds', '1951-04-01', null),
  ('BBB', 'BB1', 'Gamma', 'Bears', '1969-04-01', null);
insert into legacy_retrosheet.team values ('CCC', 1900, 1910, 'Dead', 'Ones');
SQL
run140() {
  { cat <<SQL
create temp table src as select 2::smallint as source_id;
create temp table fr as select * from (values (1, 'AAA'), (2, 'BBB'), (3, 'CCC')) v(franchise_id, retro);
create temp table defunct as select 'CCC'::text as team_id;
$F140
SQL
  } | psql_ -o /dev/null
}
check "140 MLB" run140
echo "$SNAP" | grep -q '^2:1969-04-01:Gamma Bears=2$' && ok "140: SPX's identity that starts the same day is replaced under its own id" || bad "140: franchise 2 identity: $SNAP"

# ---------------------------------------------------------------- 145 NHL (API) and 154's fold of the Maroons (VMA) into the Millionaires (VMI)
psql_ -o /dev/null <<'SQL'
insert into core.franchise values (10, 3, 'MTL'), (11, 3, 'VMI'), (12, 3, 'VMA');
insert into core.franchise_league values (10, 'nhl', '[1917-07-01,)', 3);
insert into core.team_season (franchise_id, season_id, probe) values (10, 11, '1950-10-15'), (11, 12, '1912-10-15'), (12, 13, '1925-10-15');
SQL
run145() {
  { cat <<SQL
create temp table src as select 3::smallint as source_id;
create temp table nm as
select y yr, 10 franchise_id, 'MTL' abbrev, 'Montreal' location, case when y < 1960 then 'Canadiens' else 'Habs' end nickname,
       'Montreal ' || case when y < 1960 then 'Canadiens' else 'Habs' end full_name from generate_series(1917, 2024) y
union all select y, 11, 'VMI', 'Vancouver', 'Millionaires', 'Vancouver Millionaires' from generate_series(1911, 1923) y
union all select y, 12, 'VMA', 'Vancouver', 'Maroons', 'Vancouver Maroons' from generate_series(1924, 1926) y;
create temp table fr as select distinct franchise_id from nm;
$F145
SQL
  } | psql_ -o /dev/null
}
fold154() {
  psql_ -c "update core.team_season set franchise_id = 11 where franchise_id = 12;
            update core.franchise_identity set franchise_id = 11 where franchise_id = 12;
            delete from core.franchise_league where franchise_id = 12; delete from core.franchise where franchise_id = 12"
}
run145; relink >/dev/null
echo "$(snap)" | grep -q '^12:' && ok "145: VMA has its own identity before 154" || bad "145: VMA identity missing"
fold154; relink >/dev/null
X="$(snap)"
echo "$X" | grep -q '^12:' && bad "fold did not move VMA's identity" || ok "154 folds VMA's identity into VMI (ids stay)"
psql_ -c "insert into core.franchise values (12, 3, 'VMA')" >/dev/null
run145; relink >/dev/null
psql_ -c "update core.team_season set franchise_id = 11 where franchise_id = 12; update core.franchise_identity set franchise_id = 11 where franchise_id = 12; delete from core.franchise where franchise_id = 12" >/dev/null
[ "$(snap)" = "$X" ] && ok "145 + 154: a rerun of 145 then the fold gives the Maroons' identity its old id" || bad "145/154 VMA ids: $(diff <(echo "$X") <(snap) | tr '\n' ' ')"
psql_ -c "insert into core.franchise values (12, 3, 'VMA')" >/dev/null
check "145 NHL" run145

# ---------------------------------------------------------------- 146 CFL (Wikipedia): leaves identities of other sources alone
psql_ -o /dev/null <<'SQL'
insert into core.franchise values (20, 4, 'cfl:A'), (21, 4, 'cfl:B');
insert into core.franchise_league values (20, 'cfl', '[1950-01-01,)', 4), (21, 'cfl', '[1950-01-01,1990-01-01)', 4);
insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, country_code, source_id)
  values (20, '[1950-01-01,1970-01-01)', 'Spx', 'Club', 'Spx Club', 'CA', 1);
insert into core.team_season (franchise_id, season_id, probe) values (20, 21, '1960-09-20'), (20, 22, '1980-09-20'), (21, 23, '1985-09-20');
SQL
run146() {
  { cat <<SQL
create temp table src as select 4::smallint as source_id;
create temp table nm as select 20 franchise_id union select 21;
create temp table last_season as select 2025 y;
create temp table runs as
select 20 franchise_id, 'Spx Club' team_name, true covered, 1950 first_yr, 1969 last_yr
union all select 20, 'Spx Lions', false, 1970, 1999 union all select 20, 'Spx Elks', false, 2000, 2025
union all select 21, 'Bee Stampeders', false, 1950, 1989;
$F146
SQL
  } | psql_ -o /dev/null
}
check "146 CFL" run146
echo "$SNAP" | grep -q '^20:1950-01-01:Spx Club=' && ok "146: SPX's own identity is untouched" || bad "146: SPX identity: $SNAP"

# ---------------------------------------------------------------- 150 NFL (nflverse) and 151 (Wikipedia, the periods nflverse leaves)
psql_ -o /dev/null <<'SQL'
insert into core.franchise values (30, 5, 'team:x'), (31, 5, 'team:y');
insert into core.team_season (franchise_id, season_id, probe) values (30, 31, '1950-10-01'), (30, 32, '2005-10-01'), (31, 33, '2005-10-01'), (31, 34, '1999-10-01');
SQL
run150() {
  { cat <<SQL
create temp table src as select 5::smallint as source_id;
create temp table fr as select * from (values ('AAA', 30), ('BBB', 31)) v(code, franchise_id);
create temp table nm as
select 30 franchise_id, y season, case when y < 2010 then 'Xray Foxes' else 'Xray Wolves' end full_name, 'Xray' location,
       case when y < 2010 then 'Foxes' else 'Wolves' end nickname, 'AAA' team from generate_series(1999, 2024) y
union all select 31, y, 'Yankee Yaks', 'Yankee', 'Yaks', 'BBB' from generate_series(1999, 2024) y;
$F150
SQL
  } | psql_ -o /dev/null
}
run151() {
  { cat <<SQL
create temp table src as select 6::smallint as source_id;
create temp table nflfr as select 30 franchise_id union select 31;
create temp table nm as
select y yr, 30 franchise_id, case when y < 1960 then 'Xray Eagles' else 'Xray Foxes' end full_name from generate_series(1920, 1998) y where y <> 1935
union all select y, 31, 'Yankee Yaks' from generate_series(1940, 1998) y;
$F151
SQL
  } | psql_ -o /dev/null
}
run150; run151; relink >/dev/null
P="$(snap)"; PL="$(links)"
echo "$P" | grep -q '^30:1920-03-01:Xray Eagles=' && echo "$P" | grep -q '^30:1999-03-01:Xray Foxes=' && ok "150 + 151: nflverse's periods and Wikipedia's are both built" || bad "150/151 first run: $P"
run150; relink >/dev/null
echo "$(snap)" | grep -q '^30:1920' && bad "150 rerun left Wikipedia's identities" || ok "150 deletes the identities of other sources too (151 must follow)"
run151; relink >/dev/null
[ "$(snap)" = "$P" ] && [ "$(links)" = "$PL" ] && ok "150 then 151 rerun: every identity id (nflverse's and Wikipedia's) and every link is back" || bad "150/151 rerun: $(diff <(echo "$P") <(snap) | tr '\n' ' ')"
check "150 NFL" run150
check "151 NFL" run151

# ---------------------------------------------------------------- 154 hockey rivals (Wikipedia)
psql_ -o /dev/null <<'SQL'
insert into core.franchise values (40, 7, 'hockey:A'), (41, 7, 'hockey:B');
insert into core.franchise_league values (40, 'wha', '[1972-07-01,1979-07-01)', 7);
insert into core.team_season (franchise_id, season_id, probe) values (40, 41, '1975-11-15'), (41, 42, '1913-11-15'), (41, 43, '1921-11-15');
SQL
run154() {
  { cat <<SQL
create temp table src as select 7::smallint as source_id;
create temp table am as select 40 franchise_id union select 41;
create temp table hockfr as select franchise_id from am;
create temp table nm as
select y yr, 40 franchise_id, 'Alpha Aces' full_name, 'CA' country from generate_series(1972, 1978) y
union all select y, 41, case when y < 1917 then 'Beta Bears' else 'Beta Bruins' end, 'US' from generate_series(1911, 1925) y;
$F154
SQL
  } | psql_ -o /dev/null
}
check "154 hockey" run154

# ---------------------------------------------------------------- 216 WNBA, 218 PWHL, 219 NWSL (Wikipedia): the same shape
run_lg() {  # LEAGUE SOURCE FRANCHISE FRAGMENT
  {
    cat <<SQL
create temp table src as select $2::smallint as source_id;
create temp table am as select $3 franchise_id, 'Ace Wings' club, 'CA' country;
create temp table ${1}fr as select $3 franchise_id union select $3 + 1;
create temp table nm as
select y yr, $3 franchise_id, case when y < 2015 then 'Ace Birds' else 'Ace Wings' end full_name, case when y < 2015 then 'Birds' else 'Wings' end nickname from generate_series(2000, 2025) y
union all select y, $3 + 1, 'Bay Stars', 'Stars' from generate_series(2010, 2025) y;
$4
SQL
  } | psql_ -o /dev/null
}
setup_lg() {  # LEAGUE SOURCE FRANCHISE
  psql_ -o /dev/null <<SQL
insert into core.franchise values ($3, $2, '$1:A'), ($3 + 1, $2, '$1:B');
insert into core.franchise_league values ($3, '$1', '[2000-03-01,)', $2);
insert into core.season (league_code, start_year) select '$1', y from generate_series(2000, 2025) y;
insert into core.team_season (franchise_id, season_id, probe) values ($3, 1, '2001-07-01'), ($3, 2, '2020-07-01'), ($3 + 1, 3, '2020-07-01');
SQL
}
setup_lg wnba 8 50; run_wnba() { run_lg wnba 8 50 "$F216"; }; check "216 WNBA" run_wnba
setup_lg pwhl 9 60; run_pwhl() { run_lg pwhl 9 60 "$F218"; }; check "218 PWHL" run_pwhl
setup_lg nwsl 10 70; run_nwsl() { run_lg nwsl 10 70 "$F219"; }; check "219 NWSL" run_nwsl

# ---------------------------------------------------------------- 147 NBA (Wikipedia) and 147_nba_identity_merge: the merge keeps SPX's id, a rerun of both changes none
F147="$(awk '/^create temp table nbafr as/{p=1} /^update core.franchise f set founded_on/{p=0} p' "$B/147_nba_from_wikipedia.sql")"
R147="$(awk '/^update core.team_season ts set franchise_identity_id = \(/{p=1} p{print} /^where ts.franchise_identity_id is null/{p=0}' "$B/147_nba_from_wikipedia.sql")"
[ -n "$F147" ] && [ -n "$R147" ] || { echo "could not cut 147"; exit 1; }
psql_ -o /dev/null <<'SQL'
insert into core.franchise values (80, 11, 'nba:A'), (81, 11, 'nba:B');
insert into core.franchise_league values (80, 'nba', '[2000-07-01,2012-04-27)', 1);
insert into core.season (league_code, start_year) select 'nba', y from generate_series(1999, 2025) y;
insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, country_code, source_id)
  values (80, '[2000-07-01,2012-04-27)', 'Miami', 'Heat', 'Miami Heat', 'US', 1);
insert into core.team_season (franchise_id, season_id, probe)
  select 80, season_id, date '2000-10-15' from core.season where league_code = 'nba' and start_year = 2000
  union all select 80, season_id, date '2020-10-15' from core.season where league_code = 'nba' and start_year = 2020
  union all select 81, season_id, date '2020-10-15' from core.season where league_code = 'nba' and start_year = 2020;
SQL
run147() {
  { cat <<SQL
create temp table src as select 11::smallint as source_id;
create temp table nm as
select y yr, 80 franchise_id, 'Miami Heat' full_name, 'Heat' nickname from generate_series(1999, 2025) y
union all select y, 81, 'Utah Jazz', 'Jazz' from generate_series(1999, 2025) y;
create temp table fr as select distinct franchise_id from nm;
$F147
$R147
SQL
  } | psql_ -o /dev/null
  psql_ -o /dev/null < "$B/147_nba_identity_merge.sql"
}
check "147 NBA + merge" run147
[ "$(echo "$SNAP" | grep -c '^80:')" = 1 ] && echo "$SNAP" | grep -q '^80:1999-07-01:Miami Heat=' && ok "147: the Heat's runs are one identity, under SPX's id" || bad "147 merge: $SNAP"

# ---------------------------------------------------------------- a changed period gets a new id, never one already in use; the drift check sees none of it
run154_moved() {
  { cat <<SQL
create temp table src as select 7::smallint as source_id;
create temp table am as select 40 franchise_id union select 41;
create temp table hockfr as select franchise_id from am;
create temp table nm as
select y yr, 40 franchise_id, 'Alpha Aces' full_name, 'CA' country from generate_series(1972, 1978) y
union all select y, 41, case when y < 1919 then 'Beta Bears' else 'Beta Bruins' end, 'US' from generate_series(1911, 1925) y;
$F154
SQL
  } | psql_ -o /dev/null
}
BEFORE="$(snap)"
run154_moved; relink >/dev/null
AFTER="$(snap)"
OLD_BRUINS="$(echo "$BEFORE" | grep ':Beta Bruins=' | sed 's/.*=//')"; NEW_BRUINS="$(echo "$AFTER" | grep ':Beta Bruins=' | sed 's/.*=//')"
[ -n "$NEW_BRUINS" ] && [ "$OLD_BRUINS" != "$NEW_BRUINS" ] && [ "$(echo "$AFTER" | sed 's/.*=//' | sort | uniq -d | wc -l | tr -d ' ')" = 0 ] && ok "a period whose first day moved gets a new, unused id" || bad "moved period ids: $BEFORE -> $AFTER"
[ "$(echo "$BEFORE" | grep -v ':Beta B')" = "$(echo "$AFTER" | grep -v ':Beta B')" ] && ok "the other identities keep their ids" || bad "other identities changed"
remember221
D="$(psql_ -c "select count(*) from ingest.row_id_map m join ingest.row_id_current c on c.tbl = m.tbl and c.natural_key = m.natural_key where c.id <> m.row_id and m.tbl = 'core.franchise_identity'")"
[ "$D" = 0 ] && ok "db/checks/093: no identity id differs from the remembered one" || bad "check 093 finds $D identities"

echo
echo "passed $pass, failed $fail"
[ "$fail" = 0 ]

#!/bin/bash
# db/build/176_franchise_info.sql and 198_home_venue.sql: a rerun keeps the venue_id of every venue (176 deletes a Wikidata venue nothing points at, 198
# adds it again), and db/build/pending/venue_id_repair.sql puts venues that did get new ids back on the remembered ones in every table that holds
# a venue id. Scratch Postgres with a small hand-made schema (the real foreign keys of core.venue, a one-table ingest.row_id_current), removed by name.
# The SQL under test is cut out of the real step files (the venue_id_for helper, the venue insert and, in 176, the delete), so the test follows them.
#   bash db/tests/venue-ids.sh            # port 7742, name spx-scratch-venueids
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
S176="$REPO/db/build/176_franchise_info.sql"
S198="$REPO/db/build/198_home_venue.sql"
REPAIR="$REPO/db/build/pending/venue_id_repair.sql"
NAME="${SCRATCH_NAME:-spx-scratch-venueids}"
PORT="${SCRATCH_PORT:-7742}"
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

HELPER="$(awk '/^create or replace function pg_temp.venue_id_for/{p=1} p{print} p&&/\$\$;/{exit}' "$S176")"
HELPER198="$(awk '/^create or replace function pg_temp.venue_id_for/{p=1} p{print} p&&/\$\$;/{exit}' "$S198")"
INS176="$(awk '/^insert into core.venue \(venue_id, city/{p=1} /^create temp table vmap/{p=0} p' "$S176")"
INS198="$(awk '/^insert into core.venue \(venue_id, city/{p=1} p{print} p&&/^on conflict \(source_id, source_key\) do nothing;/{exit}' "$S198")"
[ -n "$HELPER" ] && [ -n "$HELPER198" ] && [ -n "$INS176" ] && [ -n "$INS198" ] || { echo "could not cut the SQL out of the step files"; exit 1; }
echo "$INS176" | grep -q 'with gone as' || { echo "176's delete is not in the cut"; exit 1; }

psql_ -o /dev/null <<'SQL'
create schema core; create schema meta; create schema ref; create schema ingest; create schema legacy_game_venue;
create table meta.source (source_id smallint primary key, code text);
insert into meta.source values (1, 'spx_database'), (3, 'wikidata');
create table ref.country (country_code text primary key);
insert into ref.country values ('US'), ('CA');
create table core.venue (
  venue_id integer generated always as identity primary key, city text not null, region text, country_code text not null references ref.country,
  opened_on date, closed_on date, capacity integer, latitude numeric(9, 6), longitude numeric(9, 6), source_id smallint references meta.source, notes text,
  source_key text, time_zone text, kind text, address text, postal_code text, surface text, roof text, is_indoor boolean, architect text, cost_usd numeric(14, 0),
  unique (source_id, source_key));
create table core.venue_name (venue_id integer not null references core.venue on delete cascade, valid_during daterange not null, name text not null,
  primary key (venue_id, valid_during));
create table core.venue_feature (venue_id integer not null references core.venue on delete cascade, valid_during daterange not null, surface text,
  primary key (venue_id, valid_during));
create table core.franchise_venue (franchise_id integer not null, venue_id integer not null references core.venue, valid_during daterange not null,
  primary key (franchise_id, valid_during));
create table core.franchise_home_venue (franchise_id integer not null, venue_id integer not null references core.venue, valid_during daterange not null,
  primary key (franchise_id, valid_during));
create table core.game (game_id bigint primary key, venue_id integer references core.venue);
create table core.game_venue (game_id bigint primary key references core.game on delete cascade, venue_id integer references core.venue);
create table core.team_season (team_season_id int primary key, home_venue_id integer references core.venue);
create table core.soccer_match (match_id int primary key, venue_id integer references core.venue);
create table core.venue_game_season (venue_id integer not null references core.venue, league_code text not null, season_id integer not null,
  primary key (venue_id, league_code, season_id));
create table core.venue_final_game (game_id bigint primary key references core.game on delete cascade, venue_id integer not null references core.venue);
create table legacy_game_venue.filled (game_id bigint primary key, venue_id integer not null);
create table legacy_game_venue.home_prelim (franchise_id integer not null, venue_id integer not null, valid_during daterange not null, primary key (franchise_id, valid_during));
create table ingest.row_id_map (tbl text not null, natural_key text not null, row_id bigint not null, first_seen timestamptz not null default now(), primary key (tbl, natural_key));
-- migration 136's view has one branch per table; the venue branch is the one that matters here
create view ingest.row_id_current as
  select 'core.venue'::text as tbl, source_id::text || '/' || source_key as natural_key, venue_id::bigint as id from core.venue where source_key is not null;
SQL

# the inputs 176 builds earlier: venue_src (Wikidata places) and venue_new (the ones with a city and a known country). $1 = qids in venue_src, $2 = qids in venue_new
run176() {
  {
    cat <<SQL
$HELPER
create temp table venue_src as
select q as qid, 'City ' || q as city, 'US-NY' as address_region, 'US' as address_country, 11 as opened_prec, date '1990-01-01' as opened_on,
       11 as closed_prec, null::date as closed_on, 1000 as capacity, 40.5::numeric as latitude, -70.5::numeric as longitude, 'America/New_York' as time_zone,
       array['arena']::text[] as instance_of, 'Main St' as address_street, '10001' as address_postal, 'ice' as surface, 'dome' as roof, 'Arch' as architect,
       null::text as cost_unit, null::numeric as cost
from unnest(string_to_array('$1', ',')) q;
create temp table venue_new as select q as qid from unnest(string_to_array('$2', ',')) q;
$INS176
SQL
  } | psql_ -o /dev/null
}
# the inputs 198 builds earlier: wd and vpick. $1 = qids
run198() {
  {
    cat <<SQL
$HELPER198
create temp table wd as select source_id from meta.source where code = 'wikidata';
create temp table vpick as
select q as qid, 'City ' || q as city, 'US-CA' as region, 'US' as country_code, null::date as opened_on, null::date as closed_on, 500 as capacity,
       34.1::numeric(9, 6) as latitude, -118.2::numeric(9, 6) as longitude, 'stadium' as kind, null::text as surface, null::text as roof,
       null::text as address, null::text as postal_code
from unnest(string_to_array('$1', ',')) q;
$INS198
SQL
  } | psql_ -o /dev/null
}
ids() { psql_ -c "select string_agg(source_key || '=' || venue_id, ' ' order by source_key) from core.venue"; }
remember() { psql_ -c "insert into ingest.row_id_map (tbl, natural_key, row_id) select tbl, natural_key, id from ingest.row_id_current on conflict do nothing"; }
drift() { psql_ -c "select count(*) from ingest.row_id_map m join ingest.row_id_current c on c.tbl = m.tbl and c.natural_key = m.natural_key where c.id <> m.row_id"; }
# what points at which venue (by the venue's key), for every table that holds an id
signature() {
  psql_ -c "
  select string_agg(t || ':' || k || ':' || n, ' ' order by t, k) from (
    select 'name' t, v.source_key k, count(*) n from core.venue_name x join core.venue v using (venue_id) group by 2
    union all select 'feature', v.source_key, count(*) from core.venue_feature x join core.venue v using (venue_id) group by 2
    union all select 'fv', v.source_key, count(*) from core.franchise_venue x join core.venue v using (venue_id) group by 2
    union all select 'fhv', v.source_key, count(*) from core.franchise_home_venue x join core.venue v using (venue_id) group by 2
    union all select 'game', v.source_key, count(*) from core.game x join core.venue v using (venue_id) group by 2
    union all select 'gv', v.source_key, count(*) from core.game_venue x join core.venue v using (venue_id) group by 2
    union all select 'ts', v.source_key, count(*) from core.team_season x join core.venue v on v.venue_id = x.home_venue_id group by 2
    union all select 'sm', v.source_key, count(*) from core.soccer_match x join core.venue v using (venue_id) group by 2
    union all select 'vgs', v.source_key, count(*) from core.venue_game_season x join core.venue v using (venue_id) group by 2
    union all select 'vfg', v.source_key, count(*) from core.venue_final_game x join core.venue v using (venue_id) group by 2
    union all select 'filled', v.source_key, count(*) from legacy_game_venue.filled x join core.venue v using (venue_id) group by 2
    union all select 'prelim', v.source_key, count(*) from legacy_game_venue.home_prelim x join core.venue v using (venue_id) group by 2) z"
}

# ---------------------------------------------------------------- first build: 176 gives Q1-Q3 (Q4 has no city), 198 adds Q3 (already there), Q6, Q7, Q8
run176 "Q1,Q2,Q3,Q4" "Q1,Q2,Q3"
run198 "Q3,Q6,Q7,Q8"
A="$(ids)"
[ "$(psql_ -c 'select count(*) from core.venue')" = 6 ] && ok "first build: six venues (176 made Q1-Q3, 198 made Q6-Q8)" || bad "first build: $A"
remember   # db/build/221
# references: Q1 and Q2 have periods and names, Q6 has a game and more, Q7 and Q8 nothing yet (198's venues no home period names)
psql_ -o /dev/null <<'SQL'
insert into core.venue_name select venue_id, daterange(null, null), 'name ' || source_key from core.venue where source_key in ('Q1', 'Q2', 'Q3', 'Q6');
insert into core.venue_feature select venue_id, daterange(null, null), 'ice' from core.venue where source_key in ('Q1', 'Q6');
insert into core.franchise_venue select 1, venue_id, daterange('1990-01-01', null) from core.venue where source_key = 'Q1';
insert into core.franchise_home_venue select 1, venue_id, daterange('1990-01-01', '2000-01-01') from core.venue where source_key = 'Q1';
insert into core.franchise_home_venue select 2, venue_id, daterange('1990-01-01', null) from core.venue where source_key = 'Q2';
insert into core.game select (case source_key when 'Q6' then 10 else 20 end) + i, venue_id from core.venue, generate_series(1, 2) i where source_key in ('Q6', 'Q2');
insert into core.game_venue select 10 + i, venue_id from core.venue, generate_series(1, 2) i where source_key = 'Q6';
insert into core.team_season select 1, venue_id from core.venue where source_key = 'Q2';
insert into core.soccer_match select 1, venue_id from core.venue where source_key = 'Q3';
insert into core.venue_game_season select venue_id, 'nhl', s from core.venue, generate_series(2001, 2003) s where source_key = 'Q6';
insert into core.venue_final_game select 10 + i, venue_id from core.venue, generate_series(1, 2) i where source_key = 'Q6';
insert into legacy_game_venue.filled select 10 + i, venue_id from core.venue, generate_series(1, 2) i where source_key = 'Q6';
insert into legacy_game_venue.home_prelim select 1, venue_id, daterange('1990-01-01', '2000-01-01') from core.venue where source_key = 'Q1';
SQL
SIG0="$(signature)"
[ "$(drift)" = 0 ] && ok "no drift to start with" || bad "drift at the start"

# a venue 198 made after the last 221 (not in the map yet) must keep its id too
run198 "Q3,Q6,Q7,Q8,Q9"
Q9="$(psql_ -c "select venue_id from core.venue where source_key = 'Q9'")"

# ---------------------------------------------------------------- rerun: 176 deletes the unreferenced ones (Q7, Q8, Q9), 198 adds them again
run176 "Q1,Q2,Q3,Q4" "Q1,Q2,Q3"
GONE="$(psql_ -c "select count(*) from core.venue where source_key in ('Q7', 'Q8', 'Q9')")"
[ "$GONE" = 0 ] && ok "176 deleted the venues nothing points at (Q7, Q8, Q9)" || bad "176 kept $GONE of them"
[ "$(psql_ -c "select count(*) from ingest.row_id_map where tbl = 'core.venue' and natural_key in ('3/Q7', '3/Q8', '3/Q9')")" = 3 ] && ok "176 remembered the ids it deleted (Q9 was not in the map before)" || bad "map after 176"
run198 "Q3,Q6,Q7,Q8,Q9"
B="$(ids)"
[ "$(psql_ -c "select venue_id from core.venue where source_key = 'Q9'")" = "$Q9" ] && ok "a venue added after the last 221 comes back on its id" || bad "Q9 changed id"
echo "$B" | grep -q 'Q9=' && A9="$A Q9=$Q9" || A9="$A"
[ "$B" = "$A9" ] && ok "a rerun of 176 then 198 keeps every venue id" || bad "ids changed on a rerun: before [$A9] after [$B]"
[ "$(drift)" = 0 ] && ok "check 093 stays at 0 after the rerun" || bad "drift after the rerun: $(drift)"
run176 "Q1,Q2,Q3,Q4" "Q1,Q2,Q3"; run198 "Q3,Q6,Q7,Q8,Q9"
[ "$(ids)" = "$B" ] && ok "a second rerun changes nothing" || bad "second rerun changed ids"
[ "$(signature)" = "$SIG0" ] && ok "references still point at the same venues" || bad "references changed"
# a place Wikidata no longer gives a home (Q2 leaves venue_new) is deleted only when nothing points at it: Q2 has periods, so it stays
run176 "Q1,Q3,Q4" "Q1,Q3"
[ "$(psql_ -c "select count(*) from core.venue where source_key = 'Q2'")" = 1 ] && ok "a venue something points at is not deleted" || bad "Q2 deleted"
run198 "Q3,Q6,Q7,Q8,Q9"
[ "$(ids)" = "$B" ] && ok "and 198 after it still leaves every id as it was" || bad "ids after the Q2 run: $(ids)"

# ---------------------------------------------------------------- the repair: simulate what the old steps did (new ids, references moved), with a pair that swap
psql_ -o /dev/null <<'SQL'
create temp table drift_to (source_key text, new_id int);
insert into drift_to values ('Q6', 900), ('Q7', 901), ('Q9', 902), ('Q1', 0), ('Q2', 0);
-- Q1 and Q2 swap ids; the others move to ids far above
update drift_to set new_id = (select venue_id from core.venue where source_key = 'Q2') where source_key = 'Q1';
update drift_to set new_id = (select venue_id from core.venue where source_key = 'Q1') where source_key = 'Q2';
create temp table mv as select v.venue_id as old_id, d.new_id from drift_to d join core.venue v using (source_key);
set session_replication_role = replica;
alter table core.venue alter column venue_id set generated by default;
update core.venue set venue_id = -venue_id where venue_id in (select old_id from mv);
update core.venue_name x set venue_id = -venue_id where venue_id in (select old_id from mv);
update core.venue_feature x set venue_id = -venue_id where venue_id in (select old_id from mv);
update core.franchise_venue x set venue_id = -venue_id where venue_id in (select old_id from mv);
update core.franchise_home_venue x set venue_id = -venue_id where venue_id in (select old_id from mv);
update core.game x set venue_id = -venue_id where venue_id in (select old_id from mv);
update core.game_venue x set venue_id = -venue_id where venue_id in (select old_id from mv);
update core.team_season x set home_venue_id = -home_venue_id where home_venue_id in (select old_id from mv);
update core.soccer_match x set venue_id = -venue_id where venue_id in (select old_id from mv);
update core.venue_game_season x set venue_id = -venue_id where venue_id in (select old_id from mv);
update core.venue_final_game x set venue_id = -venue_id where venue_id in (select old_id from mv);
update legacy_game_venue.filled x set venue_id = -venue_id where venue_id in (select old_id from mv);
update legacy_game_venue.home_prelim x set venue_id = -venue_id where venue_id in (select old_id from mv);
update core.venue set venue_id = mv.new_id from mv where venue_id = -mv.old_id;
update core.venue_name set venue_id = mv.new_id from mv where venue_id = -mv.old_id;
update core.venue_feature set venue_id = mv.new_id from mv where venue_id = -mv.old_id;
update core.franchise_venue set venue_id = mv.new_id from mv where venue_id = -mv.old_id;
update core.franchise_home_venue set venue_id = mv.new_id from mv where venue_id = -mv.old_id;
update core.game set venue_id = mv.new_id from mv where venue_id = -mv.old_id;
update core.game_venue set venue_id = mv.new_id from mv where venue_id = -mv.old_id;
update core.team_season set home_venue_id = mv.new_id from mv where home_venue_id = -mv.old_id;
update core.soccer_match set venue_id = mv.new_id from mv where venue_id = -mv.old_id;
update core.venue_game_season set venue_id = mv.new_id from mv where venue_id = -mv.old_id;
update core.venue_final_game set venue_id = mv.new_id from mv where venue_id = -mv.old_id;
update legacy_game_venue.filled set venue_id = mv.new_id from mv where venue_id = -mv.old_id;
update legacy_game_venue.home_prelim set venue_id = mv.new_id from mv where venue_id = -mv.old_id;
alter table core.venue alter column venue_id set generated always;
SQL
[ "$(drift)" = 5 ] && ok "setup: five venues are off their remembered ids (two of them swapped)" || bad "setup drift: $(drift)"
SIGD="$(signature)"
[ "$SIGD" = "$SIG0" ] || { echo "$SIGD"; echo "$SIG0"; }   # the references moved with their venues, so this holds before and after

run_repair() { { echo 'begin;'; cat "$REPAIR"; echo 'commit;'; } | psql_ 2>&1; }

# an unknown column that holds a venue id stops it with nothing changed
psql_ -c "create table core.zz_unknown (x int, venue_id int)" -o /dev/null
if OUT="$(run_repair)"; then bad "the repair ran with an unhandled venue_id column"; else echo "$OUT" | grep -q 'not handled by this file: core.zz_unknown.venue_id' && ok "an unhandled venue_id column stops the repair" || bad "wrong stop: $OUT"; fi
[ "$(drift)" = 5 ] && ok "a stopped repair changes nothing" || bad "the stopped repair changed ids"
psql_ -c "drop table core.zz_unknown" -o /dev/null

# an old id held by another venue (not itself being renumbered) stops it
psql_ -o /dev/null <<'SQL'
insert into core.venue (city, country_code, source_id, source_key) values ('X', 'US', 3, 'QX');
SQL
HOLD="$(psql_ -c "select row_id from ingest.row_id_map where natural_key = '3/Q6'")"
psql_ -o /dev/null -c "set session_replication_role = replica; alter table core.venue alter column venue_id set generated by default; update core.venue set venue_id = $HOLD where source_key = 'QX'; alter table core.venue alter column venue_id set generated always"
if OUT="$(run_repair)"; then bad "the repair ran with an old id held by another venue"; else echo "$OUT" | grep -q 'not being renumbered' && ok "an old id held by another venue stops the repair" || bad "wrong stop: $OUT"; fi
psql_ -o /dev/null -c "set session_replication_role = replica; delete from core.venue where source_key = 'QX'"

OUT="$(run_repair)" || { echo "$OUT"; bad "the repair failed"; }
[ "$(drift)" = 0 ] && ok "after the repair check 093 returns 0 rows" || bad "drift after the repair: $(drift)"
[ "$(ids)" = "$B" ] && ok "every venue is back on the id it had before" || bad "ids after the repair: $(ids)"
[ "$(signature)" = "$SIG0" ] && ok "every table that holds a venue id follows (names, periods, games, team seasons, matches, summaries, legacy tables)" || bad "references after the repair: $(signature)"
[ "$(psql_ -c 'select count(*) from core.venue where venue_id < 0')" = 0 ] && ok "no venue is left on a negative id" || bad "negative ids left"
echo "$OUT" | grep -q 'core.venue pass 1: 5 rows' && ok "it reports the five venues" || bad "report: $OUT"
OUT2="$(run_repair)"; echo "$OUT2" | grep -q 'nothing to repair' && ok "a second run has nothing to do" || bad "second run: $OUT2"
[ "$(psql_ -c "select attidentity from pg_attribute where attrelid = 'core.venue'::regclass and attname = 'venue_id'")" = a ] && ok "venue_id is GENERATED ALWAYS again" || bad "identity not restored"
[ "$(psql_ -c "select count(*) from pg_constraint where confrelid = 'core.venue'::regclass and convalidated")" -ge 8 ] && ok "foreign keys to core.venue are in place" || bad "foreign keys missing"

echo
echo "passed $pass, failed $fail"
[ "$fail" = 0 ]

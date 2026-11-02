#!/bin/bash
# A game that is final must not go back to scheduled when a build step is rerun (SPX-831).
#
# The bug: db/build/145 (NHL) updated its own games in place from legacy_nhlapi, and db/build/150 (NFL) deleted and re-added its own games from
# legacy_nflverse. Both files can be older than a result the daily job reported later (ingest.report_results), so a rerun set finished games back to
# scheduled (67 NHL games on 2026-10-18). db/build/153 replays the daily log and puts them back, but nothing ran it and nothing noticed.
# This test, on a scratch Postgres built from the real migrations (db/migrations/*.sql in order), shows
#   1. the OLD steps (the commit before the fix, OLD_REF) reset a daily-final game, and db/checks/107 returns that game;
#   2. 153 restores it and 107 returns nothing again;
#   3. the NEW steps (the working tree) keep it final, change no id and a second rerun changes nothing;
#   4. a legitimate correction still lands: a game the API/nflverse now calls final, and a different final score from the file.
# The SQL under test is the real step files and the real check file; only the data is a small fixture (two clubs per league, three games each).
#   bash db/tests/final-games.sh          # port 7741, name spx-scratch-finalgames; exit 0 when every line is ok
#   OLD_REF=<sha> bash ...                # another commit as the "before" (default: the commit before the fix)
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="${SCRATCH_NAME:-spx-scratch-finalgames}"
PORT="${SCRATCH_PORT:-7741}"
OLD_REF="${OLD_REF:-22517554}"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && { echo "port $PORT is busy"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is not running"; exit 1; }
T="$(mktemp -d)"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$T"; }
trap cleanup EXIT
pass=0 fail=0
ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; }
expect() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (wanted: $3; got: $2)"; fi; }

for f in 145_nhl_from_nhlapi 150_nfl_from_nflverse; do
  git -C "$REPO" show "$OLD_REF:db/build/$f.sql" > "$T/old_$f.sql" 2>/dev/null || { echo "cannot read db/build/$f.sql at $OLD_REF (fetch more history, or set OLD_REF)"; exit 1; }
  cp "$REPO/db/build/$f.sql" "$T/new_$f.sql"
done
# the old 150 passes a bigint to ingest.identity_id_for(integer, date), which fails on a schema built from the migrations; the fix commit casts it,
# so the "before" gets the same cast and differs from the fix in the game status only
sed -i.bak 's/e\.entity_id as franchise_id/e.entity_id::integer as franchise_id/' "$T/old_150_nfl_from_nflverse.sql"
cp "$REPO/db/build/153_replay_daily_observations.sql" "$T/153.sql"

docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
docker exec "$NAME" mkdir -p /work
docker cp "$T/." "$NAME:/work/"
psql_() { docker exec -i -w /work "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }

echo "building the scratch schema from db/migrations (about a minute)"
psql_ -o /dev/null -c "create role anon nologin; create role authenticated nologin; create extension if not exists btree_gist; create extension if not exists pg_trgm; create extension if not exists unaccent;"
# files marked "PRODUCTION ONLY" take objects off production (131 drops core.external_id): not for a copy of DS1
for f in "$REPO"/db/migrations/*.sql; do head -3 "$f" | grep -q 'PRODUCTION ONLY' && continue; cat "$f"; echo; done > "$T/all.sql"
docker cp "$T/all.sql" "$NAME:/work/all.sql"
errs="$(docker exec -i -w /work "$NAME" psql -U postgres -d spx -X -q -f all.sql 2>&1 >/dev/null | grep -c 'ERROR' || true)"
[ "$(psql_ -c "select to_regprocedure('ingest.replay(boolean,boolean)') is not null and to_regclass('ingest.game_retired') is not null and to_regclass('legacy_nhlapi.game') is not null")" = "t" ] \
  || { echo "the migrations did not build the schema (errors: $errs)"; exit 1; }

# ------------------------------------------------------------------------------------------------ fixture
psql_ -o /dev/null <<'SQL'
insert into ref.sport (sport_code, name) select x, x from unnest(array['hockey', 'football']) x on conflict do nothing;
insert into ref.league (league_code, sport_code) values ('nhl', 'hockey'), ('nfl', 'football');
insert into ref.country (country_code, name) values ('CA', 'Canada'), ('US', 'United States') on conflict do nothing;
insert into meta.source (code, name, kind) values ('spx_database', 'SPX', 'dataset'), ('wikipedia_daily', 'Wikipedia (daily scores)', 'website');
insert into core.franchise (sport_code, source_id, source_key)
select s, (select source_id from meta.source where code = 'spx_database'), k
from (values ('hockey', '14'), ('hockey', '26'), ('football', '147'), ('football', '146')) v(s, k);
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'franchise', franchise_id, source_id, 'team:' || source_key from core.franchise;

-- the NHL API's file: game 1 final, game 2 still reads scheduled (the file is old), game 3 scheduled
insert into legacy_nhlapi.game (nhl_game_id, season, game_type, game_date, away_abbrev, home_abbrev, away_score, home_score, last_period_type, game_state, row)
select id, '20262027', 2, d::date, aw, hm, a, h, case when st = 'OFF' then 'REG' end, st,
       jsonb_build_object('startTimeUTC', d || 'T23:00:00Z', 'gameScheduleState', 'OK',
         'homeTeam', jsonb_build_object('placeName', jsonb_build_object('default', hl), 'commonName', jsonb_build_object('default', hn)),
         'awayTeam', jsonb_build_object('placeName', jsonb_build_object('default', al), 'commonName', jsonb_build_object('default', an)))
from (values (2026020001, '2026-10-08', 'TOR', 'MTL', 2, 3, 'OFF', 'Montreal', 'Canadiens', 'Toronto', 'Maple Leafs'),
             (2026020002, '2026-10-10', 'MTL', 'TOR', null::int, null::int, 'FUT', 'Toronto', 'Maple Leafs', 'Montreal', 'Canadiens'),
             (2026020003, '2026-10-12', 'TOR', 'MTL', null, null, 'FUT', 'Montreal', 'Canadiens', 'Toronto', 'Maple Leafs')) v(id, d, aw, hm, a, h, st, hl, hn, al, an);

-- nflverse's file: game 1 final, game 2 has no result yet (the file is old), game 3 none
insert into legacy_nflverse.team (season, team, full_name, location, nickname, row)
select y, t, l || ' ' || n, l, n, '{}'::jsonb from generate_series(2002, 2026) y,
  (values ('NYG', 'New York', 'Giants'), ('DAL', 'Dallas', 'Cowboys')) v(t, l, n);
insert into legacy_nflverse.game (game_id, season, game_type, week, gameday, away_team, away_score, home_team, home_score, location, overtime, row)
values ('2026_01_DAL_NYG', 2026, 'REG', 1, '2026-09-10', 'DAL', 17, 'NYG', 20, 'Home', false, '{}'),
       ('2026_02_NYG_DAL', 2026, 'REG', 2, '2026-09-17', 'NYG', null, 'DAL', null, 'Home', null, '{}'),
       ('2026_03_DAL_NYG', 2026, 'REG', 3, '2026-09-24', 'DAL', null, 'NYG', null, 'Home', null, '{}');

create function public.snap(p_league text) returns text language sql as $$
  select string_agg(g.source_key || '#' || g.game_id || '=' || g.status || ' ' || coalesce(g.home_score::text, '-') || '-' || coalesce(g.away_score::text, '-')
                    || ' ' || g.game_date || ' ' || coalesce(g.original_date::text, ''), ' ; ' order by g.source_key)
  from core.game g join core.season s using (season_id) where s.league_code = p_league and g.source_key like case p_league when 'nhl' then 'nhlapi:%' else 'nflverse:%' end $$;
create function public.status_of(p_league text, p_key text) returns text language sql as $$
  select g.status || ' ' || coalesce(g.home_score::text, '-') || '-' || coalesce(g.away_score::text, '-')
  from core.game g join core.season s using (season_id) where s.league_code = p_league and g.source_key = p_key $$;
create function public.report_final(p_league text, p_date date, p_home text, p_away text, p_hs int, p_as int) returns jsonb language sql as $$
  select ingest.report_results(jsonb_build_array(jsonb_build_object(
    'game_ref', 'test:' || p_league || ':' || p_date, 'league', p_league, 'season', 2026, 'phase', 'regular', 'game_date', p_date, 'game_no', 0,
    'home_key', 'spx_database:' || p_home, 'away_key', 'spx_database:' || p_away, 'home_name', p_home, 'away_name', p_away, 'status', 'final',
    'home_score', p_hs, 'away_score', p_as, 'verdict', 'confirmed', 'source', 'wikipedia', 'ref', 'page@1',
    'agree', jsonb_build_array('page@1'), 'dissent', '[]'::jsonb))) $$;
SQL

# the check, run the way scripts/release/release.py runs it: the file without its comment lines, inside a "with q as (...)"
CHECK="$(grep -v '^[[:space:]]*--' "$REPO/db/checks/107_final_game_not_final.sql" | sed -e 's/;[[:space:]]*$//')"
check107() { psql_ -c "with q as ($CHECK) select count(*) from q"; }
check107_rows() { psql_ -c "with q as ($CHECK) select string_agg(league || ' ' || game_date || ' ' || core_status, ', ') from q"; }
run() { psql_ -o /dev/null -f "/work/$1"; }
nhl_ids() { psql_ -c "select string_agg(game_id::text, ',' order by game_id) from core.game where source_key like 'nhlapi:%'"; }
nfl_ids() { psql_ -c "select string_agg(game_id::text, ',' order by game_id) from core.game where source_key like 'nflverse:%'"; }

# ------------------------------------------------------------------------------------------------ NHL, step 145
echo "NHL, db/build/145"
run "old_145_nhl_from_nhlapi.sql"
expect "first build: 3 API games" "$(psql_ -c "select count(*) from core.game where source_key like 'nhlapi:%'")" "3"
expect "game 1 is final from the file" "$(psql_ -c "select status_of('nhl', 'nhlapi:2026020001')")" "final 3-2"
expect "game 2 is scheduled (the file is old)" "$(psql_ -c "select status_of('nhl', 'nhlapi:2026020002')")" "scheduled ---"
psql_ -o /dev/null -c "select report_final('nhl', date '2026-10-10', '26', '14', 4, 1)"
expect "the daily job finals game 2 (home 26 Toronto 4, away 14 Montreal 1)" "$(psql_ -c "select status_of('nhl', 'nhlapi:2026020002')")" "final 4-1"
expect "check 107 is empty before any rerun" "$(check107)" "0"
IDS_NHL="$(nhl_ids)"

run "old_145_nhl_from_nhlapi.sql"
expect "OLD 145 rerun resets the daily-final game (the bug)" "$(psql_ -c "select status_of('nhl', 'nhlapi:2026020002')")" "scheduled ---"
expect "check 107 returns that game" "$(check107_rows)" "nhl 2026-10-10 scheduled"
run "153.sql"
expect "153 restores it" "$(psql_ -c "select status_of('nhl', 'nhlapi:2026020002')")" "final 4-1"
expect "check 107 is empty after 153" "$(check107)" "0"

run "new_145_nhl_from_nhlapi.sql"
expect "NEW 145 rerun keeps the daily-final game final" "$(psql_ -c "select status_of('nhl', 'nhlapi:2026020002')")" "final 4-1"
expect "NEW 145: check 107 empty" "$(check107)" "0"
expect "NEW 145: game ids unchanged" "$(nhl_ids)" "$IDS_NHL"
SNAP_NHL="$(psql_ -c "select snap('nhl')")"
run "new_145_nhl_from_nhlapi.sql"
expect "NEW 145 second rerun changes nothing (ids, status, scores, dates)" "$(psql_ -c "select snap('nhl')")" "$SNAP_NHL"
expect "game 3 is still scheduled" "$(psql_ -c "select status_of('nhl', 'nhlapi:2026020003')")" "scheduled ---"

# legitimate corrections still land
psql_ -o /dev/null -c "update legacy_nhlapi.game set game_state = 'OFF', home_score = 5, away_score = 4, last_period_type = 'OT' where nhl_game_id = 2026020003;
                        update legacy_nhlapi.game set home_score = 4, away_score = 2 where nhl_game_id = 2026020001"
run "new_145_nhl_from_nhlapi.sql"
expect "a game the file now calls final becomes final" "$(psql_ -c "select status_of('nhl', 'nhlapi:2026020003')")" "final 5-4"
expect "a different final score from the file corrects a final game" "$(psql_ -c "select status_of('nhl', 'nhlapi:2026020001')")" "final 4-2"
expect "the daily-final game is still final" "$(psql_ -c "select status_of('nhl', 'nhlapi:2026020002')")" "final 4-1"
expect "check 107 still empty" "$(check107)" "0"

# ------------------------------------------------------------------------------------------------ NFL, step 150
echo "NFL, db/build/150"
run "old_150_nfl_from_nflverse.sql"
expect "first build: 3 nflverse games" "$(psql_ -c "select count(*) from core.game where source_key like 'nflverse:%'")" "3"
expect "game 1 is final from the file" "$(psql_ -c "select status_of('nfl', 'nflverse:2026_01_DAL_NYG')")" "final 20-17"
expect "game 2 is scheduled (the file is old)" "$(psql_ -c "select status_of('nfl', 'nflverse:2026_02_NYG_DAL')")" "scheduled ---"
psql_ -o /dev/null -c "select report_final('nfl', date '2026-09-17', '146', '147', 24, 21)"
expect "the daily job finals game 2" "$(psql_ -c "select status_of('nfl', 'nflverse:2026_02_NYG_DAL')")" "final 24-21"
expect "check 107 empty before any rerun" "$(check107)" "0"
IDS_NFL="$(nfl_ids)"

run "old_150_nfl_from_nflverse.sql"
expect "OLD 150 rerun resets the daily-final game (the bug)" "$(psql_ -c "select status_of('nfl', 'nflverse:2026_02_NYG_DAL')")" "scheduled ---"
expect "check 107 returns that game" "$(check107_rows)" "nfl 2026-09-17 scheduled"
expect "OLD 150 kept the ids" "$(nfl_ids)" "$IDS_NFL"
run "153.sql"
expect "153 restores it" "$(psql_ -c "select status_of('nfl', 'nflverse:2026_02_NYG_DAL')")" "final 24-21"
expect "check 107 empty after 153" "$(check107)" "0"

run "new_150_nfl_from_nflverse.sql"
expect "NEW 150 rerun keeps the daily-final game final" "$(psql_ -c "select status_of('nfl', 'nflverse:2026_02_NYG_DAL')")" "final 24-21"
expect "NEW 150: check 107 empty" "$(check107)" "0"
expect "NEW 150: game ids unchanged" "$(nfl_ids)" "$IDS_NFL"
SNAP_NFL="$(psql_ -c "select snap('nfl')")"
run "new_150_nfl_from_nflverse.sql"
expect "NEW 150 second rerun changes nothing" "$(psql_ -c "select snap('nfl')")" "$SNAP_NFL"
expect "game 3 is still scheduled" "$(psql_ -c "select status_of('nfl', 'nflverse:2026_03_DAL_NYG')")" "scheduled ---"
psql_ -o /dev/null -c "update legacy_nflverse.game set home_score = 13, away_score = 10 where game_id = '2026_03_DAL_NYG';
                        update legacy_nflverse.game set home_score = 27, away_score = 21 where game_id = '2026_01_DAL_NYG'"
run "new_150_nfl_from_nflverse.sql"
expect "a game nflverse now has a result for becomes final" "$(psql_ -c "select status_of('nfl', 'nflverse:2026_03_DAL_NYG')")" "final 13-10"
expect "a different final score from nflverse corrects a final game" "$(psql_ -c "select status_of('nfl', 'nflverse:2026_01_DAL_NYG')")" "final 27-21"
expect "the daily-final game is still final" "$(psql_ -c "select status_of('nfl', 'nflverse:2026_02_NYG_DAL')")" "final 24-21"
expect "check 107 still empty" "$(check107)" "0"

# ------------------------------------------------------------------------------------------------ the check itself
echo "check 107"
psql_ -o /dev/null -c "update core.game set status = 'scheduled', home_score = null, away_score = null where source_key = 'nhlapi:2026020002'"
expect "a final that went back to scheduled is flagged" "$(check107)" "1"
psql_ -o /dev/null -c "update ingest.game_observation set verdict = 'disputed' where game_ref = 'test:nhl:2026-10-10'"
expect "a disputed final is not flagged" "$(check107)" "0"
psql_ -o /dev/null -c "update ingest.game_observation set verdict = 'confirmed' where game_ref = 'test:nhl:2026-10-10'"
expect "restored: flagged again" "$(check107)" "1"
psql_ -o /dev/null -c "insert into ingest.game_retired (game_ref, league, season, game_date, reason) values ('test:nhl:2026-10-10', 'nhl', 2026, '2026-10-10', 'test')"
expect "a retired game is not flagged" "$(check107)" "0"

echo
if [ "$fail" = 0 ]; then echo "RESULT: ALL $pass CHECKS PASSED"; else echo "RESULT: $fail FAILED, $pass passed"; exit 1; fi

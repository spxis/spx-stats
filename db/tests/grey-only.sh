#!/bin/bash
# Migration 153 (meta.source.tier, api.grey_only_rows), build step 225 (tier from the registry) and db/review/grey_only_rows.sql: a row counts only
# when a grey source holds it and no non-grey source confirmed it; the view and the review query agree; step 225 and a rerun of it change nothing the
# second time; anon can read the view. Scratch Postgres with a small hand-made schema, removed by name.
#   bash db/tests/grey-only.sh            # port 7743, name spx-scratch-greyonly
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="${SCRATCH_NAME:-spx-scratch-greyonly}"
PORT="${SCRATCH_PORT:-7743}"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && { echo "port $PORT is busy"; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker info >/dev/null 2>&1 || { echo "Docker is not running"; exit 1; }
pass=0 fail=0
ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi; }

docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx \
  -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
psql_() { docker exec -i "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }

psql_ -o /dev/null <<'SQL'
create role anon nologin; create role authenticated nologin;
create schema meta; create schema core; create schema api;
create table meta.source (source_id smallint generated always as identity primary key, code text not null unique, name text not null default '', kind text, licence text, attribution text, url text);
create table meta.verification (entity_kind text, entity_id bigint, status text, source_id smallint);
create table core.game (game_id bigint primary key, source_id smallint, source_key text, game_date date);
create table core.team_season (team_season_id int primary key, source_id smallint);
create table core.season (season_id int primary key, source_id smallint, league_code text, start_year int);
create table core.person (person_id bigint primary key, source_id smallint, full_name text, birth_date date);
create table core.venue (venue_id int primary key, source_id smallint, city text, opened_on date);
create table core.franchise (franchise_id int primary key, source_id smallint, founded_on date);
grant usage on schema api to anon;
insert into meta.source (code) values ('wikipedia'), ('wikipedia_daily'), ('wnba_stats'), ('fangraphs'), ('spx_database');
SQL
psql_ -o /dev/null < "$REPO/db/migrations/153_source_tier.sql"
psql_ -o /dev/null < "$REPO/db/build/225_source_tier.sql"

tier() { psql_ -c "select tier from meta.source where code = '$1'"; }
eq "225 sets grey on a grey source" "$(tier wnba_stats)" grey
eq "225 sets green on wikipedia" "$(tier wikipedia)" green
eq "225 reaches the other wikipedia code" "$(tier wikipedia_daily)" green
eq "225 leaves an unclassified source null" "$(tier spx_database)" ""
eq "225 writes the evidence link" "$(psql_ -c "select evidence_url from meta.source where code = 'wnba_stats'")" "https://www.wnba.com/terms-of-use"

eq "the view is empty while no grey data is loaded" "$(psql_ -c 'select count(*) from api.grey_only_rows')" 0

psql_ -o /dev/null <<'SQL'
-- wnba_stats (id 3) holds games 1-4 and a person; fangraphs (id 4) holds game 5; wikipedia (id 1) holds game 6
insert into core.game values (1, 3, 'a', '2025-05-01'), (2, 3, 'b', '2025-05-02'), (3, 3, 'c', '2025-05-03'), (4, 3, 'd', '2025-05-04'), (5, 4, 'e', '2025-05-05'), (6, 1, 'f', '2025-05-06');
insert into core.person values (10, 3, 'A Player', null);
-- game 1 confirmed by wikipedia (counts no more); game 2 "confirmed" only by another grey source (still counts); game 3 disputed by wikipedia (counts); game 4 confirmed by a person-kind line of the same id (other kind: counts)
insert into meta.verification values ('game', 1, 'confirmed', 1), ('game', 2, 'confirmed', 4), ('game', 3, 'disputed', 1), ('person', 4, 'confirmed', 1);
SQL
view="$(psql_ -F, -c 'select source, entity_kind, n_rows from api.grey_only_rows order by 1, 2')"
eq "grey-only rows per source and kind" "$view" $'fangraphs,game,1\nwnba_stats,game,3\nwnba_stats,person,1'
review="$(grep -v '^--' "$REPO/db/review/grey_only_rows.sql")"
eq "the review query lists the same rows" "$(psql_ -F, -c "$review" | cut -d, -f1,2,3 | tr '\n' ' ')" "fangraphs,game,5 wnba_stats,game,2 wnba_stats,game,3 wnba_stats,game,4 wnba_stats,person,10 "
psql_ -o /dev/null -c "insert into meta.verification values ('game', 3, 'confirmed', 1)"
eq "a confirmation from a green source takes the row off the list" "$(psql_ -c "select n_rows from api.grey_only_rows where source = 'wnba_stats' and entity_kind = 'game'")" 2
eq "anon can read the view" "$(psql_ -c "set role anon; select count(*) from api.grey_only_rows")" "$(psql_ -c "select count(*) from api.grey_only_rows")"

before="$(psql_ -c "select md5(string_agg(code || coalesce(tier, '') || coalesce(terms_note, '') || coalesce(evidence_url, ''), '|' order by code)) from meta.source")"
psql_ -o /dev/null < "$REPO/db/build/225_source_tier.sql"
eq "a rerun of 225 changes nothing" "$(psql_ -c "select md5(string_agg(code || coalesce(tier, '') || coalesce(terms_note, '') || coalesce(evidence_url, ''), '|' order by code)) from meta.source")" "$before"
psql_ -o /dev/null < "$REPO/db/migrations/153_source_tier.sql"
ok "a rerun of 153 runs clean"

# scripts/grey: migration 154 and the load files of the three parsers, applied twice (a rerun replaces each game by its key and adds none)
S="$(mktemp -d)"
python3 -I "$REPO/scripts/grey/cfbd.py" parse "$REPO/scripts/grey/samples/cfbd_games.json" --year 2024 --fetched-on 2026-10-25 --out "$S/cfbd.sql" >/dev/null
python3 -I "$REPO/scripts/grey/hockeytech.py" parse "$REPO/scripts/grey/samples/hockeytech_schedule.json" --client ahl --fetched-on 2026-10-25 --out "$S/ht.sql" >/dev/null
python3 -I "$REPO/scripts/grey/wnba.py" parse "$REPO/scripts/grey/samples/wnba_leaguegamelog.json" --fetched-on 2026-10-25 --out "$S/wnba.sql" >/dev/null
psql_ -o /dev/null < "$REPO/db/migrations/154_legacy_grey_sources.sql"
psql_ -o /dev/null < "$REPO/db/migrations/154_legacy_grey_sources.sql"
for f in cfbd ht wnba cfbd ht wnba; do psql_ -o /dev/null < "$S/$f.sql"; done
eq "154: the three sources have a tier" "$(psql_ -c "select string_agg(code || '=' || tier, ',' order by code) from meta.source where code in ('cfbd', 'hockeytech', 'wnba_stats')")" "cfbd=green,hockeytech=grey,wnba_stats=grey"
eq "load: games after two runs" "$(psql_ -c "select (select count(*) from legacy_cfbd.game) || ',' || (select count(*) from legacy_hockeytech.game) || ',' || (select count(*) from legacy_wnba_stats.game)")" "2,2,1"
eq "load: a quoted venue survives" "$(psql_ -c "select venue from legacy_cfbd.game where game_id is not null and venue like 'O%'")" "O'Brien Field"
rm -rf "$S"

echo "$pass ok, $fail failed"
[ "$fail" = 0 ]

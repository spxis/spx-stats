#!/bin/bash
# db/build/235_game_field_mlb.sql and 236_game_field_nfl.sql on a scratch Postgres with the real schema (every migration applied) and a few hand-made rows
# (db/tests/game-field-fixture.sql): the rows are written in the format web/src/lib/fieldPlays.ts reads, games are found by Retrosheet's id and by nflverse's,
# a person is found through Retrosheet's id or Lahman's retroID, unlocated balls and all-star games are left out, and a rerun changes nothing (the same rows,
# no game renumbered); a game that loses its balls loses its row, and the other kind's rows are never touched.
#   bash db/tests/game-field.sh            # port 7741, name spx-scratch-game-field
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="${SCRATCH_NAME:-spx-scratch-game-field}"
PORT="${SCRATCH_PORT:-7741}"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && { echo "port $PORT is busy"; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker info >/dev/null 2>&1 || { echo "Docker is not running"; exit 1; }
pass=0 fail=0
ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi; }

docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx_stats -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
sleep 2
D() { docker exec -i "$NAME" psql -U postgres -d spx_stats -X -q "$@"; }
H() { psql -h 127.0.0.1 -p "$PORT" -U postgres -d spx_stats -X -q -t -A -v ON_ERROR_STOP=1 "$@"; }
D -c "create role anon nologin; create role authenticated nologin; create role ingest_writer nologin; create role service_role nologin; create extension if not exists btree_gist; create extension if not exists pg_trgm; create extension if not exists unaccent; create schema if not exists api;" >/dev/null
for f in $(ls "$REPO"/db/migrations/*.sql | sort); do
  case "$f" in *131_drop_turso_tables_production.sql|*149_stat_reference_rls.sql) continue;; esac
  D -v ON_ERROR_STOP=1 < "$f" >/dev/null 2>&1 || { echo "migration $f failed"; exit 1; }
done
ok "every migration applies"
H -f "$HERE/game-field-fixture.sql" >/dev/null
MLB() { (cd "$REPO" && H -1 -f db/build/235_game_field_mlb.sql >/dev/null); }
NFL() { (cd "$REPO" && H -1 -f db/build/236_game_field_nfl.sql >/dev/null); }
SNAP() { H -c "select game_id, kind, season, n, md5(data) from core.game_field order by 1, 2; select data_issue_id, entity_kind, entity_key from meta.data_issue where entity_kind like 'game_field%' order by 1"; }

MLB; NFL
eq "one row for each game that has located balls, and each NFL game with drives" "$(H -c "select count(*) from core.game_field")" "6"
eq "the regular game's balls, in order, with the unlocated ball left out" "$(H -c "select data from core.game_field where game_id = 9001")" "1,0,8D,F,o,501;1,0,78,L,s,502;1,1,7LD,F,h,"
eq "its counts" "$(H -c "select n || '/' || season from core.game_field where game_id = 9001")" "3/2025"
eq "the doubleheader's second game is found by its number" "$(H -c "select data from core.game_field where game_id = 9002")" "1,0,9LD,L,d,501"
eq "a postseason game is found by its type-free key" "$(H -c "select data from core.game_field where game_id = 9003")" "3,1,1S,BG,f,502"
eq "an SPX game of the seasons SPX holds is found through the external id db/build/140 gave it" "$(H -c "select data from core.game_field where game_id = 9005")" "1,0,56,G,s,501"
eq "so is an SPX NFL game, through the nflverse id db/build/150 gave it" "$(H -c "select data from core.game_field where game_id = 9103")" "1,0,1,15:00,P,70,60,3,1,100,0,70 65 60"
eq "a Retrosheet game no core game has is logged once, not drawn" "$(H -c "select entity_kind || ':' || entity_key || ':' || resolution from meta.data_issue where entity_kind = 'game_field_mlb'")" "game_field_mlb:XXX202504100:Balls not drawn"
eq "an nflverse game no core game has is logged once, not drawn" "$(H -c "select entity_kind || ':' || entity_key from meta.data_issue where entity_kind = 'game_field_nfl'")" "game_field_nfl:2023_01_XXX_YYY"
eq "a game with no located ball has no row" "$(H -c "select count(*) from core.game_field where game_id = 9004")" "0"
eq "an all-star game is not drawn" "$(H -c "select count(*) from core.game_field where data like '%,8,F,o%'")" "0"
eq "the drives of the NFL game, in order" "$(H -c "select data from core.game_field where game_id = 9101")" "1,0,1,15:00,F,70,4,10,2,259,1,70 62 50 49 43 43 6 4 4 4;2,1,1,10:41,T,70,0,16,5,510,1,70 69 58 53 44 35 26 20 12 6 6 3 2 2 2 1;3,0,1,02:11,P,81,72,3,0,103,0,81 81 75 72;4,1,2,12:00,?,60,55,3,0,60,,60 58 55"
eq "a game nflverse has but core does not is left out" "$(H -c "select count(*) from core.game_field where kind = 'nfl_drives' and game_id not in (9101, 9103)")" "0"
eq "the api view serves the rows" "$(H -c "select count(*) from api.game_field")" "6"
eq "the view works as anon" "$(D -t -A -c "set role anon; select count(*) from api.game_field" | head -1)" "6"

A="$(SNAP)"; MLB; NFL; B="$(SNAP)"
eq "a rerun changes nothing" "$A" "$B"
H -c "update core.game_field set data = 'x' where game_id = 9101" >/dev/null; NFL
eq "a changed row is written back in place" "$(H -c "select left(data, 14) from core.game_field where game_id = 9101")" "1,0,1,15:00,F,"
H -c "delete from legacy_retrosheet.batted_ball where game_id = 'BAL202510010'" >/dev/null; MLB
eq "a rerun keeps the logged issues' ids" "$(H -c "select count(*) from meta.data_issue where entity_kind like 'game_field%'")" "2"
eq "a game that loses its balls loses its row" "$(H -c "select count(*) from core.game_field where game_id = 9003")" "0"
eq "and the other rows stay" "$(H -c "select count(*) from core.game_field")" "5"
H -c "delete from legacy_nflverse.pbp_drive" >/dev/null; NFL
eq "the NFL step deletes only its own kind" "$(H -c "select string_agg(kind || count, ',' order by kind) from (select kind, count(*) from core.game_field group by 1) q")" "mlb_balls3"
printf '%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" = 0 ]

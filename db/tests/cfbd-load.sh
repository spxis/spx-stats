#!/bin/bash
# Migration 157 and scripts/grey/cfbd_load.py: the load files for every legacy_cfbd table apply on a scratch Postgres, load the expected counts, keep quotes, tabs
# and nulls, and a second run changes nothing. Raw input: the small hand-made samples in scripts/grey/samples/cfbd_raw (or CFBD_RAW=<a real raw day dir> for a full check).
#   bash db/tests/cfbd-load.sh            # port 7741, name spx-scratch-cfbd
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="${SCRATCH_NAME:-spx-scratch-cfbd}"
PORT="${SCRATCH_PORT:-7741}"
RAW="${CFBD_RAW:-$REPO/scripts/grey/samples/cfbd_raw}"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && { echo "port $PORT is busy"; exit 1; }
OUT="$(mktemp -d)"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$OUT"; }
trap cleanup EXIT
docker info >/dev/null 2>&1 || { echo "Docker is not running"; exit 1; }
pass=0 fail=0
ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi; }

docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx \
  -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 80); do docker logs "$NAME" 2>&1 | grep -q "init process complete" && break; sleep 0.5; done
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
psql_() { docker exec -i "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }

# migration 154 creates legacy_cfbd.game and writes meta.source rows; the scratch gets only the game table
sed -n '/^create schema if not exists legacy_cfbd;/,/^);/p' "$REPO/db/migrations/154_legacy_grey_sources.sql" | psql_ -o /dev/null
psql_ -o /dev/null < "$REPO/db/migrations/157_legacy_cfbd_tables.sql"
psql_ -o /dev/null < "$REPO/db/migrations/157_legacy_cfbd_tables.sql" && ok "migration 157 twice"

python3 -I "$REPO/scripts/grey/cfbd_load.py" "$RAW" --out-dir "$OUT" --fetched-on 2026-10-28 > "$OUT/report.txt"
cat "$OUT/report.txt" | sed 's/^/       /'
# like ds1-apply.sh: the transaction is the runner's, so the file's own begin and commit lines are dropped
apply() { for f in "$OUT"/[0-9]*.sql; do sed -E '/^[[:space:]]*(begin|commit)[[:space:]]*;[[:space:]]*$/Id' "$f" | psql_ -1 -o /dev/null || return 1; done; }
apply && ok "every load file applies" || bad "a load file failed"
counts() { for t in conference venue team conference_affiliation coach coach_season game team_record poll_rank draft_pick team_season_stat roster_player player_season_stat team_game_stat betting_line team_talent team_srs; do
  printf '%s=%s ' "$t" "$(psql_ -c "select count(*) from legacy_cfbd.$t")"; done; }
first="$(counts)"
echo "       $first"
apply && ok "second run applies" || bad "second run failed"
eq "a second run changes no count" "$(counts)" "$first"
# every table has the rows the report promised
while IFS=$'\t' read -r t n bad_ same dup; do
  [ "$t" = table ] && continue
  eq "$t: rows equal the report" "$(psql_ -c "select count(*) from legacy_cfbd.$t" < /dev/null)" "$n"
done < "$OUT/expected-counts.tsv"
if [ "$RAW" = "$REPO/scripts/grey/samples/cfbd_raw" ]; then
  eq "quote kept" "$(psql_ -c "select name from legacy_cfbd.venue where venue_id = 10")" "O'Brien Field"
  eq "tab kept" "$(psql_ -c "select name from legacy_cfbd.venue where venue_id = 11" | tr '\t' '|')" "Tab|Dome"
  eq "team without id is left out" "$(psql_ -c "select count(*) from legacy_cfbd.team")" "2"
  eq "line scores are jsonb" "$(psql_ -c "select home_line_scores->>2 from legacy_cfbd.game where game_id = 1")" "7"
  eq "playoff slot" "$(psql_ -c "select playoff->>'bracketSlot' from legacy_cfbd.game where game_id = 2")" "SF1"
  eq "1869 game kept" "$(psql_ -c "select home_points || '-' || away_points from legacy_cfbd.game where game_id = 3")" "6-4"
  eq "record columns" "$(psql_ -c "select post_losses || '/' || conf_wins from legacy_cfbd.team_record where team_id = 100")" "1/3"
  eq "record without postseason has null" "$(psql_ -c "select post_games is null from legacy_cfbd.team_record where team_id = 101")" "t"
  eq "final poll flag" "$(psql_ -c "select is_final from legacy_cfbd.poll_rank where season_type = 'postseason'")" "t"
  eq "affiliation open end" "$(psql_ -c "select end_year is null from legacy_cfbd.conference_affiliation where team_id = 100")" "t"
  eq "draft hometown jsonb" "$(psql_ -c "select hometown->>'city' from legacy_cfbd.draft_pick where overall = 2")" "Austin"
  eq "string stat kept as text" "$(psql_ -c "select stat from legacy_cfbd.player_season_stat where stat_type = 'PCT'")" "0.66"
  eq "box score stat text" "$(psql_ -c "select stat from legacy_cfbd.team_game_stat where team_id = 100 and category = 'completionAttempts'")" "15-24"
  eq "box score null stat" "$(psql_ -c "select stat is null from legacy_cfbd.team_game_stat where team_id = 101 and category = 'possessionTime'")" "t"
  eq "betting lines: two providers, none for a game without lines" "$(psql_ -c "select count(*) from legacy_cfbd.betting_line")" "2"
  eq "line open is null" "$(psql_ -c "select spread_open is null from legacy_cfbd.betting_line where provider = 'Example Book'")" "t"
  eq "talent" "$(psql_ -c "select talent from legacy_cfbd.team_talent where team = 'Old Tech'")" "500.25"
  eq "srs rank" "$(psql_ -c "select ranking from legacy_cfbd.team_srs where team = 'Old Tech'")" "2"
  eq "season replaced, not doubled" "$(psql_ -c "select count(*) from legacy_cfbd.game where season = 2023")" "2"
fi
echo "cfbd-load: $pass ok, $fail failed"
[ "$fail" = 0 ]

#!/bin/bash
# db/build/237_batted_ball_player_hand.sql on a scratch Postgres with the real schema (every migration applied) and a few hand-made rows
# (db/tests/player-spray-fixture.sql), after db/build/202: the balls of a player are split by the side the batter hit from, a switch hitter has both sides, a pitcher
# has the side of every batter he faced, people are found through Retrosheet's id or Lahman's retroID, unlocated balls, other phases and balls with no side are
# left out, the two sides add up to core.batted_ball_player (db/checks/105 returns nothing), the cells unpack as db/migrations/072 says, and a rerun changes nothing.
#   bash db/tests/player-spray.sh            # port 7742, name spx-scratch-player-spray
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="${SCRATCH_NAME:-spx-scratch-player-spray}"
PORT="${SCRATCH_PORT:-7742}"
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
H -f "$HERE/player-spray-fixture.sql" >/dev/null
(cd "$REPO" && H -1 -f db/build/202_batted_ball.sql >/dev/null)
STEP() { (cd "$REPO" && H -1 -f db/build/237_batted_ball_player_hand.sql >/dev/null); }
SNAP() { H -c "select person_id, season_id, year, role, bat_hand, n, encode(traj, 'hex'), encode(cells, 'hex') from core.batted_ball_player_hand order by 1, 2, 4, 5"; }
ROWS() { H -c "select string_agg(person_id || ':' || year || ':' || role || ':' || bat_hand || ':' || n, ' ' order by person_id, year, role, bat_hand) from core.batted_ball_player_hand"; }

STEP
eq "one row for each player, season, role and side" "$(ROWS)" "601:2024:bat:R:1 601:2025:bat:R:4 602:2024:bat:R:2 602:2025:bat:L:2 602:2025:bat:R:1 603:2024:pit:R:3 603:2025:pit:R:3 604:2025:pit:L:3 604:2025:pit:R:2"
eq "the batter with one side has one row a season" "$(H -c "select count(*) from core.batted_ball_player_hand where person_id = 601 and role = 'bat' and year = 2025")" "1"
eq "a switch hitter has both sides in a season" "$(H -c "select string_agg(bat_hand, '' order by bat_hand) from core.batted_ball_player_hand where person_id = 602 and year = 2025 and role = 'bat'")" "LR"
eq "a pitcher found through Lahman's retroID has the balls hit against him" "$(H -c "select sum(n) from core.batted_ball_player_hand where person_id = 603 and role = 'pit'")" "6"
eq "a player nobody knows is not counted, a ball with no zone is not counted" "$(H -c "select sum(n) from core.batted_ball_player_hand where role = 'bat' and year = 2025")" "7"
eq "the postseason and the all-star game are not counted" "$(H -c "select count(*) from core.batted_ball_player_hand where person_id = 601 and year = 2025 and role = 'bat' and n > 4")" "0"
eq "the two sides add up to core.batted_ball_player (db/checks/105)" "$(H -f "$REPO/db/checks/105_batted_ball_player_hand.sql" | wc -l | tr -d ' ')" "0"
eq "the cells unpack as migration 072 says (601, 2025, bat)" \
  "$(H -c "select jsonb_pretty(core.hit_cells_json(cells)) from core.batted_ball_player_hand where person_id = 601 and year = 2025 and role = 'bat'" | tr -d ' \n')" \
  '{"6":{"out":1},"78":{"single":1},"8D":{"single":1},"7LD":{"home_run":1}}'
eq "the trajectories are the ball types (601, 2025, bat: one ground ball, two line drives, one fly ball)" \
  "$(H -c "select core.hit_traj_json(traj) from core.batted_ball_player_hand where person_id = 601 and year = 2025 and role = 'bat'")" '{"F": 1, "G": 1, "L": 2}'
eq "the api view serves the rows as hex" "$(H -c "select count(*) from api.batted_ball_player_hand where cells ~ '^[0-9a-f]+$'")" "9"
eq "the view works as anon" "$(D -t -A -c "set role anon; select count(*) from api.batted_ball_player_hand" | head -1)" "9"

A="$(SNAP)"; STEP; B="$(SNAP)"
eq "a rerun changes nothing" "$A" "$B"
H -c "insert into core.batted_ball_player_hand select person_id, season_id, year, role, 'L', 1, traj, cells, source_id from core.batted_ball_player_hand where person_id = 601 and year = 2025 and role = 'bat' limit 1" >/dev/null
eq "a hand-made row is caught by the check" "$(H -f "$REPO/db/checks/105_batted_ball_player_hand.sql" | wc -l | tr -d ' ')" "1"
STEP
eq "and a rerun puts it right" "$(H -f "$REPO/db/checks/105_batted_ball_player_hand.sql" | wc -l | tr -d ' ')" "0"
H -c "update legacy_retrosheet.batted_ball set bat_hand = null where game_id = 'BAL202504060' and seq = 9" >/dev/null; STEP
eq "a ball with no side is not counted, and the check says the two tables then differ" "$(H -f "$REPO/db/checks/105_batted_ball_player_hand.sql" | wc -l | tr -d ' ')" "2"
printf '%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" = 0 ]

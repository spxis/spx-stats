#!/bin/bash
# Tests scripts/daily/clubcheck.sql on a scratch Postgres (Docker, removed by name afterwards): made-up club counts, no DS1.
#   bash scripts/daily/test/clubcheck-test.sh [port]      (port in 7740-7749, default 7741)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
CHECK="$HERE/../clubcheck.sql"
PORT="${1:-7741}"
NAME="spx-clubcheck-test-$PORT"
fail=0
docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:$PORT:5432 postgres:17-alpine >/dev/null || { echo "docker failed"; exit 1; }
trap 'docker rm -f "$NAME" >/dev/null 2>&1' EXIT
for i in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 2
docker cp "$CHECK" "$NAME:/clubcheck.sql"

# $1 label; $2 how many clubs are odd (page rows differ by 3 with no held or single game); $3 how many of those are already in _skip;
# $4 expected check result (true|false); $5 expected DAILY_CLUB lines; $6 extra: number of clubs whose difference is explained by games off the club's article
run() {
  local label="$1" odd="$2" skipped="$3" want="$4" wantlines="$5" offpage="${6:-0}"
  local sql
  sql="create temp table _checks (name text, ok boolean, detail text);
create temp table _skip (club text);
insert into _skip select 'Club ' || g from generate_series(1, $skipped) g;
create temp table _clubcount as
select 'mlb' as league, 2026 as season, 't' || g as title, 'Club ' || g as club, g as franchise_id,
       162 + case when g <= $odd then 3 else 0 end as page_rows, 162 + case when g > 101 - $offpage then 7 else 0 end as core_games,
       0 as held, 0 as singles, case when g > 101 - $offpage then 7 else 0 end as off_page
from generate_series(1, 101) g;
\\set clubcheck /clubcheck.sql
\\i :clubcheck
\\pset tuples_only on
\\pset format unaligned
select 'RESULT ' || ok from _checks;"
  local out ok lines
  out="$(printf '%s\n' "$sql" | docker exec -i "$NAME" psql -U postgres -X -q -v ON_ERROR_STOP=1 2>&1)"
  ok="$(printf '%s\n' "$out" | sed -n 's/^RESULT //p')"
  lines="$(printf '%s\n' "$out" | grep -c '^DAILY_CLUB ')"
  if [ "$ok" = "$want" ] && [ "$lines" = "$wantlines" ]; then echo "ok   $label (check $ok, $lines DAILY_CLUB lines)"
  else echo "FAIL $label: check '$ok' (want $want), $lines DAILY_CLUB lines (want $wantlines)"; printf '%s\n' "$out" | head -8; fail=1; fi
}

run "all 101 clubs agree"                                  0 0 true 0
run "1 odd club in 101 passes with a warning"              1 0 true 1
run "3 odd clubs in 101 pass (3 percent of 101 is 3)"      3 0 true 3
run "4 odd clubs in 101 fail: a mapping fault"             4 0 false 4
run "6 odd clubs in 101 fail"                              6 0 false 6
run "a club already left out is not counted again"         6 6 true 0
run "7 games the club's article does not list are explained" 0 0 true 0 5
[ "$fail" = 0 ] && echo "clubcheck: all passed" || { echo "clubcheck: FAILED"; exit 1; }

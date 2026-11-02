#!/bin/bash
# Build step 240_soccer_fifa_code.sql: every national team gets FIFA's three-letter code (not the ISO alpha-3 the source file carries), all 96 codes
# are different (West Germany is FRG, Germany GER, Zaire ZAI, DR Congo COD), only fifa_code changes, no row is added or removed, a team the list lacks
# and a club keep what they had, a rerun changes nothing, and the list agrees with the table the site still carries in web/src/lib/soccerLook.ts.
# Scratch Postgres with a one-table schema, removed by name.
#   bash db/tests/soccer-fifa-code.sh     # port 7746, name spx-scratch-fifacode
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="${SCRATCH_NAME:-spx-scratch-fifacode}"
PORT="${SCRATCH_PORT:-7746}"
STEP="$REPO/db/build/240_soccer_fifa_code.sql"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && { echo "port $PORT is busy"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is not running"; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
pass=0 fail=0
ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi; }

docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
psql_() { docker exec -i "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }

psql_ -o /dev/null <<'SQL'
create schema core;
create table core.soccer_team (team_id text primary key, name text not null, fifa_code text, kind text not null default 'national');
SQL
# every team id the step names, with the source's kind of code: ISO alpha-3 stand-ins ('AAA'), one code for both Germanys and both Congos
IDS="$(grep -oE "\('[TX]-[a-z0-9-]+'," "$STEP" | tr -d "(',")"
N="$(printf '%s\n' "$IDS" | wc -l | tr -d ' ')"
for id in $IDS; do
  code=AAA; [ "$id" = T-31 ] || [ "$id" = T-86 ] && code=DEU; [ "$id" = T-88 ] || [ "$id" = X-dr-congo ] && code=COD
  psql_ -c "insert into core.soccer_team (team_id, name, fifa_code) values ('$id', 'name $id', '$code')"
done
psql_ -c "insert into core.soccer_team (team_id, name, fifa_code) values ('X-future', 'A new team', 'ZZZ')"
psql_ -c "insert into core.soccer_team (team_id, name, fifa_code, kind) values ('C-club', 'A club', null, 'club')"
eq "the step names 96 teams" "$N" 96

other() { psql_ -c "select md5(string_agg(team_id || '|' || name || '|' || kind, ',' order by team_id)) from core.soccer_team"; }
all() { psql_ -c "select md5(string_agg(ctid::text || team_id || coalesce(fifa_code, '-'), ',' order by team_id)) from core.soccer_team"; }
other_before="$(other)"
psql_ -o /dev/null < "$STEP"
eq "no row added or removed" "$(psql_ -c 'select count(*) from core.soccer_team')" 98
eq "only fifa_code changed (names, kinds, ids)" "$(other)" "$other_before"
eq "all 96 national teams carry a code" "$(psql_ -c "select count(*) from core.soccer_team where team_id <> 'X-future' and kind = 'national' and fifa_code ~ '^[A-Z]{3}$' and fifa_code <> 'AAA'")" 96
eq "the 96 codes are all different" "$(psql_ -c "select count(distinct fifa_code) from core.soccer_team where team_id <> 'X-future' and kind = 'national'")" 96
code() { psql_ -c "select fifa_code from core.soccer_team where team_id = '$1'"; }
eq "Germany is GER and West Germany FRG" "$(code T-31) $(code T-86) $(code T-24)" "GER FRG GDR"
eq "Zaire is ZAI and DR Congo COD" "$(code T-88) $(code X-dr-congo)" "ZAI COD"
eq "Netherlands NED, Switzerland SUI, Portugal POR, Algeria ALG" "$(code T-48) $(code T-75) $(code T-58) $(code T-01)" "NED SUI POR ALG"
eq "a team the list lacks keeps its code" "$(code X-future)" ZZZ
eq "a club keeps no code" "$(psql_ -c "select coalesce(fifa_code, 'none') from core.soccer_team where team_id = 'C-club'")" none
after="$(all)"
psql_ -o /dev/null < "$STEP"
eq "a rerun changes nothing (no row rewritten)" "$(all)" "$after"
psql_ -o /dev/null < "$STEP"
eq "and a third run too" "$(all)" "$after"

# the site's table (web/src/lib/soccerLook.ts) and this list say the same, team by team; the list also holds the three teams the 2023 Women's World Cup added
sql_pairs="$(grep -oE "\('[TX]-[a-z0-9-]+', '[A-Z]{3}'\)" "$STEP" | tr -d "()'" | tr -d ' ' | sort)"
web_pairs="$(grep -oE '"[TX]-[a-z0-9-]+": \["[A-Z]{3}"' "$REPO/web/src/lib/soccerLook.ts" | sed -E 's/"([^"]+)": \["([A-Z]+)"/\1,\2/' | sort)"
extra="$(comm -13 <(printf '%s\n' "$web_pairs") <(printf '%s\n' "$sql_pairs") | tr '\n' ' ')"
missing="$(comm -23 <(printf '%s\n' "$web_pairs") <(printf '%s\n' "$sql_pairs") | tr '\n' ' ')"
eq "every code in the site's table is in the step" "$missing" ""
eq "the step adds only the three Women's World Cup teams" "$extra" "X-philippines,PHI X-vietnam,VIE X-zambia,ZAM "

echo "$pass ok, $fail failed"
[ "$fail" = 0 ]

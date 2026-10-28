#!/bin/bash
# db/build/220_soccer_europe_spx.sql and 227_soccer_europe_openfootball.sql: SPX lists the visiting club first for the English 2004-05 seasons and six matches
# of 2005-06 (db/seed/soccer_spx_reversed.csv). After 220 and 227 there is no pair of clubs meeting twice on a day with the sides reversed, the Premier League
# 2004-05 and 2005-06 hold 380 matches each, no SPX match changes id (only the seven cup ties of the seed are gone), a rerun changes nothing, and running 227
# before 220 gives the same rows. The scratch is a copy of the soccer tables of DS1 (a READ-ONLY pg_dump of the tables the steps use; the password is read from
# the keychain and never printed), restored into a Postgres in Docker, removed by name afterwards. Run it from the repo root on a Mac that reaches DS1.
#   bash db/tests/soccer-europe-orientation.sh      # port 7741, name spx-scratch-orient
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"
NAME="${SCRATCH_NAME:-spx-scratch-orient}"
PORT="${SCRATCH_PORT:-7741}"
DS1_HOST="${SPX_DS1_HOST:-ds1}"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && { echo "port $PORT is busy"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is not running"; exit 1; }
WORK="$(mktemp -d)"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
pass=0 fail=0
ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; }
sc() { PGOPTIONS="-c client_min_messages=warning" psql -h 127.0.0.1 -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "dumping the soccer tables of DS1 (read only)"
T=()
for t in appearance award booking goal group_standing manager match match_manager match_referee penalty_kick season_leader squad substitution team tournament tournament_team; do T+=(-t "core.soccer_$t"); done
PGPASSWORD="$(security find-generic-password -s 'spx-stats-db DS1 55440' -w)" PGCONNECT_TIMEOUT=10 \
  pg_dump -h "$DS1_HOST" -p 55440 -U postgres -d spx_stats -Fc --no-owner --no-privileges -f "$WORK/s.dump" "${T[@]}" \
  -t ref.league -t ref.league_name -t ref.soccer_league_system -t ref.sport -t ref.country -t meta.source -t meta.verification -t meta.data_issue \
  -t 'legacy_openfootball.*' -t 'legacy_wikipedia_europe.*' -t legacy_spx.tbl_games -t legacy_spx.tbl_game_scores -t legacy_spx.tbl_teams -t legacy_spx.lk_sport_seasons

docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
sc -d postgres -c "create database base"
sc -d base <<'SQL'
create schema core; create schema ref; create schema meta; create schema legacy_openfootball; create schema legacy_wikipedia_europe; create schema legacy_spx;
create type meta.verification_status as enum ('confirmed','disputed','not_found');
CREATE FUNCTION core.fold_text(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  select btrim(regexp_replace(replace(replace(replace(translate(
    regexp_replace(lower(normalize(t, nfd)), '[̀-ͯ.''’]', '', 'g'),
    'øłđðı', 'olddi'), 'æ', 'ae'), 'œ', 'oe'), 'ß', 'ss'), '[^[:alnum:]]+', ' ', 'g'))
$$;
SQL
# the foreign keys to tables that are not copied (core.person, core.venue) fail to restore; that is expected
pg_restore -h 127.0.0.1 -p "$PORT" -U postgres -d base --no-owner "$WORK/s.dump" >/dev/null 2>&1 || true
[ "$(sc -d base -At -c 'select count(*) from core.soccer_match')" -gt 1000 ] || { echo "the restore is empty"; exit 1; }

FP="select md5(string_agg(match_id||':'||source_key||':'||home_team_id||':'||away_team_id||':'||home_goals||'-'||away_goals||':'||source_id, ',' order by match_id)),
           (select md5(string_agg(entity_kind||entity_key||issue, ',' order by entity_kind, entity_key, issue)) from meta.data_issue where entity_kind like 'soccer%'),
           (select md5(string_agg(entity_id||field||status::text, ',' order by entity_id, field, source_id)) from meta.verification where entity_kind = 'soccer_match')
    from core.soccer_match"
SPXMAP="select match_id, tournament_id, match_date, least(home_team_id, away_team_id), greatest(home_team_id, away_team_id),
               case when home_team_id < away_team_id then home_goals else away_goals end, case when home_team_id < away_team_id then away_goals else home_goals end
        from core.soccer_match where source_id = (select source_id from meta.source where code = 'spx_database') order by 1"
OFBMAP="select md5(string_agg(source_key||home_goals||away_goals||home_team_id, ',' order by source_key)) from core.soccer_match where source_id <> (select source_id from meta.source where code = 'spx_database')"
sc -d base -At -F '|' -c "$SPXMAP" > "$WORK/spx_before.txt"
REV="select count(*) from core.soccer_match a join core.soccer_match b on a.tournament_id = b.tournament_id and a.home_team_id = b.away_team_id
       and a.away_team_id = b.home_team_id and a.match_date = b.match_date and a.match_id < b.match_id"
[ "$(sc -d base -At -c "$REV")" -gt 0 ] && ok "the copy of DS1 shows the fault (same-day reversed pairs before)" || echo "  note the copy holds no reversed pair already (steps 220 and 227 of the fixed kind ran)"

# order A: 220, 227, 228; then both again
sc -d postgres -c "create database a template base"
for f in 220_soccer_europe_spx 227_soccer_europe_openfootball 228_soccer_europe_wikipedia; do sc -d a -f "db/build/$f.sql" >/dev/null; done
sc -d a -At -c "$FP" > "$WORK/a1.txt"
for f in 220_soccer_europe_spx 227_soccer_europe_openfootball 228_soccer_europe_wikipedia; do sc -d a -f "db/build/$f.sql" >/dev/null; done
sc -d a -At -c "$FP" > "$WORK/a2.txt"
cmp -s "$WORK/a1.txt" "$WORK/a2.txt" && ok "a rerun of 220, 227 and 228 changes no row" || bad "a rerun changed rows"
[ "$(sc -d a -At -c "$REV")" = 0 ] && ok "no same-day reversed pair" || bad "same-day reversed pairs remain"
[ -z "$(sc -d a -At -f db/checks/103_soccer_same_day_reversed.sql)" ] && ok "check 103 returns no rows" || bad "check 103 returns rows"
[ -z "$(sc -d a -At -f db/checks/101_soccer_europe.sql)" ] && ok "check 101 returns no rows" || bad "check 101 returns rows"
for t in premier_league2004 premier_league2005; do
  n="$(sc -d a -At -c "select count(*) from core.soccer_match where tournament_id = '$t'")"
  [ "$n" = 380 ] && ok "$t holds 380 matches" || bad "$t holds $n matches"
done
sc -d a -At -F '|' -c "$SPXMAP" > "$WORK/spx_after.txt"
gone="$(comm -23 <(sort "$WORK/spx_before.txt") <(sort "$WORK/spx_after.txt") | wc -l | tr -d ' ')"
added="$(comm -13 <(sort "$WORK/spx_before.txt") <(sort "$WORK/spx_after.txt") | wc -l | tr -d ' ')"
[ "$added" = 0 ] && ok "no SPX match changed id, date, club pair or goals per club" || bad "$added SPX rows are new or changed"
[ "$gone" = 7 ] && ok "only the 7 cup ties of the seed left" || bad "$gone SPX rows left (expected 7)"

# order B: 227 before 220 (the other order of a DS1 run), then 220, 227 and 228
sc -d postgres -c "create database b template base"
for f in 227_soccer_europe_openfootball 220_soccer_europe_spx 227_soccer_europe_openfootball 228_soccer_europe_wikipedia; do sc -d b -f "db/build/$f.sql" >/dev/null; done
sc -d a -At -c "$OFBMAP" > "$WORK/oa.txt"; sc -d b -At -c "$OFBMAP" > "$WORK/ob.txt"
sc -d a -At -F '|' -c "$SPXMAP" > "$WORK/sa.txt"; sc -d b -At -F '|' -c "$SPXMAP" > "$WORK/sb.txt"
cmp -s "$WORK/oa.txt" "$WORK/ob.txt" && cmp -s "$WORK/sa.txt" "$WORK/sb.txt" && ok "227 before 220 ends with the same matches" || bad "the order of 220 and 227 changes the matches"
[ "$(sc -d b -At -c "$REV")" = 0 ] && ok "no reversed pair in order B" || bad "reversed pairs remain in order B"

echo "passed $pass, failed $fail"
[ "$fail" = 0 ]

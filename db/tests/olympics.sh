#!/bin/bash
# The Olympic results: scripts/olympics/parse.py on the raw fixture db/tests/olympics-raw (four articles in the shape of the real ones: 2008 and 1988 and 1968
# men's 100 metres, 2008 women's with one table for the heats), migrations 193 and 194, people from db/tests/olympics-fixture.sql, and db/build/241_olympic_results.sql,
# on a scratch Postgres that has every migration of the repository applied.
# Checks: rounds, heats, wind (a row, the text above, a convert template, a "Wind readings" sentence), lane, reaction, times (hand and automatic), marks, DNS and DQ
# lines, medal templates read as places, a table with a Heat column, a person tied only through a Wikidata id (merged items followed, a person born too late refused,
# the same name with no id never matched), every id kept on a rerun, nothing written twice, the views answering as anon.
# RAW=<dir> runs the same steps on a real raw folder (fetch.py output) and prints the counts and a few spot checks instead of the fixture checks.
# The scratch container is removed by name afterwards.
#   bash db/tests/olympics.sh            # port 7746, name spx-scratch-olympics-test
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="${SCRATCH_NAME:-spx-scratch-olympics-test}"
PORT="${SCRATCH_PORT:-7746}"
RAW="${RAW:-$HERE/olympics-raw}"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && { echo "port $PORT is busy"; exit 1; }
cleanup() { [ -n "${KEEP:-}" ] || docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -f "${LOAD:-/nonexistent}"; }
trap cleanup EXIT
docker info >/dev/null 2>&1 || { echo "Docker is not running"; exit 1; }
pass=0 fail=0
ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1: got '$2', want '$3'"; fi; }

docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx_stats -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
docker exec "$NAME" mkdir -p /work/db
psql_() { docker exec -i -w /work "$NAME" psql -U postgres -d spx_stats -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }
docker cp "$REPO/db/seed" "$NAME:/work/db/seed"
docker cp "$REPO/db/build" "$NAME:/work/db/build"
psql_ -c "create role anon nologin; create role authenticated nologin; create role ingest_writer nologin; create role service_role nologin; create extension if not exists btree_gist; create extension if not exists pg_trgm; create extension if not exists unaccent;" >/dev/null
for f in $(ls "$REPO"/db/migrations/*.sql | sort); do
  case "$(basename "$f")" in 131_*|149_*) continue;; esac     # production only / needs api.stat_reference
  psql_ -1 -o /dev/null < "$f" 2>/dev/null || { bad "migration $(basename "$f") applies"; }
done
ok "migrations applied"

LOAD="$(mktemp)"
python3 -I "$REPO/scripts/olympics/parse.py" "$RAW" "$LOAD" >/dev/null
psql_ -o /dev/null < "$LOAD"
q() { psql_ -F ' ' -c "$1"; }
step() { psql_ -1 -f db/build/241_olympic_results.sql >/dev/null; }
ids() { q "select md5(string_agg(g.year || e.event_key || e.event_id || r.race_id || r.round_ord || r.race_no || x.row_ord, ',' order by g.year, e.event_key, r.round_ord, r.race_no, x.row_ord)) || ' ' || count(*) from core.olympic_result x join core.olympic_race r using (race_id) join core.olympic_event e using (event_id) join core.olympic_games g using (games_id)"; }

if [ "$RAW" != "$HERE/olympics-raw" ]; then
  # the real raw folder: counts and spot checks, nothing fixed
  psql_ -c "insert into core.person (full_name) values ('Usain Bolt'), ('Alain Bernard'); insert into core.external_id (entity_kind, entity_id, source_id, external_key) select 'person', person_id, (select source_id from meta.source where code = 'wikidata'), case full_name when 'Usain Bolt' then 'Q1189' else 'Q297477' end from core.person where full_name in ('Usain Bolt', 'Alain Bernard');" >/dev/null
  step
  q "select g.year, e.event_key, count(distinct r.race_id) as races, count(*) as lines from core.olympic_result x join core.olympic_race r using (race_id) join core.olympic_event e using (event_id) join core.olympic_games g using (games_id) group by g.year, e.event_key order by 1, 2"
  have() { [ "$(q "select count(*) from core.olympic_event where event_key = '$1'")" != 0 ]; }
  if have 100m-m; then
    check "2008 men's final: Bolt, lane 4, 0.165, 9.69, WR, wind 0.0" "$(q "select concat_ws(' ', place, lane, athlete_name, reaction_s, time_s, marks, wind_ms, person_id is not null) from api.olympic_result where games_year = 2008 and event_key = '100m-m' and round_code = 'final' and place = 1")" "1 4 Usain Bolt 0.165 9.690 {WR} 0.0 t"
    check "1988 men's final: Lewis 9.92 first, Johnson DQ" "$(q "select string_agg(concat_ws(' ', coalesce(place::text, status), athlete_name, time_s), '; ' order by row_ord) from api.olympic_result where games_year = 1988 and event_key = '100m-m' and round_code = 'final' and (place = 1 or status = 'DQ')")" "1 Carl Lewis 9.920; DQ Ben Johnson 9.790"
    check "2020 women's final: Thompson-Herah, lane 4, 10.61, OR NR" "$(q "select concat_ws(' ', place, lane, athlete_name, reaction_s, time_s, marks) from api.olympic_result where games_year = 2020 and event_key = '100m-w' and round_code = 'final' and place = 1")" "1 4 Elaine Thompson-Herah 0.150 10.610 {OR,NR}"
  fi
  if have 100free-m; then
  check "2008 men's 100 m freestyle final: Bernard lane 5, 47.21, tied for Bernard's person by Wikidata id" "$(q "select concat_ws(' ', place, lane, athlete_name, time_s, person_id is not null) from api.olympic_result where games_year = 2008 and event_key = '100free-m' and round_code = 'final' and place = 1")" "1 5 Alain Bernard 47.210 t"
  check "2008 men's final: Sullivan 47.32, Lezak and Cielo tied for bronze at 47.67" "$(q "select string_agg(place || ' ' || athlete_name || ' ' || time_s, '; ' order by row_ord) from api.olympic_result where games_year = 2008 and event_key = '100free-m' and round_code = 'final' and place between 2 and 3")" "2 Eamon Sullivan 47.320; 3 Jason Lezak 47.670; 3 César Cielo 47.670"
  check "2008 men's semifinal 2: Sullivan 47.05 WR" "$(q "select concat_ws(' ', place, athlete_name, time_s, marks) from api.olympic_result where games_year = 2008 and event_key = '100free-m' and round_code = 'semifinals' and place = 1")" "1 Eamon Sullivan 47.050 {Q,WR}"
  check "2024 men's final: Pan Zhanle 46.40 WR with 15 m and 50 m splits" "$(q "select concat_ws(' ', place, lane, athlete_name, time_s, marks, splits -> 1 ->> 's') from api.olympic_result where games_year = 2024 and event_key = '100free-m' and round_code = 'final' and place = 1")" "1 4 Pan Zhanle 46.400 {WR} 22.28"
  fi
  A="$(ids)"; step; check "rerun keeps every id" "$(ids)" "$A"
  echo "passed $pass, failed $fail"; [ "$fail" = 0 ]; exit
fi

psql_ -o /dev/null < "$HERE/olympics-fixture.sql"
step
check "articles, races, lines of the fixture" "$(q "select (select count(*) from legacy_wikipedia_olympics.article) || ' ' || (select count(*) from legacy_wikipedia_olympics.race) || ' ' || count(*) from legacy_wikipedia_olympics.line")" "5 16 32"
check "nothing unparsed (the Records table is not a result)" "$(q "select count(*) from legacy_wikipedia_olympics.unparsed")" "0"
check "Games from the seed (30) and the five events" "$(q "select (select count(*) from core.olympic_games) || ' ' || count(*) from core.olympic_event")" "30 5"
check "Tokyo 2020 was held in 2021" "$(q "select held_year from core.olympic_games where year = 2020")" "2021"
check "event name from the infobox, qid and source key" "$(q "select concat_ws(' ', e.name, e.gender, e.distance_m, e.qid, e.source_key) from core.olympic_event e join core.olympic_games g using (games_id) where g.year = 2008 and event_key = '100m-m'")" "Men's 100 metres men 100 Q754844 enwiki:Athletics at the 2008 Summer Olympics – Men's 100 metres@1001"
check "2008 men: rounds heats 2, semifinals 1, final 1" "$(q "select string_agg(round_code || ':' || n, ' ' order by o) from (select round_code, round_ord o, count(*) n from core.olympic_race r join core.olympic_event e using (event_id) join core.olympic_games g using (games_id) where g.year = 2008 and e.event_key = '100m-m' group by 1, 2) s")" "heats:2 semifinals:1 final:1"
check "final: Bolt lane 4, reaction .165, 9.69, WR, wind 0.0, place 1" "$(q "select concat_ws(' ', place, lane, athlete_name, nation_ioc, reaction_s, time_s, marks, wind_ms) from api.olympic_result where games_year = 2008 and event_key = '100m-m' and round_code = 'final' order by row_ord limit 1")" "1 4 Usain Bolt JAM 0.165 9.690 {WR} 0.0"
check "medal templates give places 1 2 3" "$(q "select string_agg(place::text, '' order by row_ord) from api.olympic_result where games_year = 2008 and event_key = '100m-m' and round_code = 'final'")" "123"
check "wind: a row (-0.2, +1.1), the text above (+0.3 and 1968's +2.8), a convert template (+0.3), a final's row (0.0, 1988 +1.1), a readings sentence (-0.1)" "$(q "select string_agg(g.year || e.event_key || r.round_code || r.race_no || ' ' || r.wind_ms, '; ' order by g.year, e.event_key, r.round_ord, r.race_no) from core.olympic_race r join core.olympic_event e using (event_id) join core.olympic_games g using (games_id) where wind_ms is not null")" "1968100m-mheats1 2.8; 1968100m-mfinal1 0.3; 1988100m-mfinal1 1.1; 2008100m-mheats1 -0.2; 2008100m-mheats2 1.1; 2008100m-msemifinals1 0.3; 2008100m-mfinal1 0.0; 2008100m-wfinal1 -0.1"
check "heats of 2008 women: one table with a Heat column gives heats 8 and 9, the rank is over the round" "$(q "select string_agg(race_no || ':' || place_scope || ':' || n, ' ' order by race_no) from (select r.race_no, r.place_scope, count(*) n from core.olympic_result x join core.olympic_race r using (race_id) join core.olympic_event e using (event_id) join core.olympic_games g using (games_id) where g.year = 2008 and e.event_key = '100m-w' and r.round_code = 'heats' group by 1, 2) s")" "8:round:2 9:round:1"
check "women's heat 9 keeps the round rank 3" "$(q "select place from api.olympic_result where games_year = 2008 and event_key = '100m-w' and round_code = 'heats' and race_no = 9")" "3"
check "marks: Q and SB from two templates" "$(q "select marks from api.olympic_result where athlete_name = 'Vicente de Lima'")" "{Q,SB}"
check "a DNS line: no place number, no time, status DNS" "$(q "select concat_ws(' ', place_text, coalesce(place::text, 'null'), coalesce(time_s::text, 'null'), status) from api.olympic_result where athlete_name = 'Francis Manioru'")" "8 8 null DNS"
check "an unlinked athlete keeps the text and no title" "$(q "select concat_ws(' ', athlete_name, coalesce(wiki_title, 'no-title'), coalesce(athlete_qid, 'no-qid')) from core.olympic_result where athlete_name = 'Unlinked Runner'")" "Unlinked Runner no-title no-qid"
check "1988: gold01 and silver02 read as places, the DQ line has no place" "$(q "select string_agg(coalesce(place::text, status), ' ' order by row_ord) from api.olympic_result where games_year = 1988")" "1 2 DQ"
check "1988: the struck time stays as printed" "$(q "select time_s from api.olympic_result where games_year = 1988 and status = 'DQ'")" "9.790"
check "1988: no lane, no reaction time where the article prints none" "$(q "select count(lane) || ' ' || count(reaction_s) from api.olympic_result where games_year = 1988")" "0 0"
check "1968: hand and automatic times (9.9 and 9.95), both marks" "$(q "select concat_ws(' ', time_hand_s, time_s, marks) from api.olympic_result where games_year = 1968 and place = 1 and round_code = 'final'")" "9.900 9.950 {WR}"
check "1968: a note that is not a mark stays a note" "$(q "select notes from api.olympic_result where games_year = 1968 and place = 8")" "Photo-finish shows 10.275"
check "the Records table of the 2008 article is not read" "$(q "select count(*) from api.olympic_result where athlete_name = 'Bolt'")" "0"
check "people tied only through a Wikidata id: Bernard x3, Bolt x3, Lewis, Johnson (merged item followed), Fraser" "$(q "select string_agg(athlete_name, ', ' order by athlete_name) from core.olympic_result where person_id is not null")" "Alain Bernard, Alain Bernard, Alain Bernard, Ben Johnson, Carl Lewis, Shelly-Ann Fraser, Usain Bolt, Usain Bolt, Usain Bolt"
check "Walter Dix: born after the Games less 10 years, shown as text with his item kept" "$(q "select concat_ws(' ', coalesce(person_id::text, 'text'), athlete_qid) from core.olympic_result where athlete_name = 'Walter Dix'")" "text Q331093"
check "Vicente de Lima: a person of that name without an id is never matched" "$(q "select coalesce(person_id::text, 'text') from core.olympic_result where athlete_name = 'Vicente de Lima'")" "text"
check "no person without evidence" "$(q "select count(*) from core.olympic_result x where person_id is not null and not exists (select 1 from core.external_id e where e.entity_kind = 'person' and e.entity_id = x.person_id)")" "0"
check "data issues: one row per event with names shown as text" "$(q "select count(*) from meta.data_issue where entity_kind = 'olympic_result'")" "5"
check "views answer as anon" "$(psql_ -F ' ' -c "set role anon; select count(*) from api.olympic_result" | tail -1)" "32"
check "swimming event: sport, gender, distance, stroke, name from the infobox" "$(q "select concat_ws(' ', e.sport, e.gender, e.distance_m, e.stroke, e.name) from core.olympic_event e where e.event_key = '100free-m'")" "swimming men 100 freestyle Men's 100 metre freestyle"
check "swimming 2008: heats 3 (the Heat column), a swim-off, a semifinal and the final" "$(q "select string_agg(round_code || ':' || race_no || ':' || n, ' ' order by round_ord, race_no) from (select r.round_code, r.round_ord, r.race_no, count(*) n from core.olympic_result x join core.olympic_race r using (race_id) join core.olympic_event e using (event_id) where e.event_key = '100free-m' group by 1, 2, 3) s")" "heats:7:1 heats:8:2 heats:9:2 heats:91:2 semifinals:1:1 final:1:4"
check "swim-off race is labelled and ranked on its own" "$(q "select concat_ws(' ', r.heat_label, r.place_scope, string_agg(x.athlete_name || ' ' || x.place, ', ' order by x.row_ord)) from core.olympic_result x join core.olympic_race r using (race_id) join core.olympic_event e using (event_id) where e.event_key = '100free-m' and r.race_no = 91 group by r.heat_label, r.place_scope")" "Swim-off race Dominik Meichtry 1, Christian Galenda 2"
check "rowspan on time and notes: Galenda shares Meichtry's time and marks" "$(q "select concat_ws(' ', place, heat_label, lane, time_s, marks) from api.olympic_result a join core.olympic_race r using (race_id) where athlete_name = 'Christian Galenda' and r.race_no = 8")" "2 Heats 8 48.550 {QSO,NR}"
check "bronze tie in the final: both place 3, the continental record mark" "$(q "select string_agg(athlete_name || ' ' || place || ' ' || time_s || ' ' || marks::text, '; ' order by row_ord) from api.olympic_result where event_key = '100free-m' and round_code = 'final' and place = 3")" "Jason Lezak 3 47.670 {}; César Cielo 3 47.670 {SA}"
check "semifinal marks: Q and ER" "$(q "select marks from api.olympic_result where event_key = '100free-m' and round_code = 'semifinals'")" "{Q,ER}"
check "splits of the final: 15 m, 50 m and the 50-65 m interval" "$(q "select splits::text from api.olympic_result where event_key = '100free-m' and round_code = 'final' and athlete_name = 'Alain Bernard'")" '[{"m": 15, "s": 5.45}, {"m": 50, "s": 22.28}, {"m": 65, "s": 6.57, "from": 50, "interval": true}]'
check "no splits where the article prints none" "$(q "select count(splits) from api.olympic_result where event_key <> '100free-m' or round_code <> 'final'")" "0"
check "Alain Bernard tied through his Wikidata item (3 lines), Eamon Sullivan has no person and stays text" "$(q "select athlete_name || ' ' || count(person_id) || '/' || count(*) from core.olympic_result where athlete_name in ('Alain Bernard', 'Eamon Sullivan') group by athlete_name order by 1")" "Alain Bernard 3/3
Eamon Sullivan 0/2"
A="$(ids)"; I="$(q "select count(*) from meta.data_issue where entity_kind = 'olympic_result'")"
step
check "rerun keeps every id and row" "$(ids)" "$A"
check "rerun writes no extra data issue" "$(q "select count(*) from meta.data_issue where entity_kind = 'olympic_result'")" "$I"
psql_ -c "delete from legacy_wikipedia_olympics.line where event_key = '100m-m' and games_year = 1968 and round_ord = 8; delete from legacy_wikipedia_olympics.race where event_key = '100m-m' and games_year = 1968 and round_ord = 8; delete from legacy_wikipedia_olympics.article where games_year = 1988;" >/dev/null
step
check "a row the legacy tables no longer hold is deleted, nothing else" "$(q "select (select count(*) from core.olympic_result) || ' ' || (select count(*) from core.olympic_race) || ' ' || (select count(*) from core.olympic_event)")" "27 14 4"
check "the ids that remain are the first ones" "$(q "select count(*) from core.olympic_event where event_id in (select event_id from core.olympic_event e join core.olympic_games g using (games_id) where g.year in (1968, 2008))")" "4"
echo "passed $pass, failed $fail"
[ "$fail" = 0 ]

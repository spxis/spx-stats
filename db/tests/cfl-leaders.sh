#!/bin/bash
# The CFL club leaders: scripts/cfl_leaders/parse.py on the raw fixture db/tests/cfl-leaders-raw (three articles written in the shape of the real ones), migrations 174 and 175,
# core rows made by db/tests/cfl-leaders-fixture.sql, and db/build/238_cfl_leaders.sql, on a scratch Postgres that has every migration of the repository applied.
# Checks: a name is linked only through a Wikidata id (a linked article that is a person of core, merged items followed, a person who could not have played refused) or
# through the one person of that name on the club's roster that season (refused when the name links to another item, when two have the name, when the person played
# for another club or in another season); the seed alias finds "BC Lions" in core's "British Columbia Lions"; an article with no team season is logged and leaves
# no row; figures are kept as written (commas dropped, N/A null, 100T kept); a rerun changes no row and writes no extra data issue; the view answers as anon.
# The scratch container is removed by name afterwards.
#   bash db/tests/cfl-leaders.sh            # port 7744, name spx-scratch-cfl-leaders-test
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="${SCRATCH_NAME:-spx-scratch-cfl-leaders-test}"
PORT="${SCRATCH_PORT:-7744}"
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
python3 -I "$REPO/scripts/cfl_leaders/parse.py" "$HERE/cfl-leaders-raw" "$LOAD" >/dev/null
psql_ -o /dev/null < "$LOAD"
check "fixture: 13 lines of 3 articles" "$(psql_ -c "select count(*) || ' ' || (select count(*) from legacy_wikipedia_cfl_leaders.article) from legacy_wikipedia_cfl_leaders.line")" "13 3"
psql_ -o /dev/null < "$HERE/cfl-leaders-fixture.sql"

q() { psql_ -c "$1"; }
step() { psql_ -f db/build/238_cfl_leaders.sql >/dev/null; }
step
who() { q "select coalesce(p.full_name || ' ' || l.matched_by, 'text') from core.team_season_leader l left join core.person p using (person_id) join core.team_season ts using (team_season_id) join core.season s using (season_id) where s.start_year = $1 and l.name = '$2' order by l.category, l.ord limit ${3:-1}"; }
check "rows: 10 of 2010 and 2 of 1962 (the 1959 Montreal article has no team season)" "$(q "select count(*) from core.team_season_leader")" "12"
check "linked 7: wikidata 4, roster 3" "$(q "select count(person_id) || ' ' || count(*) filter (where matched_by = 'wikidata') || ' ' || count(*) filter (where matched_by = 'roster') from core.team_season_leader")" "7 4 3"
check "wikidata: a linked article that is a person" "$(who 2010 'Henry Burris')" "Henry Burris wikidata"
check "wikidata: another" "$(who 2010 'Joffrey Reynolds')" "Joffrey Reynolds wikidata"
check "wikidata: a merged item is followed (Q110 into Q111)" "$(who 2010 'Rob Cote')" "Rob Cote wikidata"
check "wikidata: the alias finds the club (BC Lions in British Columbia Lions)" "$(who 1962 'Willie Fleming')" "Willie Fleming wikidata"
check "roster: plain text, one of that name on the roster" "$(who 2010 'Drew Tate')" "Drew Tate roster"
check "roster: a link to an item core does not hold, the roster's one Nik Lewis has no id" "$(who 2010 'Nik Lewis')" "Nik Lewis roster"
check "roster: a link to a disambiguation page, the roster decides" "$(who 2010 'Arjei Franklin')" "Arjei Franklin roster"
check "text: two of that name on the roster" "$(who 2010 'Jon Cornish')" "text"
check "text: on another season's roster only" "$(who 2010 'Jesse Lumsden')" "text"
check "text: linked person born after the season less 14 years" "$(who 2010 'Ken-Yon Rambo')" "text"
check "text: the link names another item than the roster's person" "$(who 2010 'Deon Murphy')" "text"
check "text: on no roster, no link" "$(who 1962 'Nub Beamer')" "text"
check "no person without evidence" "$(q "select count(*) from core.team_season_leader l where person_id is not null and not ((matched_by = 'wikidata' and exists (select 1 from core.external_id x where x.entity_kind = 'person' and x.entity_id = l.person_id and x.external_key = l.qid)) or (matched_by = 'roster' and exists (select 1 from core.roster_stint r where r.person_id = l.person_id and r.team_season_id = l.team_season_id)))")" "0"
check "the order of the article is kept (receiving)" "$(q "select string_agg(name, ', ' order by ord) from core.team_season_leader where category = 'receiving'")" "Nik Lewis, Ken-Yon Rambo, Arjei Franklin, Deon Murphy, Rob Cote"
check "figures: commas dropped" "$(q "select stats ->> 'yds' from core.team_season_leader where name = 'Henry Burris'")" "4945"
check "figures: N/A is null" "$(q "select jsonb_typeof(stats -> 'rating') from core.team_season_leader where name = 'Drew Tate'")" "null"
check "figures: a touchdown mark is kept" "$(q "select stats ->> 'long' from core.team_season_leader where name = 'Ken-Yon Rambo'")" "100T"
check "figures: the offence table's own columns (an empty cell is null)" "$(q "select concat_ws(' ', stats ->> 'pass_yds', stats ->> 'rush_yds', stats ->> 'rec_yds', stats ->> 'td') from core.team_season_leader where name = 'Willie Fleming'")" "958 220 4"
check "source key is the revision" "$(q "select source_key from core.team_season_leader where name = 'Nub Beamer'")" "enwiki:1962 BC Lions season@1000002"
check "data issues: the unplaced article and two articles with names shown as text" "$(q "select count(*) from meta.data_issue where entity_kind = 'cfl_leaders'")" "3"
check "data issue names the text lines" "$(q "select issue from meta.data_issue where entity_kind = 'cfl_leaders' and entity_key like '%:2010:%'" | grep -c 'Jon Cornish')" "1"

# a rerun changes nothing
before="$(q "select md5(string_agg(l::text, '|' order by team_season_id, category, ord)) from core.team_season_leader l") $(q "select count(*) from meta.data_issue where entity_kind = 'cfl_leaders'") $(q "select count(*) from meta.source where code = 'wikipedia_cfl_leaders'")"
step; step
after="$(q "select md5(string_agg(l::text, '|' order by team_season_id, category, ord)) from core.team_season_leader l") $(q "select count(*) from meta.data_issue where entity_kind = 'cfl_leaders'") $(q "select count(*) from meta.source where code = 'wikipedia_cfl_leaders'")"
check "a rerun changes no row, writes no extra data issue" "$after" "$before"

# visitors
check "the view answers as anon" "$(psql_ -c "set role anon; select count(*) from api.team_season_leader")" "12"
check "the view carries no person where the name is text" "$(psql_ -c "set role anon; select count(*) from api.team_season_leader where person_id is null")" "5"
check "a person who is deleted leaves the line, as text" "$(psql_ -c "delete from core.roster_stint; delete from core.external_id; delete from core.person where full_name = 'Drew Tate'; select count(*) filter (where name = 'Drew Tate' and person_id is null) || ' ' || count(*) from core.team_season_leader")" "1 12"
check "size: the table and its key stay small" "$(q "select pg_total_relation_size('core.team_season_leader') < 262144")" "t"

echo "passed $pass, failed $fail"
[ "$fail" = 0 ]

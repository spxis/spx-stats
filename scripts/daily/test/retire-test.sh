#!/bin/bash
# Tests the retire step of the daily job (scripts/daily/retire.sql, revive.sql, migration 162) on a scratch Postgres (Docker, removed by name afterwards).
# The real migrations (043, 044, 046, 055, 114, 162), the real db/build/152 and the real ingest functions run on made-up clubs and games; the tables
# of core and meta come from scratch-schema.sql (DS1's catalogs). No DS1, no network.
#   bash scripts/daily/test/retire-test.sh [port]      (port in 7740-7749, default 7746)
#
# One scene is one day's run: staging (what the sources list that day) -> 152 -> revive -> report -> bulk step -> second report -> retire -> checks.
# Scenes (SPX-761): a playoff series that ends early leaves "if necessary" games; a game made against a wrong opponent; a second source that keeps an
# unplayed game scheduled for good; and what must NOT be retired.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
PORT="${1:-7746}"
NAME="spx-retire-test-$PORT"
fail=0
docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx -p 127.0.0.1:$PORT:5432 postgres:17-alpine >/dev/null || { echo "docker failed"; exit 1; }
trap '[ -n "${KEEP:-}" ] || docker rm -f "$NAME" >/dev/null 2>&1' EXIT
for i in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 2
P() { docker exec -i "$NAME" psql -U postgres -d spx -X -q -v ON_ERROR_STOP=1 "$@"; }
strip() { sed -E '/^[[:space:]]*(begin|commit)[[:space:]]*;[[:space:]]*$/Id' "$1"; }

P -c "create role anon nologin; create role authenticated nologin;" >/dev/null
P < "$HERE/scratch-schema.sql" >/dev/null || { echo "scratch schema failed"; exit 1; }
for m in 043_legacy_wikipedia_daily 044_ingest_report_results 046_ingest_writer_role 055_daily_balldontlie 114_game_starts_at 162_ingest_game_retired; do
  strip "$REPO/db/migrations/$m.sql" | P >/dev/null || { echo "migration $m failed"; exit 1; }
done
strip "$REPO/db/build/152_games_from_wikipedia_daily.sql" > /tmp/spx-retire-152-$PORT.sql
docker cp /tmp/spx-retire-152-$PORT.sql "$NAME:/152.sql"; rm -f /tmp/spx-retire-152-$PORT.sql
docker cp "$HERE/../retire.sql" "$NAME:/retire.sql"
docker cp "$HERE/../revive.sql" "$NAME:/revive.sql"

# five clubs of one league, a season is made by 152
P >/dev/null <<'SQL'
insert into ref.sport values ('baseball', 'Baseball');
insert into ref.country (country_code, name) values ('US', 'United States');
insert into ref.league (league_code, sport_code) values ('mlb', 'baseball');
insert into meta.source (code, name, kind) values ('spx_database', 'SPX', 'website');
insert into core.franchise (sport_code, source_id, source_key) select 'baseball', source_id, g::text from meta.source, generate_series(1, 5) g where code = 'spx_database';
insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, country_code)
select franchise_id, daterange('1990-01-01', null), 'Town ' || franchise_id, 'Club' || franchise_id, 'Club ' || franchise_id, 'US' from core.franchise;
insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select franchise_id, 'mlb', daterange('1990-01-01', null), source_id from core.franchise;
SQL

# A staged game: key, home, away, status, score "h-a" or null, the sources that list it ('article' or 'bdl'), days ago (negative: ahead), phase
stage_reset() { P -c "delete from legacy_wikipedia_daily.game; delete from legacy_wikipedia_daily.claim; delete from legacy_wikipedia_daily.page;" >/dev/null; }
# readable clubs: a team page with one claim for each club in the list (1..5); the rest have a page with no claim
pages() {
  local readable="$1"
  P >/dev/null <<SQL
insert into legacy_files.raw_archive (name, saved_on, sha256, data) values ('t', current_date, 'x', '\x00') on conflict do nothing;
insert into legacy_wikipedia_daily.page (source, league, season, kind, title, club, revision, revision_at, sha256, bytes, archive_name, fetched_at)
select 'wikipedia', 'mlb', 2026, 'team', '2026 Club ' || g || ' season', 'Club ' || g, 'r' || g, now(), 'x', 1, 't', now() from generate_series(1, 5) g;
insert into legacy_wikipedia_daily.claim (page_id, row_no, game_date, teams, status, phase)
select page_id, 0, current_date, array['Club 1', 'Club 2'], 'scheduled', 'regular' from legacy_wikipedia_daily.page where club in (select 'Club ' || x from unnest(array[$readable]) x);
SQL
}
game() { # key home away status score sources daysago
  local key="$1" h="$2" a="$3" st="$4" sc="$5" src="$6" ago="$7" hs="null" as="null"
  [ "$sc" != "-" ] && { hs="${sc%-*}"; as="${sc#*-}"; }
  local srcs="array['wp:2026 Club $h season','wp:2026 Club $a season']"; [ "$src" = bdl ] && srcs="array['balldontlie']"
  P >/dev/null <<SQL
insert into legacy_wikipedia_daily.game (source_key, league, season, phase, game_date, home_name, away_name, home_known, neutral, status, home_score, away_score, overtime, confidence, sources, provenance)
values ('wpdaily:mlb:2026:playoffs:' || (current_date - $ago)::text || ':Club $h:Club $a:$key', 'mlb', 2026, 'playoffs', current_date - $ago, 'Club $h', 'Club $a', true, false, '$st', $hs, $as,
        case when '$st' = 'final' then false end, case when '$st' = 'final' then 'confirmed' else 'scheduled' end, $srcs, '{}');
SQL
}
# One run of the daily load for the staged games. Prints DAILY_RETIRED / DAILY_RETIRE_SKIPPED lines and the failed checks.
day() {
  P -t -A <<'SQL'
begin;
create temp table _skip (club text not null);
create temp table _checks (name text, ok boolean, detail text);
\set league mlb
\i /152.sql
\i /revive.sql
create temp table _obs as
select jsonb_agg(jsonb_build_object('game_ref', g.source_key, 'league', g.league, 'season', g.season, 'phase', g.phase, 'game_date', g.game_date, 'game_no', 0,
       'home_key', ingest.franchise_key(h.franchise_id), 'away_key', ingest.franchise_key(a.franchise_id), 'home_name', g.home_name, 'away_name', g.away_name,
       'home_known', true, 'neutral', false, 'status', g.status, 'home_score', g.home_score, 'away_score', g.away_score, 'overtime', g.overtime,
       'verdict', case when g.status = 'final' then g.confidence else 'none' end,
       'source', case when 'balldontlie' = any (g.sources) and cardinality(g.sources) = 1 then 'balldontlie' else 'wikipedia' end)) as j
from legacy_wikipedia_daily.game g join club h on h.name = g.home_name and h.league = g.league join club a on a.name = g.away_name and a.league = g.league;
select ingest.report_results(j) is not null as r from _obs \gset
select ingest.replay(true, true) is not null as r \gset
\i /retire.sql
select 'FAILED ' || name || ' | ' || detail from _checks where not ok;
commit;
SQL
}
games_now() { P -t -A -c "select string_agg((string_to_array(source_key, ':'))[array_length(string_to_array(source_key, ':'), 1)] || ':' || status, ' ' order by game_date, game_id) from core.game g where g.source_id = ingest.daily_source()"; }
n_games() { P -t -A -c "select count(*) from core.game"; }
n_retired() { P -t -A -c "select count(*) from ingest.game_retired"; }
check() { # label, got, want
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: got '$2', want '$3'"; fail=1; fi
}

# ---------------------------------------------------------------- day 1: a series with an "if necessary" game, a wrong opponent, a second-source game
stage_reset; pages "1,2,3,4,5"
game a 1 2 final 3-2 article 12       # a played game
game b 1 2 scheduled - article 4      # "if necessary" game 7 of the 1-2 series
game c 3 5 scheduled - article 4      # a game against a club that turns out not to play (club 5 only in the future)
game d 3 4 scheduled - bdl 5          # a game only the second source lists
game e 1 3 scheduled - article -6     # an ordinary future game
out="$(day)"
check "day 1: game d, which only the second source lists and which is 5 days past, is made and retired in the same run; the others stay" "$(n_games) $(printf '%s' "$out" | grep -c '^DAILY_RETIRED')" "4 1"

# ---------------------------------------------------------------- day 2: the series is over; the wrong opponent is gone; the second source still lists game d
stage_reset; pages "1,2,3,4,5"
game a 1 2 final 3-2 article 12
game d 3 4 scheduled - bdl 5
game e 1 3 scheduled - article -6
out="$(day)"
check "day 2: the unlisted if-necessary game and the wrong-opponent game are retired" "$(printf '%s' "$out" | grep '^DAILY_RETIRED' | sed -E 's/.*game_ref": "wpdaily:mlb:2026:playoffs:[0-9-]+:Club ([0-9]):Club ([0-9]):([a-z])".*/\3/' | sort | paste -sd, -)" "b,c"
check "day 2: the final, the future game and nothing else are left" "$(games_now)" "a:final e:scheduled"
check "day 2: the retired game_refs are remembered (b, c and d)" "$(n_retired)" "3"
check "day 2: their external ids and verifications are gone" "$(P -t -A -c "select count(*) from core.external_id e where e.entity_kind = 'game' and not exists (select 1 from core.game g where g.game_id = e.entity_id)")" "0"
check "day 2: no check failed" "$(printf '%s' "$out" | grep -c '^FAILED')" "0"

# ---------------------------------------------------------------- day 3: the same sources again: a no-op, nothing comes back, nothing is retired
before="$(n_games)"
out="$(day)"
check "day 3: a second run changes nothing (no game made, none retired, no check failed)" "$(n_games) $(printf '%s' "$out" | grep -c '^DAILY_RETIRED') $(printf '%s' "$out" | grep -c '^FAILED')" "$before 0 0"
P -t -A -c "select ingest.replay(true, false) is not null" >/dev/null
check "day 3: a full replay of the log does not bring the retired games back" "$(n_games)" "$before"

# ---------------------------------------------------------------- day 4: an article lists game b again, and game d is played
stage_reset; pages "1,2,3,4,5"
game a 1 2 final 3-2 article 12
game b 1 2 scheduled - article 4
game d 3 4 final 5-1 bdl 5
game e 1 3 scheduled - article -6
out="$(day)"
check "day 4: a game listed by an article again and a game that got a result come back" "$(games_now)" "a:final d:final b:scheduled e:scheduled"
check "day 4: only game_refs of games that are not listed stay retired" "$(n_retired)" "1"
check "day 4: no check failed" "$(printf '%s' "$out" | grep -c '^FAILED')" "0"

# ---------------------------------------------------------------- day 5: what must NOT be retired
# (a) club 3's article could not be read (no claims): its unlisted game e (1 v 3) stays, the unlisted game b (1 v 2) of two readable clubs goes
stage_reset; pages "1,2,4,5"
game a 1 2 final 3-2 article 12
game d 3 4 final 5-1 bdl 5
out="$(day)"
check "day 5: a game of a club whose article could not be read is not retired, one of two readable clubs is" "$(games_now)" "a:final d:final e:scheduled"
# (b) a postponed game is never retired, nor a final, whatever the sources list
P >/dev/null <<'SQL'
update core.game set status = 'postponed' where source_key like '%:e';
SQL
stage_reset; pages "1,2,3,4,5"
game a 1 2 final 3-2 article 12
out="$(day)"
check "day 5: finals and postponed games are never retired" "$(games_now)" "a:final d:final e:postponed"
check "day 5: no check failed" "$(printf '%s' "$out" | grep -c '^FAILED')" "0"

# ---------------------------------------------------------------- day 6: more than 30 candidates is a source that stopped listing games, not placeholders
P >/dev/null <<'SQL'
insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, status, source_id, source_key)
select s.season_id, 'regular', current_date + g, h.team_season_id, a.team_season_id, 'scheduled', ingest.daily_source(), 'wpdaily:mlb:2026:regular:bulk' || g
from core.season s, generate_series(1, 31) g,
     (select team_season_id from core.team_season order by team_season_id limit 1) h,
     (select team_season_id from core.team_season order by team_season_id desc limit 1) a
where s.league_code = 'mlb';
insert into ingest.game_observation (game_ref, league, season, phase, game_date, home_key, away_key, status, source, content_hash, game_id, outcome, last_seen)
select g.source_key, 'mlb', 2026, 'regular', g.game_date, 'spx_database:1', 'spx_database:5', 'scheduled', 'wikipedia', 'h' || g.game_id, g.game_id, 'unchanged', now() - interval '1 day'
from core.game g where g.source_key like '%bulk%';
SQL
stage_reset; pages "1,2,3,4,5"
game a 1 2 final 3-2 article 12
out="$(day)"
check "day 6: 31 candidates: none retired, the skip is reported" "$(P -t -A -c "select count(*) from core.game where source_key like '%bulk%'") $(printf '%s' "$out" | grep -c '^DAILY_RETIRE_SKIPPED 31')" "31 1"

# ---------------------------------------------------------------- day 7: a future game only the second source lists is not retired when that source is missing for a run
P >/dev/null <<'SQL'
delete from core.game where source_key like '%bulk%';
delete from ingest.game_observation where game_ref like '%bulk%';
SQL
stage_reset; pages "1,2,3,4,5"
game a 1 2 final 3-2 article 12
game g 4 5 scheduled - bdl -3
out="$(day)"
stage_reset; pages "1,2,3,4,5"
game a 1 2 final 3-2 article 12
out="$(day)"
check "day 7: a future game that only the second source listed stays when it is not listed one run" "$(P -t -A -c "select count(*) from core.game where source_key like '%:g'")" "1"

# ---------------------------------------------------------------- day 8: a decided series (SPX-761: the Brewers won the World Series 4-1, games 6 and 7 stayed scheduled)
# day 8a: three series in progress; the scheduled game of each is listed (by an article, or by the second source only)
series() { # the games of the three series; $1 = "done" adds the deciding wins and leaves out the unplayed games of the decided ones, as games.py does
  stage_reset; pages "1,2,3,4,5"
  game a 1 2 final 3-2 article 12
  game w1 2 3 final 5-2 article 20      # clubs 2 and 3: club 2 wins its 3rd game, then its 4th
  game w2 2 3 final 5-2 article 19
  game w3 3 2 final 2-5 article 18
  game v1 2 4 final 5-2 article 20      # clubs 2 and 4: three wins in a best of seven are never a decided series
  game v2 2 4 final 5-2 article 19
  game v3 4 2 final 2-5 article 18
  game y 2 4 scheduled - article -2
  game m1 1 5 final 5-2 article 20      # clubs 1 and 5, a Division Series (best of five): three wins decide it
  game m2 1 5 final 5-2 article 19
  if [ "$1" = done ]; then
    game w4 2 3 final 5-2 article 17
    game m3 5 1 final 2-5 article 18
  else
    game x 3 2 scheduled - bdl -2
    game z 5 1 scheduled - article -2
  fi
  P >/dev/null -c "update legacy_wikipedia_daily.game set round = 'American League Division Series' where source_key ~ ':(m1|m2|m3|z)$'"
}
series open; out="$(day)"
check "day 8a: series in progress: nothing retired, their scheduled games are made" "$(printf '%s' "$out" | grep -c '^DAILY_RETIRED') $(P -t -A -c "select count(*) from core.game where source_key ~ ':(x|y|z)$'")" "0 3"
series done; out="$(day)"
retired="$(printf '%s' "$out" | grep '^DAILY_RETIRED' | sed -E 's/.*:([a-z0-9]+)".*/\1/' | sort | paste -sd, -)"
check "day 8b: the unplayed games of two decided series are retired (a best of seven at 4 wins, a best of five at 3), not those of a series at 3-0 in a best of seven" "$retired" "x,z"
check "day 8b: the unplayed game of the undecided series stays" "$(P -t -A -c "select count(*) from core.game where source_key like '%:y' and status = 'scheduled'")" "1"
check "day 8b: no check failed" "$(printf '%s' "$out" | grep -c '^FAILED')" "0"
out="$(day)"
check "day 8c: a second run changes nothing" "$(printf '%s' "$out" | grep -c '^DAILY_RETIRED') $(printf '%s' "$out" | grep -c '^FAILED')" "0 0"

[ "$fail" = 0 ] && echo "retire: all passed" || { echo "retire: FAILED"; exit 1; }

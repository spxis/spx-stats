#!/bin/bash
# Tests which release route an ordinary daily run takes (scripts/daily/release_hook.py) on a scratch Postgres (Docker, removed by name afterwards).
# The real migrations (043, 044, 046, 055, 114, 162) and the real db/build/152 run on made-up clubs and games; the tables of core and meta come from
# scratch-schema.sql (DS1's catalogs). The tables a day's transaction wrote to are read with the same query apply.py puts in DAILY_SUMMARY
# (apply.WROTE_TABLES), and the hook chooses the route from them. No DS1, no network.
#   bash scripts/daily/test/route-test.sh [port]      (port in 7740-7749, default 7747)
#
# Scenes: the first load of a season (review: it makes core.season, core.team_season and the source row); an ordinary day later, when the pages
# were fetched on a new day and a game got its result (auto: only core.game and the tables set aside); the same day again (nothing to release);
# and a day when a new club joins the league (review: a new team season).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
PORT="${1:-7747}"
NAME="spx-route-test-$PORT"
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
T152="$(mktemp)"; strip "$REPO/db/build/152_games_from_wikipedia_daily.sql" > "$T152"
docker cp "$T152" "$NAME:/152.sql"; rm -f "$T152"
WROTE="$(python3 -I -c "import sys; sys.path.insert(0, '$REPO/scripts/daily'); import apply; print(apply.WROTE_TABLES)")"
[ -n "$WROTE" ] || { echo "apply.WROTE_TABLES not found"; exit 1; }

P >/dev/null <<'SQL'
insert into ref.sport values ('baseball', 'Baseball');
insert into ref.country (country_code, name) values ('US', 'United States');
insert into ref.league (league_code, sport_code) values ('mlb', 'baseball');
insert into meta.source (code, name, kind) values ('spx_database', 'SPX', 'website');
insert into core.franchise (sport_code, source_id, source_key) select 'baseball', source_id, g::text from meta.source, generate_series(1, 6) g where code = 'spx_database';
insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, country_code)
select franchise_id, daterange('1990-01-01', null), 'Town ' || franchise_id, 'Club' || franchise_id, 'Club ' || franchise_id, 'US' from core.franchise;
-- club 6 joins the league only in the last scene
insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select franchise_id, 'mlb', daterange('1990-01-01', null), source_id from core.franchise where source_key <> '6';
SQL

# the pages the sources were read from on a day: $1 = readable clubs (1..6), $2 = how many days ahead of today they were fetched
pages() {
  P >/dev/null <<SQL
delete from legacy_wikipedia_daily.game; delete from legacy_wikipedia_daily.claim; delete from legacy_wikipedia_daily.page;
insert into legacy_files.raw_archive (name, saved_on, sha256, data) values ('t', current_date, 'x', '\x00') on conflict do nothing;
insert into legacy_wikipedia_daily.page (source, league, season, kind, title, club, revision, revision_at, sha256, bytes, archive_name, fetched_at)
select 'wikipedia', 'mlb', 2026, 'team', '2026 Club ' || g || ' season', 'Club ' || g, 'r' || g, now(), 'x', 1, 't', now() + interval '$2 days' from unnest(array[$1]) g;
insert into legacy_wikipedia_daily.claim (page_id, row_no, game_date, teams, status, phase)
select page_id, 0, current_date, array['Club 1', 'Club 2'], 'scheduled', 'regular' from legacy_wikipedia_daily.page;
SQL
}
game() { # key home away status score days-ago
  local hs="null" as="null"
  [ "$5" != "-" ] && { hs="${5%-*}"; as="${5#*-}"; }
  P >/dev/null <<SQL
delete from legacy_wikipedia_daily.game where source_key like '%:$1';
insert into legacy_wikipedia_daily.game (source_key, league, season, phase, game_date, home_name, away_name, home_known, neutral, status, home_score, away_score, overtime, confidence, sources, provenance)
values ('wpdaily:mlb:2026:regular:' || (current_date - $6)::text || ':Club $2:Club $3:$1', 'mlb', 2026, 'regular', current_date - $6, 'Club $2', 'Club $3', true, false, '$4', $hs, $as,
        case when '$4' = 'final' then false end, case when '$4' = 'final' then 'confirmed' else 'scheduled' end, array['wp:2026 Club $2 season', 'wp:2026 Club $3 season'], '{}');
SQL
}
# One committed run of the daily load. Prints the tables it wrote to as JSON, as DAILY_SUMMARY has them.
day() {
  P -t -A <<SQL
begin;
create temp table _skip (club text not null);
create temp table _checks (name text, ok boolean, detail text);
\set league mlb
\i /152.sql
create temp table _obs as
select jsonb_agg(jsonb_build_object('game_ref', g.source_key, 'league', g.league, 'season', g.season, 'phase', g.phase, 'game_date', g.game_date, 'game_no', 0,
       'home_key', ingest.franchise_key(h.franchise_id), 'away_key', ingest.franchise_key(a.franchise_id), 'home_name', g.home_name, 'away_name', g.away_name,
       'home_known', true, 'neutral', false, 'status', g.status, 'home_score', g.home_score, 'away_score', g.away_score, 'overtime', g.overtime,
       'verdict', case when g.status = 'final' then g.confidence else 'none' end, 'source', 'wikipedia')) as j
from legacy_wikipedia_daily.game g join club h on h.name = g.home_name and h.league = g.league join club a on a.name = g.away_name and a.league = g.league;
select ingest.report_results(j) is not null as r from _obs \gset
select ingest.replay(true, true) is not null as r \gset
select $WROTE::text;
commit;
SQL
}
route() { # the tables JSON on stdin -> the hook's route
  python3 -I -c "
import sys, json, io, contextlib
sys.path.insert(0, '$REPO/scripts/daily')
import release_hook
t = json.load(sys.stdin)
with contextlib.redirect_stdout(io.StringIO()):
    r = release_hook.prepare_release(t, '2026-01-01', env={'DAILY_RELEASE_KIND': 'daily_scores'})
print(r['route'], ','.join(r['tables']))"
}
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: got '$2', want '$3'"; fail=1; fi; }

# ---------------------------------------------------------------- day 1: the season does not exist yet
pages "1,2,3,4,5" 0
game a 1 2 scheduled - -3
out="$(day | tail -1)"
check "first load of a season: review (it makes the season, its team seasons and the source row)" "$(printf '%s' "$out" | route | cut -d' ' -f1)" "review"
check "first load: the tables written include core.season, core.team_season and meta.source" "$(printf '%s' "$out" | python3 -I -c "import sys, json; t = json.load(sys.stdin); print(all(k in t for k in ('core.season', 'core.team_season', 'meta.source')))")" "True"

# ---------------------------------------------------------------- day 2: an ordinary day. The pages were fetched a day later and game a has its result
pages "1,2,3,4,5" 1
game a 1 2 final 3-2 -3
out="$(day | tail -1)"
check "ordinary day, pages fetched on a new day: auto" "$(printf '%s' "$out" | route | cut -d' ' -f1)" "auto"
check "ordinary day: the route's tables are core.game only" "$(printf '%s' "$out" | route | cut -d' ' -f2)" "core.game"
check "ordinary day: meta.source is not written" "$(printf '%s' "$out" | python3 -I -c "import sys, json; print('meta.source' in json.load(sys.stdin))")" "False"
check "the source row keeps the date it was made with (the pages' fetch day does not move it)" "$(P -t -A -c "select retrieved_on = current_date from meta.source where code = 'wikipedia_daily'")" "t"

# ---------------------------------------------------------------- day 3: the same pages again, a week later: nothing to release
pages "1,2,3,4,5" 7
game a 1 2 final 3-2 -3
out="$(day | tail -1)"
check "a day with nothing new: no release table written" "$(printf '%s' "$out" | python3 -I -c "import sys, json; print(sorted(k for k in json.load(sys.stdin) if k != 'core.external_id'))")" "[]"

# ---------------------------------------------------------------- day 4: a club joins the league: a new team season
P >/dev/null <<'SQL'
insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select franchise_id, 'mlb', daterange('1990-01-01', null), source_id from core.franchise where source_key = '6';
SQL
pages "1,2,3,4,5,6" 8
game b 3 6 scheduled - -2
out="$(day | tail -1)"
check "a new team season: review" "$(printf '%s' "$out" | route | cut -d' ' -f1)" "review"

[ $fail = 0 ] && echo "all ok" || { echo "FAILED"; exit 1; }

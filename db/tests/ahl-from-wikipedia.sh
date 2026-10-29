#!/bin/bash
# The AHL build (db/build/229_ahl_from_wikipedia.sql, db/seed/hockey_minor_club.csv) and its alignment (db/build/178_alignment.sql), on a scratch Postgres that has
# every migration of the repository applied (the two files that only production or a later api object can take are skipped), the rows
# scripts/hockey_minor/season.py loads for 1940-41, 1985-86 and 2018-19 (db/tests/ahl-fixture.sql) and nothing else.
# Checks: the seed names every club once and every franchise at most once a season; 229 builds the standings, series, games, champions and franchises
# it should; a rerun (229 twice more) changes no franchise, identity, team season, game, series, award-winner or standing key; 178 gives every club
# of a table its division and conference; the checks of db/checks that concern the league stay at their baseline.
# The scratch container is removed by name afterwards.
#   bash db/tests/ahl-from-wikipedia.sh            # port 7746, name spx-scratch-ahl-test
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="${SCRATCH_NAME:-spx-scratch-ahl-test}"
PORT="${SCRATCH_PORT:-7746}"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && { echo "port $PORT is busy"; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker info >/dev/null 2>&1 || { echo "Docker is not running"; exit 1; }
pass=0 fail=0
ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1: got '$2', want '$3'"; fi; }

docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx_stats -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
psql_() { docker exec -i -w /work "$NAME" psql -U postgres -d spx_stats -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }
docker exec "$NAME" mkdir -p /work/db
docker cp "$REPO/db/seed" "$NAME:/work/db/seed"
docker cp "$REPO/db/build" "$NAME:/work/db/build"
psql_ -c "create role anon nologin; create role authenticated nologin; create role ingest_writer nologin; create role service_role nologin; create extension if not exists btree_gist; create extension if not exists pg_trgm; create extension if not exists unaccent;" >/dev/null
for f in $(ls "$REPO"/db/migrations/*.sql | sort); do
  case "$(basename "$f")" in 131_*|149_*) continue;; esac     # production only / needs api.stat_reference
  psql_ -1 -o /dev/null < "$f" 2>/dev/null || { bad "migration $(basename "$f") applies"; }
done
ok "migrations 001-158 applied"
psql_ -o /dev/null < "$HERE/ahl-fixture.sql"
check "fixture: 3 seasons" "$(psql_ -c 'select count(*) from legacy_wikipedia_hockey_minor.season')" "3"

# the seed
seedq() { printf '%s\n' "create temp table s (club text, league text, first_year int, last_year int, franchise text, country text, display text, note text, loc text, nick text);" \
  "\\copy s from 'db/seed/hockey_minor_club.csv' with (format csv, header true)" "$1" | psql_; }
check "seed: rows" "$(seedq "select count(*) from s")" "$(( $(wc -l < "$REPO/db/seed/hockey_minor_club.csv") - 1 ))"
check "seed: no club name fits two rows in one year" "$(seedq "select count(*) from s a join s b on lower(a.club) = lower(b.club) and a.league = b.league and a.ctid < b.ctid and a.first_year <= b.last_year and b.first_year <= a.last_year")" "0"

step() { psql_ -f "db/build/$1.sql" >/dev/null; }
step 229_ahl_from_wikipedia
q() { psql_ -c "$1"; }
check "seasons" "$(q "select count(*) from core.season where league_code = 'ahl'")" "3"
check "team seasons" "$(q "select count(*) from core.team_season t join core.season s using (season_id) where s.league_code = 'ahl'")" "53"
check "standings (9 + 13 + 31)" "$(q "select count(*) from core.standing where source_key like 'wpahl:%'")" "53"
check "series (5 + 7 + 15)" "$(q "select count(*) from core.series where source_key like 'wpahl:%'")" "27"
check "games (40 + 71)" "$(q "select count(*) from core.game where source_key like 'wpahl:%'")" "111"
check "champions" "$(q "select string_agg(s.start_year || ' ' || w.winner_name, ', ' order by s.start_year) from core.award_winner w join core.season s using (season_id) where w.source_key like 'wpahlchamp:%'")" "1940 Cleveland Barons, 1985 Adirondack Red Wings, 2018 Charlotte Checkers"
check "a standing line (Hershey 1985-86: 80 48 29 3 99 346 292)" "$(q "select concat_ws(' ', games_played, wins, losses, ties, points, points_for, points_against) from core.standing st join core.team_season t using (team_season_id) join core.season s using (season_id) join core.franchise_identity i using (franchise_identity_id) where s.start_year = 1985 and i.full_name = 'Hershey Bears' and s.league_code = 'ahl'")" "80 48 29 3 99 346 292"
check "overtime and shootout losses together (Charlotte 2018-19: 7 + 1)" "$(q "select concat_ws(' ', ot_losses, shootout_losses) from core.standing st join core.team_season t using (team_season_id) join core.franchise_identity i using (franchise_identity_id) join core.season s using (season_id) where s.start_year = 2018 and i.full_name = 'Charlotte Checkers'")" "8 1"
check "a series (1985 final: Adirondack 4-2 Hershey)" "$(q "select concat_ws(' ', x.round_label, x.higher_seed_wins, x.lower_seed_wins) from core.series x join core.season s using (season_id) where s.start_year = 1985 and x.round_label = 'Calder Cup Final'")" "Calder Cup Final 4 2"
check "the Hershey Bears are one franchise in all three seasons" "$(q "select count(distinct t.franchise_id) from core.team_season t join core.franchise_identity i using (franchise_identity_id) where i.full_name = 'Hershey Bears'")" "1"
fr() { q "select t.franchise_id from core.team_season t join core.franchise_identity i using (franchise_identity_id) join core.season s using (season_id) where s.start_year = $1 and i.full_name = '$2'"; }
check "the Springfield Indians of 1940 are the Utica Comets of 2018 (Indians, IceCats, Rivermen, Comets, Canucks)" "$(fr 1940 'Springfield Indians')" "$(fr 2018 'Utica Comets')"
check "the Maine Mariners of 1985 are the Stockton Heat of 2018" "$(fr 1985 'Maine Mariners')" "$(fr 2018 'Stockton Heat')"
check "and not the Providence Bruins of 2018, who began as the second Maine Mariners of 1987" "$([ "$(fr 1985 'Maine Mariners')" != "$(fr 2018 'Providence Bruins')" ] && echo different)" "different"
check "no franchise has two clubs in one season" "$(q "select count(*) from (select franchise_id, season_id from core.team_season group by 1, 2 having count(*) > 1) x")" "0"
check "data issues: unmatched names" "$(q "select count(*) from meta.data_issue where issue like 'AHL: club name not matched%'")" "0"

keys() { q "select md5(string_agg(x, ',' order by x)) from (
    select 'f' || franchise_id || source_key x from core.franchise where source_key like 'ahl:%'
    union all select 'i' || franchise_identity_id || ':' || franchise_id || ':' || lower(valid_during) from core.franchise_identity where franchise_id in (select franchise_id from core.franchise where source_key like 'ahl:%')
    union all select 't' || t.team_season_id || ':' || t.franchise_id || ':' || coalesce(t.franchise_identity_id, 0) from core.team_season t join core.season s using (season_id) where s.league_code = 'ahl'
    union all select 'g' || game_id || source_key from core.game where source_key like 'wpahl:%'
    union all select 's' || series_id || source_key from core.series where source_key like 'wpahl:%'
    union all select 'a' || award_winner_id || source_key from core.award_winner where source_key like 'wpahlchamp:%'
    union all select 'k' || source_key || ':' || wins || ':' || losses from core.standing where source_key like 'wpahl:%') z"; }
before="$(keys)"
step 229_ahl_from_wikipedia; step 229_ahl_from_wikipedia
check "a rerun (twice) changes no id" "$(keys)" "$before"
check "a rerun adds no row" "$(q "select count(*) from core.game where source_key like 'wpahl:%'") $(q "select count(*) from core.series where source_key like 'wpahl:%'") $(q "select count(*) from core.franchise_identity i where franchise_id in (select franchise_id from core.franchise where source_key like 'ahl:%')")" "111 27 $(q "select count(*) from core.franchise_identity i where franchise_id in (select franchise_id from core.franchise where source_key like 'ahl:%')")"

# a game that drops out of a later load: it goes; the other ids stay
gone="$(q "select 'wpahl:1985:playoffs:' || game_date || ':' || home_team || ':' || away_team || ':' || game_seq from legacy_wikipedia_hockey_minor.game where season = 1985 order by game_date, home_team limit 1")"
ids() { q "select md5(string_agg(game_id || source_key, ',' order by game_id)) from core.game where source_key like 'wpahl:%' and source_key <> '$gone'"; }
before3="$(ids)"
psql_ -c "delete from legacy_wikipedia_hockey_minor.game where season = 1985 and 'wpahl:1985:playoffs:' || game_date || ':' || home_team || ':' || away_team || ':' || game_seq = '$gone'" >/dev/null
step 229_ahl_from_wikipedia
check "a game that is no longer told is removed" "$(q "select count(*) from core.game where source_key like 'wpahl:1985:%'")" "39"
check "and the other games kept their ids" "$(ids)" "$before3"

# alignment
step 178_alignment
check "every club of a table has a division" "$(q "select count(*) from core.team_season t join core.season s using (season_id) where s.league_code = 'ahl' and t.division_id is null")" "0"
check "2018-19: Charlotte in the Atlantic Division of the Eastern Conference" "$(q "select concat_ws(' / ', c.name, d.name) from core.team_season t join core.season s using (season_id) join core.franchise_identity i using (franchise_identity_id) join core.division d using (division_id) join core.conference c on c.conference_id = t.conference_id where s.start_year = 2018 and i.full_name = 'Charlotte Checkers'")" "Eastern Conference / Atlantic Division"
check "1985-86: no conferences, North and South Divisions" "$(q "select count(*) filter (where t.conference_id is not null) || ' ' || string_agg(distinct d.name, ', ') from core.team_season t join core.season s using (season_id) join core.division d using (division_id) where s.start_year = 1985 and s.league_code = 'ahl'")" "0 North Division, South Division"
check "1940-41: East and West divisions" "$(q "select string_agg(distinct d.name, ', ') from core.team_season t join core.season s using (season_id) join core.division d using (division_id) where s.start_year = 1940 and s.league_code = 'ahl'")" "East Division, West Division"
before2="$(keys)"
step 178_alignment; step 229_ahl_from_wikipedia
check "178 and 229 again change no id" "$(keys)" "$before2"

# the checks that concern the league
for f in 040_standings_games_played 051_finished_season_champion 052_alignment_missing 093_row_id_drift; do
  base="$(grep -m1 '^-- baseline' "$REPO/db/checks/$f.sql" | grep -o '[0-9]*' || echo 0)"
  rows="$(psql_ < "$REPO/db/checks/$f.sql" | grep -c . || true)"
  if [ "$rows" -le "${base:-0}" ]; then ok "check $f ($rows rows, baseline ${base:-0})"; else bad "check $f ($rows rows, baseline ${base:-0})"; fi
done
echo "passed $pass, failed $fail"
[ "$fail" -eq 0 ]

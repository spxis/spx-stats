#!/bin/bash
# The ECHL build (db/build/233_echl_from_wikipedia.sql, db/seed/hockey_minor_club.csv), its alignment (db/build/178_alignment.sql) and its NHL affiliations (db/build/234_echl_affiliation.sql)
# on a scratch Postgres that has every migration of the repository applied (the two files that only production or a later api object can take are skipped), the rows
# scripts/hockey_minor/season.py loads for 1988-89, 1996-97, 2003-04, 2018-19 and 2019-20 (db/tests/echl-fixture.sql) and an NHL made from api.franchise_names (db/tests/echl-nhl-fixture.sql).
# Checks: the seed names every club once and no franchise twice a season; 233 builds the standings, series, games, champions and franchises it should (the column the 1996-97 article heads T
# is read as overtime losses); a rerun (233 twice more) changes no franchise, identity, team season, game, series, award-winner or standing key; the franchises follow the league's
# moves (the Carolina Thunderbirds of 1988 are the Wheeling Nailers of 2018, the first Cincinnati Cyclones are not the second); 178 gives every club of a division table its division and
# conference; 234 places an NHL parent only when exactly one club fits (by the article the cell links to, a name the club has since dropped, or the abbreviation), keeps the label of any other
# and logs it; a rerun changes no row; the checks of db/checks that concern the league stay at their baseline; the api view answers as the anon role.
# The scratch container is removed by name afterwards.
#   bash db/tests/echl-from-wikipedia.sh            # port 7742, name spx-scratch-echl-test
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="${SCRATCH_NAME:-spx-scratch-echl-test}"
PORT="${SCRATCH_PORT:-7742}"
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
psql_ -o /dev/null < "$HERE/echl-fixture.sql"
check "fixture: 5 seasons" "$(psql_ -c "select count(*) from legacy_wikipedia_hockey_minor.season where league = 'echl'")" "5"

# the seed
seedq() { printf '%s\n' "create temp table s (club text, league text, first_year int, last_year int, franchise text, country text, display text, note text, loc text, nick text);" \
  "\\copy s from 'db/seed/hockey_minor_club.csv' with (format csv, header true)" "$1" | psql_; }
check "seed: rows" "$(seedq "select count(*) from s")" "$(( $(wc -l < "$REPO/db/seed/hockey_minor_club.csv" | tr -d ' ') - 1 ))"
check "seed: no club name fits two rows in one year" "$(seedq "select count(*) from s a join s b on lower(a.club) = lower(b.club) and a.league = b.league and a.ctid < b.ctid and a.first_year <= b.last_year and b.first_year <= a.last_year")" "0"
check "seed: the ECHL has 104 rows and 64 franchises" "$(seedq "select count(*) || ' ' || count(distinct franchise) from s where league = 'echl'")" "104 64"
check "seed: every franchise has a note on its first row" "$(seedq "select count(*) from (select franchise from s where league = 'echl' group by franchise having count(*) filter (where note <> '') <> 1) z")" "0"

step() { psql_ -f "db/build/$1.sql" >/dev/null; }
q() { psql_ -c "$1"; }
step 233_echl_from_wikipedia
check "seasons" "$(q "select count(*) from core.season where league_code = 'echl'")" "5"
check "team seasons (5 + 23 + 31 + 27 + 26)" "$(q "select count(*) from core.team_season t join core.season s using (season_id) where s.league_code = 'echl'")" "112"
check "standings" "$(q "select count(*) from core.standing where source_key like 'wpechl:%'")" "112"
check "series" "$(q "select count(*) from core.series where source_key like 'wpechl:%'")" "49"
check "games" "$(q "select count(*) from core.game where source_key like 'wpechl:%'")" "212"
check "champions" "$(q "select string_agg(s.start_year || ' ' || w.winner_name, ', ' order by s.start_year) from core.award_winner w join core.season s using (season_id) where w.source_key like 'wpechlchamp:%'")" "1988 Carolina Thunderbirds, 1996 South Carolina Stingrays, 2003 Idaho Steelheads, 2018 Newfoundland Growlers"
check "2019-20 has no champion and no series" "$(q "select count(*) from core.series x join core.season s using (season_id) where s.start_year = 2019 and s.league_code = 'echl'")" "0"
check "a standing line (Erie 1988-89: 60 37 20 3 77 327 256)" "$(q "select concat_ws(' ', games_played, wins, losses, ot_losses, points, points_for, points_against) from core.standing st join core.team_season t using (team_season_id) join core.season s using (season_id) join core.franchise_identity i using (franchise_identity_id) where s.start_year = 1988 and i.full_name = 'Erie Panthers' and s.league_code = 'echl'")" "60 37 20 3 77 327 256"
check "1996-97's T column is overtime losses, not ties (South Carolina: 70 45 15 10, no ties)" "$(q "select concat_ws(' ', games_played, wins, losses, ot_losses, coalesce(ties::text, 'none')) from core.standing st join core.team_season t using (team_season_id) join core.season s using (season_id) join core.franchise_identity i using (franchise_identity_id) where s.start_year = 1996 and i.full_name = 'South Carolina Stingrays' and s.league_code = 'echl'")" "70 45 15 10 none"
check "overtime and shootout losses together (Newfoundland 2018-19: 4 + 4)" "$(q "select concat_ws(' ', ot_losses, shootout_losses) from core.standing st join core.team_season t using (team_season_id) join core.franchise_identity i using (franchise_identity_id) join core.season s using (season_id) where s.start_year = 2018 and i.full_name = 'Newfoundland Growlers' and s.league_code = 'echl'")" "8 4"
check "the league allows no ties" "$(q "select string_agg(distinct coalesce(ties_allowed::text, 'null'), ',') from core.season where league_code = 'echl'")" "false"
check "a series (1988-89 final: Carolina 4-3 Johnstown)" "$(q "select concat_ws(' ', x.round_label, x.higher_seed_wins, x.lower_seed_wins) from core.series x join core.season s using (season_id) where s.start_year = 1988 and x.round_label = 'Riley Cup Finals' and s.league_code = 'echl'")" "Riley Cup Finals 4 3"
check "rounds are numbered by stage (2018-19: four rounds, the Kelly Cup Finals last)" "$(q "select string_agg(distinct x.round_number || ' ' || x.round_label, ', ' order by x.round_number || ' ' || x.round_label) from core.series x join core.season s using (season_id) where s.start_year = 2018 and s.league_code = 'echl'")" "1 Division Semifinals, 2 Division Finals, 3 Conference Finals, 4 Kelly Cup Finals"
fr() { q "select t.franchise_id from core.team_season t join core.franchise_identity i using (franchise_identity_id) join core.season s using (season_id) where s.start_year = $1 and i.full_name = '$2' and s.league_code = 'echl'"; }
check "the Carolina Thunderbirds of 1988 are the Wheeling Nailers of 2018" "$(fr 1988 'Carolina Thunderbirds')" "$(fr 2018 'Wheeling Nailers')"
check "the Columbus Chill of 1996 are the Reading Royals of 2003 and 2018" "$(fr 1996 'Columbus Chill')" "$(fr 2003 'Reading Royals')"
check "the Atlantic City Boardwalk Bullies of 2003 are the Adirondack Thunder of 2018" "$(fr 2003 'Atlantic City Boardwalk Bullies')" "$(fr 2018 'Adirondack Thunder')"
check "the Johnstown Chiefs of 2003 are the Greenville Swamp Rabbits of 2018" "$(fr 2003 'Johnstown Chiefs')" "$(fr 2018 'Greenville Swamp Rabbits')"
check "the Cincinnati Cyclones of 2003 are not the first Cyclones' franchise (the Atlantic City Bullies)" "$([ "$(fr 2003 'Cincinnati Cyclones')" != "$(fr 2003 'Atlantic City Boardwalk Bullies')" ] && echo different)" "different"
check "the Cincinnati Cyclones of 2003 and 2018 are one franchise" "$(fr 2003 'Cincinnati Cyclones')" "$(fr 2018 'Cincinnati Cyclones')"
check "no franchise has two clubs in one season" "$(q "select count(*) from (select franchise_id, season_id from core.team_season group by 1, 2 having count(*) > 1) x")" "0"
check "no ECHL club is an NHL or AHL franchise (every ECHL franchise is its own)" "$(q "select count(*) from core.franchise f where f.source_key like 'echl:%' and exists (select 1 from core.franchise_league l where l.franchise_id = f.franchise_id and l.league_code <> 'echl')")" "0"
check "data issues: unmatched names" "$(q "select count(*) from meta.data_issue where issue like 'ECHL: club name not matched%'")" "0"
check "data issues: the T column read as overtime losses, once for 1996-97" "$(q "select count(*) from meta.data_issue where issue like 'ECHL: the 1996-97 standings head a column T%'")" "1"

keys() { q "select md5(string_agg(x, ',' order by x)) from (
    select 'f' || franchise_id || source_key x from core.franchise where source_key like 'echl:%'
    union all select 'i' || franchise_identity_id || ':' || franchise_id || ':' || lower(valid_during) from core.franchise_identity where franchise_id in (select franchise_id from core.franchise where source_key like 'echl:%')
    union all select 't' || t.team_season_id || ':' || t.franchise_id || ':' || coalesce(t.franchise_identity_id, 0) from core.team_season t join core.season s using (season_id) where s.league_code = 'echl'
    union all select 'g' || game_id || source_key from core.game where source_key like 'wpechl:%'
    union all select 's' || series_id || source_key || round_number from core.series where source_key like 'wpechl:%'
    union all select 'a' || award_winner_id || source_key from core.award_winner where source_key like 'wpechlchamp:%'
    union all select 'k' || source_key || ':' || wins || ':' || losses from core.standing where source_key like 'wpechl:%') z"; }
before="$(keys)"
step 233_echl_from_wikipedia; step 233_echl_from_wikipedia
check "a rerun (twice) changes no id" "$(keys)" "$before"
check "a rerun adds no row" "$(q "select count(*) from core.game where source_key like 'wpechl:%'") $(q "select count(*) from core.series where source_key like 'wpechl:%'")" "212 49"

# a game that drops out of a later load: it goes; the other ids stay
gone="$(q "select 'wpechl:1988:playoffs:' || game_date || ':' || home_team || ':' || away_team || ':' || game_seq from legacy_wikipedia_hockey_minor.game where league = 'echl' and season = 1988 order by game_date, home_team limit 1")"
ids() { q "select md5(string_agg(game_id || source_key, ',' order by game_id)) from core.game where source_key like 'wpechl:%' and source_key <> '$gone'"; }
before3="$(ids)"
psql_ -c "delete from legacy_wikipedia_hockey_minor.game where league = 'echl' and season = 1988 and 'wpechl:1988:playoffs:' || game_date || ':' || home_team || ':' || away_team || ':' || game_seq = '$gone'" >/dev/null
step 233_echl_from_wikipedia
check "a game that is no longer told is removed" "$(q "select count(*) from core.game where source_key like 'wpechl:1988:%'")" "6"
check "and the other games kept their ids" "$(ids)" "$before3"

# alignment
step 178_alignment
check "every club of a division table has a division" "$(q "select count(*) from core.team_season t join core.season s using (season_id) where s.league_code = 'echl' and s.start_year <> 1988 and t.division_id is null")" "0"
check "2018-19: Newfoundland in the North Division of the Eastern Conference" "$(q "select concat_ws(' / ', c.name, d.name) from core.team_season t join core.season s using (season_id) join core.franchise_identity i using (franchise_identity_id) join core.division d using (division_id) join core.conference c on c.conference_id = t.conference_id where s.start_year = 2018 and i.full_name = 'Newfoundland Growlers'")" "Eastern Conference / North Division"
check "2003-04: Wheeling in the Northern Division of the Eastern Conference" "$(q "select concat_ws(' / ', c.name, d.name) from core.team_season t join core.season s using (season_id) join core.franchise_identity i using (franchise_identity_id) join core.division d using (division_id) join core.conference c on c.conference_id = t.conference_id where s.start_year = 2003 and i.full_name = 'Wheeling Nailers' and s.league_code = 'echl'")" "Eastern Conference / Northern Division"
check "1988-89 and 1996-97: no conferences; 1996-97 East, North and South Divisions" "$(q "select count(*) filter (where t.conference_id is not null) || ' ' || coalesce(string_agg(distinct d.name, ', '), '') from core.team_season t join core.season s using (season_id) left join core.division d using (division_id) where s.start_year in (1988, 1996) and s.league_code = 'echl'")" "0 East Division, North Division, South Division"
before2="$(keys)"
step 178_alignment; step 233_echl_from_wikipedia
check "178 and 233 again change no id" "$(keys)" "$before2"

# affiliations: an NHL with names and abbreviations by date, then lines a club of a later name or no club can take
psql_ -o /dev/null < "$HERE/echl-nhl-fixture.sql"
psql_ -c "update legacy_wikipedia_hockey_minor.team_season set affiliation = 'XXX', affiliation_links = 'Gotham Rangers' where league = 'echl' and season = 2018 and team_name = 'Maine Mariners';
          update legacy_wikipedia_hockey_minor.team_season set affiliation = 'ARI', affiliation_links = 'Arizona Coyotes' where league = 'echl' and season = 2003 and team_name = 'Wheeling Nailers';
          update legacy_wikipedia_hockey_minor.team_season set affiliation = 'WPG', affiliation_links = 'Winnipeg Jets' where league = 'echl' and season = 2003 and team_name = 'Johnstown Chiefs'" >/dev/null
step 234_echl_affiliation
aq() { q "select concat_ws(' ', a.label, coalesce(pi.full_name, 'none'), a.position) from core.team_season_affiliation a join core.team_season t using (team_season_id) join core.season s using (season_id) join core.franchise_identity i using (franchise_identity_id) left join core.franchise_identity pi on pi.franchise_id = a.parent_franchise_id and pi.valid_during @> make_date(s.start_year, 11, 15) where s.league_code = 'echl' and s.start_year = $1 and i.full_name = '$2' order by a.position"; }
check "2018-19: Newfoundland's NHL parent is the Maple Leafs, placed by the article the cell links to" "$(aq 2018 'Newfoundland Growlers')" "TOR Toronto Maple Leafs 1"
check "2018-19: Greenville was independent: no parent" "$(aq 2018 'Greenville Swamp Rabbits')" "independent none 1"
check "2018-19: a club the article names that no NHL club answers to keeps its label and no parent" "$(aq 2018 'Maine Mariners')" "XXX none 1"
check "a club named by the name it took later (the Arizona Coyotes, in 2003-04, when they were the Phoenix Coyotes) is placed on the one NHL club of that season that has had the name" "$(aq 2003 'Wheeling Nailers')" "PHX Phoenix Coyotes 1"
check "a name two NHL clubs of that season have had (the Winnipeg Jets, in 2003-04) places no one" "$(aq 2003 'Johnstown Chiefs')" "WPG none 1"
check "the standings of 1988-89, 1996-97 and the rest of 2003-04 print no NHL club, so there is no row" "$(q "select count(*) from core.team_season_affiliation a join core.team_season t using (team_season_id) join core.season s using (season_id) join core.franchise_identity i using (franchise_identity_id) where s.league_code = 'echl' and (s.start_year in (1988, 1996) or (s.start_year = 2003 and i.full_name not in ('Wheeling Nailers', 'Johnstown Chiefs')))")" "0"
check "the two unplaced lines are logged" "$(q "select count(*) from meta.data_issue where issue like 'ECHL affiliation:%'")" "2"
akeys() { q "select md5(string_agg(team_season_id || ':' || position || ':' || label || ':' || coalesce(parent_franchise_id, 0), ',' order by team_season_id, position)) from core.team_season_affiliation"; }
a1="$(akeys)"; step 234_echl_affiliation; step 234_echl_affiliation
check "a rerun of 234 (twice) changes no row" "$(akeys)" "$a1"
check "the api view answers as the anon role" "$(psql_ -c "set role anon; select count(*) from api.team_season_affiliation where league = 'echl' and year = 2018")" "$(q "select count(*) from core.team_season_affiliation a join core.team_season t using (team_season_id) join core.season s using (season_id) where s.league_code = 'echl' and s.start_year = 2018")"

# the checks that concern the league
for f in 040_standings_games_played 051_finished_season_champion 052_alignment_missing 093_row_id_drift 104_team_season_affiliation; do
  base="$(grep -m1 '^-- baseline' "$REPO/db/checks/$f.sql" | grep -o '[0-9]*' || echo 0)"
  rows="$(psql_ < "$REPO/db/checks/$f.sql" | grep -c . || true)"
  if [ "$rows" -le "${base:-0}" ]; then ok "check $f ($rows rows, baseline ${base:-0})"; else bad "check $f ($rows rows, baseline ${base:-0})"; fi
done
echo "passed $pass, failed $fail"
[ "$fail" -eq 0 ]

#!/bin/bash
# db/build/242 (nflverse) and 243 (CollegeFootballData) betting lines on a scratch Postgres with the real schema (every migration applied) and a few hand-made rows:
# lines land on the right game with the favourite, spread, money line and total as the source states them; a game CFBD lists with its home side as our away side flips the
# favourite; a spread of 0 has no favourite; an impossible total is a hole; an opening line is its own row; a game with no counterpart gets no line; a rerun changes nothing
# and no id; lines deleted with their game come back with the remembered id; a line the source drops is deleted and nothing else is.
#   bash db/tests/betting-lines.sh            # port 7745, name spx-scratch-betting-lines
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="${SCRATCH_NAME:-spx-scratch-betting-lines}"
PORT="${SCRATCH_PORT:-7745}"
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

# ---- college football: Wikipedia's games (230) from hand-made rows, then CFBD's
H -f - <<'SQL'
insert into legacy_wikipedia_ncaaf.season (season, page_title, fetched_on, teams, champion, champion_basis, infobox_champions) values (2013, 'x', '2026-10-29', 3, 'Alpha Aces', 'game: Test Bowl - National Championship Game', 'Alpha');
insert into legacy_wikipedia_ncaaf.team_season values
 (2013, 'Alpha Aces', 'Alpha', 'a', 1, 'fbs', 'Big Conference', 'North Division', null, null, 4),
 (2013, 'Beta Bears', 'Beta', 'b', 1, 'fbs', 'Big Conference', 'South Division', null, null, 3),
 (2013, 'Syracuse Orange', 'Syracuse', 'c', 1, 'fbs', 'Other Conference', null, null, null, 3),
 (2013, 'Delta State Dukes', 'Delta State', null, null, 'other', null, null, null, null, 1);
insert into legacy_wikipedia_ncaaf.standing values
 (2013, 'Alpha Aces', 'Big Conference', 'North Division', 1, 1, 0, null, 3, 0, null, true, true, true, false),
 (2013, 'Beta Bears', 'Big Conference', 'South Division', 1, 0, 1, null, 1, 2, null, true, false, false, false),
 (2013, 'Syracuse Orange', 'Other Conference', null, 1, 0, 0, null, 2, 1, null, false, false, false, false);
insert into legacy_wikipedia_ncaaf.game values
 (2013, 'regular', '2013-09-01'::date, null, 'Alpha Aces', 'Beta Bears', 30, 10, false, false, 'Stadium', 50000, 2, null, 'Alpha Aces', 1, false),
 (2013, 'regular', '2013-09-08'::date, null, 'Syracuse Orange', 'Delta State Dukes', 28, 7, false, false, null, null, 1, null, 'Syracuse Orange', 1, true),
 (2013, 'regular', '2013-09-15'::date, null, 'Syracuse Orange', 'Beta Bears', 14, 21, true, false, null, null, 2, 'scores 1-2 / 3-4 | kept: Beta Bears', 'Beta Bears', 1, false),
 (2013, 'regular', '2013-09-22'::date, null, 'Alpha Aces', 'Syracuse Orange', 35, 14, false, true, null, null, 2, null, 'Alpha Aces', 1, false),
 (2013, 'playoffs', '2014-01-02'::date, 'Test Bowl - National Championship Game', 'Alpha Aces', 'Beta Bears', 24, 20, false, true, null, null, 2, null, 'Alpha Aces', 1, false);
SQL
(cd "$REPO" && H -f db/build/230_ncaaf_from_wikipedia.sql > /dev/null) && ok "step 230 runs" || bad "step 230 failed"

# CFBD: game 1 as ours (Alpha home); game 3 with the sides the other way round (Beta home, a day later: CFBD dates are UTC); game 4 as ours; the Delta State game; a game ours lacks
H -f - <<'SQL'
insert into legacy_cfbd.game (game_id, season, week, season_type, start_date, home_team, away_team, home_points, away_points, fetched_on, source_key) values
 (1001, 2013, 1, 'regular', '2013-09-01 23:00+00', 'Alpha', 'Beta', 30, 10, '2026-10-28', 'cfbd:game:1001'),
 (1003, 2013, 3, 'regular', '2013-09-16 00:30+00', 'Beta', 'Syracuse', 21, 14, '2026-10-28', 'cfbd:game:1003'),
 (1004, 2013, 4, 'regular', '2013-09-22 23:00+00', 'Alpha', 'Syracuse', 35, 14, '2026-10-28', 'cfbd:game:1004'),
 (1005, 2013, 2, 'regular', '2013-09-08 23:00+00', 'Syracuse', 'Delta State', 28, 7, '2026-10-28', 'cfbd:game:1005'),
 (1099, 2013, 5, 'regular', '2013-10-05 23:00+00', 'Nowhere', 'Beta', 3, 0, '2026-10-28', 'cfbd:game:1099');
insert into legacy_cfbd.betting_line (game_id, provider, season, spread, formatted_spread, spread_open, over_under, over_under_open, home_moneyline, away_moneyline, fetched_on, source_key) values
 (1001, 'Bovada', 2013, -7.5, 'Alpha -7.5', -7, 50.5, 51, -300, 250, '2026-10-28', 'cfbd:line:1001:Bovada'),
 (1001, 'consensus', 2013, -7, 'Alpha -7', null, null, null, null, null, '2026-10-28', 'cfbd:line:1001:consensus'),
 (1003, 'Bovada', 2013, 3, 'Syracuse -3', null, -1, null, 140, -160, '2026-10-28', 'cfbd:line:1003:Bovada'),
 (1004, 'Bovada', 2013, 0, 'Alpha -0', null, 44, null, -110, -110, '2026-10-28', 'cfbd:line:1004:Bovada'),
 (1005, 'Bovada', 2013, null, 'Syracuse -', null, null, null, null, null, '2026-10-28', 'cfbd:line:1005:Bovada'),
 (1099, 'Bovada', 2013, -3, 'Nowhere -3', null, 40, null, null, null, '2026-10-28', 'cfbd:line:1099:Bovada');
SQL
BUILD243() { (cd "$REPO" && H -f db/build/243_betting_line_cfbd.sql > /dev/null); }
SNAP() { H -c "select betting_line_id, game_id, source_key, coalesce(set_by,''), coalesce(line_moment,''), coalesce(favourite,''), coalesce(point_spread::text,''), coalesce(favourite_money_line::text,''), coalesce(total::text,'') from core.betting_line order by source_key"; }
BUILD243 && ok "step 243 runs" || bad "step 243 failed"
G() { H -c "select game_id from core.game where source_key like 'wpncaaf:2013:regular:$1:%'"; }
LINE() { H -c "select favourite, point_spread, favourite_money_line, total, coalesce(line_moment, '-'), set_by from core.betting_line where game_id = $(G "$1") and source_key like 'cfbd:%$2' order by 1" | tr '\n' ';'; }
eq "rows: 2 + 1 open + 1 + 1" "$(H -c "select count(*) from core.betting_line where source_key like 'cfbd:%'")" "5"
eq "home favourite, spread, money line, total" "$(LINE 2013-09-01 ':Bovada')" "home|7.5|-300|50.5|-|Bovada;"
eq "the opening line is its own row" "$(LINE 2013-09-01 ':Bovada:open')" "home|7.0||51.0|open|Bovada;"
eq "a line with no total or money line" "$(LINE 2013-09-01 ':consensus')" "home|7.0|||-|consensus;"
eq "swapped sides: the favourite flips (CFBD away = our home), a negative total is a hole" "$(LINE 2013-09-15 ':Bovada')" "home|3.0|-160||-|Bovada;"
eq "a spread of 0 has no favourite and no money line" "$(LINE 2013-09-22 ':Bovada')" "|0.0||44.0|-|Bovada;"
eq "a line with nothing in it is not written" "$(H -c "select count(*) from core.betting_line where game_id = $(G 2013-09-08)")" "0"
eq "a game with no counterpart in core gets no line" "$(H -c "select count(*) from core.betting_line where source_key like '%Nowhere%'")" "0"
eq "source is cfbd and no CFBD game id is stored" "$(H -c "select count(*) from core.betting_line b join meta.source s using (source_id) where s.code = 'cfbd' and b.source_key ~ ':(1001|1003|1004|1005|1099):'")" "0"
SNAP > "$REPO/.bl-snap1.tmp"; BUILD243; SNAP > "$REPO/.bl-snap2.tmp"
if cmp -s "$REPO/.bl-snap1.tmp" "$REPO/.bl-snap2.tmp"; then ok "a rerun changes no row and no id"; else bad "a rerun changed a row"; fi
# the game goes (230 deletes none, 150 and 155 do): the lines go with it, the map remembers their ids, a rerun gives them back
H -c "insert into ingest.row_id_map (tbl, natural_key, row_id) select tbl, natural_key, id from ingest.row_id_current where tbl = 'core.betting_line' on conflict do nothing"
H -c "delete from core.betting_line where source_key like 'cfbd:%'"; BUILD243; SNAP > "$REPO/.bl-snap3.tmp"
if cmp -s "$REPO/.bl-snap1.tmp" "$REPO/.bl-snap3.tmp"; then ok "lines deleted and added again keep their ids"; else bad "a line got a new id"; fi
eq "check 093 stays empty" "$(H -f "$REPO/db/checks/093_row_id_drift.sql" | wc -c | tr -d ' ')" "0"
# CFBD drops a line: only that one goes; another source's line stays
H -c "insert into core.betting_line (game_id, source_id, source_key, favourite, point_spread) select game_id, source_id, 'spx:odds:1', 'home', 1 from core.betting_line where source_key like 'cfbd:%Bovada' limit 1"
H -c "delete from legacy_cfbd.betting_line where game_id = 1001 and provider = 'consensus'"; BUILD243
eq "a dropped line is deleted" "$(H -c "select count(*) from core.betting_line where source_key like 'cfbd:%consensus'")" "0"
eq "and the others stay" "$(H -c "select count(*) from core.betting_line where source_key like 'cfbd:%'")" "4"
eq "another source's line stays" "$(H -c "select count(*) from core.betting_line where source_key = 'spx:odds:1'")" "1"
rm -f "$REPO"/.bl-snap*.tmp

# ---- the NFL: nflverse's own columns, joined through core.external_id
H -f - <<'SQL'
insert into meta.source (code, name, kind, licence, attribution) values ('nflverse', 'nflverse', 'dataset', 'CC BY 4.0', 'NFL data from nflverse')
  on conflict (code) do nothing;
insert into ref.sport (sport_code, name) values ('american_football', 'American football') on conflict do nothing;
insert into ref.league (league_code, sport_code, country_code, founded_on) values ('nfl', 'american_football', 'US', date '1920-09-17') on conflict do nothing;
insert into core.season (league_code, start_year, end_year, label) values ('nfl', 2014, 2015, '2014');
insert into core.franchise (sport_code, source_key) values ('american_football', 'nfl:a'), ('american_football', 'nfl:b');
insert into core.team_season (franchise_id, season_id) select f.franchise_id, s.season_id from core.franchise f, core.season s where f.source_key in ('nfl:a', 'nfl:b') and s.league_code = 'nfl';
insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, status, home_score, away_score, source_id, source_key)
select s.season_id, 'regular', d, h.team_season_id, a.team_season_id, 'final', 20, 10, (select source_id from meta.source where code = 'nflverse'), k
from core.season s, core.franchise fh, core.franchise fa, core.team_season h, core.team_season a, (values (date '2014-09-07', 'nflverse:2014_01_B_A'), (date '2014-09-14', 'nflverse:2014_02_A_B'), (date '2014-09-21', 'nflverse:2014_03_B_A'), (date '2014-09-28', 'nflverse:2014_04_A_B')) v(d, k)
where s.league_code = 'nfl' and fh.source_key = 'nfl:a' and fa.source_key = 'nfl:b' and h.franchise_id = fh.franchise_id and a.franchise_id = fa.franchise_id;
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'game', game_id, source_id, substring(source_key from 10) from core.game where source_key like 'nflverse:2014%';
insert into legacy_nflverse.game (game_id, season, game_type, week, gameday, away_team, home_team, row) values
 ('2014_01_B_A', 2014, 'REG', 1, '2014-09-07', 'B', 'A', '{"spread_line": "-3.5", "total_line": "44.5", "home_moneyline": "150", "away_moneyline": "-170"}'),
 ('2014_02_A_B', 2014, 'REG', 2, '2014-09-14', 'A', 'B', '{"spread_line": "6", "total_line": "41", "home_moneyline": "-250", "away_moneyline": "210"}'),
 ('2014_03_B_A', 2014, 'REG', 3, '2014-09-21', 'B', 'A', '{"spread_line": "0", "total_line": "40", "home_moneyline": "-110", "away_moneyline": "-110"}'),
 ('2014_04_A_B', 2014, 'REG', 4, '2014-09-28', 'A', 'B', '{"spread_line": null, "total_line": null, "home_moneyline": null, "away_moneyline": null}');
SQL
BUILD242() { (cd "$REPO" && H -f db/build/242_betting_line_nflverse.sql > /dev/null); }
BUILD242 && ok "step 242 runs" || bad "step 242 failed"
NL() { H -c "select favourite, point_spread, favourite_money_line, total, coalesce(line_moment, '-') from core.betting_line where source_key = 'nflverse:line:$1'"; }
eq "negative spread: the away side is the favourite, its money line" "$(NL 2014_01_B_A)" "away|3.5|-170|44.5|-"
eq "positive spread: the home side is the favourite, its money line" "$(NL 2014_02_A_B)" "home|6.0|-250|41.0|-"
eq "a pick'em has no favourite" "$(NL 2014_03_B_A)" "|0.0||40.0|-"
eq "a game with no line gets no row" "$(H -c "select count(*) from core.betting_line where source_key = 'nflverse:line:2014_04_A_B'")" "0"
eq "set_by and recorded_at stay empty (the source does not say)" "$(H -c "select count(*) from core.betting_line where source_key like 'nflverse:%' and (set_by is not null or recorded_at is not null)")" "0"
SNAP > "$REPO/.bl-snap1.tmp"; BUILD242; SNAP > "$REPO/.bl-snap2.tmp"
if cmp -s "$REPO/.bl-snap1.tmp" "$REPO/.bl-snap2.tmp"; then ok "a rerun changes no row and no id"; else bad "a rerun changed a row"; fi
H -c "insert into ingest.row_id_map (tbl, natural_key, row_id) select tbl, natural_key, id from ingest.row_id_current where tbl = 'core.betting_line' on conflict do nothing"
H -c "delete from core.betting_line where source_key like 'nflverse:%'"; BUILD242; SNAP > "$REPO/.bl-snap3.tmp"
if cmp -s "$REPO/.bl-snap1.tmp" "$REPO/.bl-snap3.tmp"; then ok "lines deleted with their game keep their ids"; else bad "a line got a new id"; fi
H -c "update legacy_nflverse.game set row = jsonb_set(row, '{spread_line}', '\"-4\"') where game_id = '2014_01_B_A'"; BUILD242
eq "a changed line is updated in place" "$(NL 2014_01_B_A)" "away|4.0|-170|44.5|-"
eq "the same id after the update" "$(H -c "select count(*) from core.betting_line where source_key = 'nflverse:line:2014_01_B_A' and betting_line_id = (select min(betting_line_id) from core.betting_line where source_key like 'nflverse:%')")" "1"
H -c "update legacy_nflverse.game set row = '{}' where game_id = '2014_02_A_B'"; BUILD242
eq "a line nflverse no longer carries is deleted, the others stay" "$(H -c "select count(*) from core.betting_line where source_key like 'nflverse:%'")" "2"
eq "the CFBD lines were not touched by 242" "$(H -c "select count(*) from core.betting_line where source_key like 'cfbd:%'")" "4"
rm -f "$REPO"/.bl-snap*.tmp

# ---- the loader: games.csv files -> legacy_nflverse.game, a later file wins, a second run touches nothing
CSVD="$(mktemp -d)"
printf 'game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score,location,overtime,stadium,spread_line,total_line,home_moneyline,away_moneyline\n2014_05_A_B,2014,REG,5,2014-10-05,13:00,A,NA,B,NA,Home,NA,"Test ""Park""",NA,NA,NA,NA\n2014_06_B_A,2014,REG,6,2014-10-12,,B,17,A,20,Home,1,Test Park,-2.5,43,-140,120\n' > "$CSVD/one.csv"
printf 'game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score,location,overtime,stadium,spread_line,total_line,home_moneyline,away_moneyline\n2014_05_A_B,2014,REG,5,2014-10-05,13:00,A,NA,B,NA,Home,NA,"Test ""Park""",-1,41,-115,-105\n' > "$CSVD/two.csv"
LOADG() { (cd "$REPO" && python3 -I scripts/nflverse/games_load.py "$@" --out "$CSVD/load.sql" > /dev/null && sed -E '/^[[:space:]]*(begin|commit)[[:space:]]*;[[:space:]]*$/Id' "$CSVD/load.sql" | H -1 -o /dev/null); }
XM() { H -c "select string_agg(xmin::text, ',' order by game_id) from legacy_nflverse.game where game_id in ('2014_05_A_B', '2014_06_B_A')"; }
LOADG "$CSVD/one.csv" && ok "the load file applies"
eq "two games, NA is null, a quote and a missing time survive" "$(H -c "select count(*) || '|' || count(week) || '|' || count(home_score) || '|' || count(gametime) || '|' || bool_or(stadium = 'Test \"Park\"')::text from legacy_nflverse.game where game_id in ('2014_05_A_B', '2014_06_B_A')")" "2|2|1|1|true"
eq "overtime 1 is true" "$(H -c "select overtime from legacy_nflverse.game where game_id = '2014_06_B_A'")" "t"
x1="$(XM)"; LOADG "$CSVD/one.csv"; eq "a second run touches no game" "$(XM)" "$x1"
LOADG "$CSVD/one.csv" "$CSVD/two.csv"
eq "a later file replaces the game, the other stays" "$(H -c "select row->>'spread_line' || '|' || (select row->>'spread_line' from legacy_nflverse.game where game_id = '2014_06_B_A') from legacy_nflverse.game where game_id = '2014_05_A_B'")" "-1|-2.5"
rm -rf "$CSVD"

# ---- the coverage query runs and counts a game once
H -f "$REPO/db/review/betting_line_coverage.sql" > "$REPO/.bl-cov.tmp"
eq "coverage: nfl 2014" "$(grep '^nfl|2014|' "$REPO/.bl-cov.tmp")" "nfl|2014|4|2|50.0|0|2|0"
eq "coverage: ncaaf 2013" "$(grep '^ncaaf|2013|' "$REPO/.bl-cov.tmp")" "ncaaf|2013|5|3|60.0|0|0|3"
rm -f "$REPO/.bl-cov.tmp"
echo "$pass passed, $fail failed"; [ "$fail" = 0 ]

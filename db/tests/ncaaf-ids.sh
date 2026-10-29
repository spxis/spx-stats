#!/bin/bash
# db/build/230_ncaaf_from_wikipedia.sql on a scratch Postgres with the real schema (every migration applied) and a few hand-made legacy rows:
# a rerun gives every game, team season, identity, franchise, conference, division and winner the id it had; a season added later leaves the
# earlier ids alone; a renamed program (Syracuse Orangemen -> Orange, db/seed/ncaaf_program.csv) is one franchise with two identities; a standing
# that disagrees with the games is left out; the national champion is written; a team outside the division has the pseudo conference and no league span.
#   bash db/tests/ncaaf-ids.sh            # port 7742, name spx-scratch-ncaaf-ids
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="${SCRATCH_NAME:-spx-scratch-ncaaf-ids}"
PORT="${SCRATCH_PORT:-7742}"
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

LOAD() {   # LOAD season ... : hand-made rows for one season
H -f - <<SQL
delete from legacy_wikipedia_ncaaf.game where season = $1; delete from legacy_wikipedia_ncaaf.standing where season = $1;
delete from legacy_wikipedia_ncaaf.team_season where season = $1; delete from legacy_wikipedia_ncaaf.season where season = $1;
insert into legacy_wikipedia_ncaaf.season (season, page_title, fetched_on, teams, champion, champion_basis, infobox_champions) values ($1, 'x', '2026-10-29', 3, 'Alpha Aces', 'game: Test Bowl - National Championship Game', 'Alpha');
insert into legacy_wikipedia_ncaaf.team_season values
 ($1, 'Alpha Aces', 'Alpha', 'a', 1, 'fbs', 'Big Conference', 'North Division', null, null, 4),
 ($1, 'Beta Bears', 'Beta', 'b', 1, 'fbs', 'Big Conference', 'South Division', null, null, 3),
 ($1, '$2', 'Syracuse', 'c', 1, 'fbs', 'Other Conference', null, null, null, 3),
 ($1, 'Delta State Dukes', 'Delta State', null, null, 'other', null, null, null, null, 1);
insert into legacy_wikipedia_ncaaf.standing values
 ($1, 'Alpha Aces', 'Big Conference', 'North Division', 1, 1, 0, null, 3, 0, null, true, true, true, false),
 ($1, 'Beta Bears', 'Big Conference', 'South Division', 1, 0, 1, null, 1, 2, null, true, false, false, false),
 ($1, '$2', 'Other Conference', null, 1, 0, 0, null, 2, 1, null, false, false, false, false);
insert into legacy_wikipedia_ncaaf.game values
 ($1, 'regular', '$1-09-01'::date, null, 'Alpha Aces', 'Beta Bears', 30, 10, false, false, 'Stadium', 50000, 2, null, 'Alpha Aces', 1, false),
 ($1, 'regular', '$1-09-08'::date, null, '$2', 'Delta State Dukes', 28, 7, false, false, null, null, 1, null, '$2', 1, true),
 ($1, 'regular', '$1-09-15'::date, null, '$2', 'Beta Bears', 14, 21, true, false, null, null, 2, 'scores 1-2 / 3-4 | kept: Beta Bears', 'Beta Bears', 1, false),
 ($1, 'regular', '$1-09-22'::date, null, 'Alpha Aces', '$2', 35, 14, false, true, null, null, 2, null, 'Alpha Aces', 1, false),
 ($1, 'playoffs', (($1 + 1) || '-01-02')::date, 'Test Bowl - National Championship Game', 'Alpha Aces', 'Beta Bears', 24, 20, false, true, null, null, 2, null, 'Alpha Aces', 1, false);
SQL
}
BUILD() { (cd "$REPO" && H -f db/build/230_ncaaf_from_wikipedia.sql > /dev/null); }
SNAP() { H -c "select 'g',game_id,source_key from core.game union all select 'i',franchise_identity_id,franchise_id||'/'||lower(valid_during) from core.franchise_identity
  union all select 't',team_season_id,franchise_id||'/'||season_id from core.team_season union all select 'c',conference_id,name from core.conference
  union all select 'd',division_id,name from core.division union all select 'f',franchise_id,source_key from core.franchise
  union all select 'w',award_winner_id,source_key from core.award_winner order by 1,2"; }

LOAD 2003 "Syracuse Orangemen"; LOAD 2004 "Syracuse Orange"
BUILD && ok "step 230 runs" || bad "step 230 failed"
SNAP > "$REPO/.ncaaf-snap1.tmp"; BUILD; SNAP > "$REPO/.ncaaf-snap2.tmp"
if cmp -s "$REPO/.ncaaf-snap1.tmp" "$REPO/.ncaaf-snap2.tmp"; then ok "a rerun changes no id"; else bad "a rerun changed an id"; fi
LOAD 2005 "Syracuse Orange"; BUILD; SNAP > "$REPO/.ncaaf-snap3.tmp"
if [ -z "$(comm -23 "$REPO/.ncaaf-snap2.tmp" "$REPO/.ncaaf-snap3.tmp")" ]; then ok "a season added later leaves earlier ids alone"; else bad "adding a season changed an earlier id"; fi
rm -f "$REPO"/.ncaaf-snap*.tmp
eq "Syracuse Orangemen and Orange are one franchise" "$(H -c "select count(distinct franchise_id) from core.franchise_identity where full_name like 'Syracuse %'")" "1"
eq "two identities, 2003 and 2004 on" "$(H -c "select count(*) from core.franchise_identity where full_name like 'Syracuse %'")" "2"
eq "games" "$(H -c "select count(*) from core.game")" "15"
eq "bowl game is playoffs" "$(H -c "select count(*) from core.game where phase = 'playoffs'")" "3"
eq "neutral site kept" "$(H -c "select count(*) from core.game where is_neutral_site")" "6"
eq "standings kept only where the games agree" "$(H -c "select count(*) from core.standing where source_key like 'wpncaaf:%'")" "6"
eq "the Syracuse line that disagrees is logged" "$(H -c "select count(*) from meta.data_issue where issue like 'NCAAF: Wikipedia''s standings%'")" "3"
eq "champions" "$(H -c "select count(*) from core.award_winner where source_key like 'wpncaaf:champ:%'")" "3"
eq "outside team has the pseudo conference" "$(H -c "select c.name from core.team_season t join core.franchise_identity i using (franchise_identity_id) join core.conference c using (conference_id) where i.full_name = 'Delta State Dukes' limit 1")" "Non-FBS opponents"
eq "outside team is not a member of the league" "$(H -c "select count(*) from core.franchise_league l join core.franchise_identity i using (franchise_id) where i.full_name = 'Delta State Dukes'")" "0"
eq "divisions" "$(H -c "select count(*) from core.division where league_code = 'ncaaf'")" "2"
eq "log conflicts logged" "$(H -c "select count(*) from meta.data_issue where issue like 'NCAAF: Wikipedia''s two logs%'")" "3"
H -f "$REPO/db/checks/052_alignment_missing.sql" > "$REPO/.ncaaf-chk.tmp"; eq "check 052 stays empty for the league" "$(wc -c < "$REPO/.ncaaf-chk.tmp" | tr -d ' ')" "0"; rm -f "$REPO/.ncaaf-chk.tmp"
echo "$pass passed, $fail failed"; [ "$fail" = 0 ]

#!/bin/bash
# db/build/147_nba_from_wikipedia.sql: a rerun keeps the id of every franchise identity it writes again (core.team_season and the data
# release carry franchise_identity_id), and a league membership comes back with the same key. Scratch Postgres with a small hand-made core
# schema, removed by name. The SQL under test is cut out of the real step file (from "create temp table nbafr" to the founded_on update, and
# the team-season relink), so the test follows the step.
#   bash db/tests/nba-identity-ids.sh            # port 7741, name spx-scratch-nbaident
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
STEP="$REPO/db/build/147_nba_from_wikipedia.sql"
NAME="${SCRATCH_NAME:-spx-scratch-nbaident}"
PORT="${SCRATCH_PORT:-7741}"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && { echo "port $PORT is busy"; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker info >/dev/null 2>&1 || { echo "Docker is not running"; exit 1; }
pass=0 fail=0
ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; }

docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx \
  -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
psql_() { docker exec -i "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }

FRAGMENT="$(awk '/^create temp table nbafr as/{p=1} /^update core.franchise f set founded_on/{p=0} p' "$STEP")"
RELINK="$(awk '/^update core.team_season ts set franchise_identity_id = \(/{p=1} p{print} /^where ts.franchise_identity_id is null/{p=0}' "$STEP")"
[ -n "$FRAGMENT" ] && [ -n "$RELINK" ] || { echo "could not cut the SQL out of $STEP"; exit 1; }

psql_ -o /dev/null <<'SQL'
create extension if not exists btree_gist;
create schema core; create schema meta;
create table meta.source (source_id smallint primary key, code text);
insert into meta.source values (1, 'spx_database'), (2, 'wikipedia_nba');
create table core.season (season_id int primary key, league_code text, start_year int);
insert into core.season select y - 1999, 'nba', y from generate_series(2000, 2026) y;
create table core.franchise (franchise_id int primary key, source_id smallint, source_key text);
insert into core.franchise values (1, 1, 'team:1'), (2, 2, 'nba:2'), (3, 2, 'nba:3');
create table core.franchise_identity (
  franchise_identity_id integer generated always as identity primary key, franchise_id integer not null references core.franchise,
  valid_during daterange not null, location text not null, nickname text not null, full_name text not null, abbreviation text, region text,
  country_code text not null, source_id smallint, exclude using gist (franchise_id with =, valid_during with &&));
create table core.franchise_league (franchise_id integer not null references core.franchise, league_code text not null, valid_during daterange not null,
  source_id smallint, primary key (franchise_id, valid_during), exclude using gist (franchise_id with =, valid_during with &&));
create table core.team_season (team_season_id int generated always as identity primary key, franchise_id int, season_id int, franchise_identity_id int references core.franchise_identity);
-- franchise 1 is SPX's: its own identity to 2004 and its own league row (never touched by the step)
insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, country_code, source_id)
  values (1, daterange('1946-07-01', '2004-07-01'), 'Old', 'Club', 'Old Club', 'US', 1);
insert into core.franchise_league values (1, 'nba', daterange('1946-07-01', '2004-07-01'), 1);
insert into core.team_season (franchise_id, season_id) select f, s from (values (1), (2), (3)) a(f), generate_series(1, 27) s where not (f = 1 and s > 4);
SQL

# one run of the step's identity and league SQL, with the inputs it builds earlier as temp tables ($1 = rename franchise 3 from 2015: yes|no)
run_step() {
  {
    cat <<SQL
create temp table src as select 2::smallint as source_id;
create temp table nm as
  select y yr, 1 franchise_id, 'New Club' full_name, 'Club' nickname from generate_series(2004, 2026) y
  union all select y, 2, case when y < 2010 then 'Alpha Birds' else 'Beta Birds' end, case when y < 2010 then 'Birds' else 'Birds' end from generate_series(2000, 2026) y
  union all select y, 3, case when '$1' = 'yes' and y >= 2015 then 'Gamma Bears' else 'Gamma Bulls' end,
                         case when '$1' = 'yes' and y >= 2015 then 'Bears' else 'Bulls' end from generate_series(2000, 2026) y;
create temp table fr as select distinct franchise_id from nm;
$FRAGMENT
$RELINK
SQL
  } | psql_ -o /dev/null
}
ids() { psql_ -c "select franchise_id || ':' || lower(valid_during) || ':' || full_name || '=' || franchise_identity_id from core.franchise_identity where source_id = 2 order by 1"; }
leagues() { psql_ -c "select franchise_id || ':' || valid_during || ':' || source_id from core.franchise_league order by 1"; }
linked() { psql_ -c "select count(*) from core.team_season ts join core.franchise_identity i using (franchise_identity_id) where ts.franchise_id in (2, 3) and ts.season_id in (select season_id from core.season where league_code = 'nba')"; }

run_step no
A="$(ids)"; LA="$(leagues)"; NA="$(linked)"
[ "$(echo "$A" | wc -l | tr -d ' ')" = 4 ] && ok "first run writes Wikipedia's identities (franchise 1 gets a new-name period, 2 has two names, 3 one)" || bad "first run: $A"
echo "$A" | grep -q '^1:2004-07-01' && ok "the identity fills only what SPX's own leaves uncovered" || bad "franchise 1 identity: $A"
[ "$NA" = 54 ] && ok "the team seasons are linked to an identity" || bad "linked seasons: $NA"

run_step no
B="$(ids)"; LB="$(leagues)"; NB="$(linked)"
[ "$A" = "$B" ] && ok "a rerun keeps every identity id" || bad "ids changed on a rerun: $(diff <(echo "$A") <(echo "$B") | tr '\n' ' ')"
[ "$LA" = "$LB" ] && ok "a rerun gives the league memberships the same keys" || bad "league rows changed on a rerun"
[ "$NB" = "$NA" ] && ok "a rerun relinks the same team seasons" || bad "linked seasons after a rerun: $NB"
[ "$(psql_ -c "select franchise_identity_id from core.franchise_identity where full_name = 'Old Club'")" = 1 ] && ok "SPX's own identity is untouched" || bad "SPX identity changed"

run_step yes
C="$(ids)"
echo "$C" | grep -q '^3:2000-07-01:Gamma Bulls=' && echo "$A" | grep -q '^3:2000-07-01:Gamma Bulls=' || bad "setup: franchise 3 periods ($C)"
OLD3="$(echo "$A" | grep '^3:2000-07-01' | sed 's/.*=//')"; NEW3="$(echo "$C" | grep '^3:2000-07-01' | sed 's/.*=//')"
[ "$OLD3" = "$NEW3" ] && ok "a period that starts the same day keeps its id when its end moves" || bad "period start kept: $OLD3 vs $NEW3"
P2015="$(echo "$C" | grep '^3:2015-07-01' | sed 's/.*=//')"
[ -n "$P2015" ] && ! echo "$A" | grep -q "=$P2015\$" && ok "a new period gets a new id (never one already used)" || bad "new period id: $P2015"
[ "$(echo "$A" | grep -v '^3:' )" = "$(echo "$C" | grep -v '^3:')" ] && ok "the other franchises keep their ids" || bad "other franchises changed"

echo
echo "passed $pass, failed $fail"
[ "$fail" = 0 ]

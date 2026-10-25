#!/bin/bash
# db/build/175_team_brand.sql, the last statements: NBA brand rows of one source with the same values that touch or overlap become the row with
# the lowest id over all their years; other rows, other leagues and other values are left alone; a rerun changes nothing. Scratch Postgres with a
# small hand-made schema, removed by name. The SQL under test is cut out of the real step file (from "create temp table nba_brand_key").
#   bash db/tests/nba-brand-join.sh            # port 7742, name spx-scratch-nbabrand
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
STEP="${STEP:-$REPO/db/build/175_team_brand.sql}"
NAME="${SCRATCH_NAME:-spx-scratch-nbabrand}"
PORT="${SCRATCH_PORT:-7742}"
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

FRAGMENT="$(awk '/^create temp table nba_brand_key as/{p=1} p' "$STEP")"
[ -n "$FRAGMENT" ] || { echo "could not cut the SQL out of $STEP"; exit 1; }
CHECK="$(grep -v '^--' "$REPO/db/checks/099_nba_brand_split.sql")"

psql_ -o /dev/null <<'SQL'
create schema core;
create table core.franchise_league (franchise_id int, league_code text);
insert into core.franchise_league values (1, 'nba'), (2, 'nba'), (3, 'nhl');
create table core.franchise_brand (
  franchise_brand_id integer generated always as identity primary key, franchise_id int not null,
  valid_during daterange not null default daterange(null, null), primary_hex text, secondary_hex text, logo_url text, logo_licence text, logo_page text,
  home_venue text, latitude float8, longitude float8, source_id smallint not null, source_key text not null,
  unique (franchise_id, valid_during, source_id));
-- franchise 1, source 51: cut at 2002-10-10 and 2012-04-27 with the same values (ids 1-3), the whole run added beside them (4), another colour before (5)
insert into core.franchise_brand (franchise_id, valid_during, primary_hex, home_venue, source_id, source_key) values
  (1, '[1997-07-01,2002-10-10)', 'AAAAAA', 'Arena', 51, 'Q1'), (1, '[2002-10-10,2012-04-27)', 'AAAAAA', 'Arena', 51, 'Q1'),
  (1, '[2012-04-27,)', 'AAAAAA', 'Arena', 51, 'Q1'), (1, '[1997-07-01,)', 'AAAAAA', 'Arena', 51, 'Q1'),
  (1, '[1980-07-01,1997-07-01)', 'BBBBBB', 'Arena', 51, 'Q1');
-- franchise 1, source 93, same values: joined on its own (6-8); the tail that ends at 2026-07-01 is absorbed
insert into core.franchise_brand (franchise_id, valid_during, primary_hex, source_id, source_key) values
  (1, '[1997-07-01,2012-04-27)', 'AAAAAA', 93, 'Q1'), (1, '[2012-04-27,2026-07-01)', 'AAAAAA', 93, 'Q1'), (1, '[2012-04-27,)', 'AAAAAA', 93, 'Q1');
-- franchise 2: a gap between the rows (9, 10) and a change of value (11): nothing to join
insert into core.franchise_brand (franchise_id, valid_during, primary_hex, source_id, source_key) values
  (2, '[1990-07-01,2000-07-01)', 'CCCCCC', 93, 'Q2'), (2, '[2001-07-01,2005-07-01)', 'CCCCCC', 93, 'Q2'), (2, '[2005-07-01,)', 'DDDDDD', 93, 'Q2');
-- franchise 3 is not an NBA club (12, 13)
insert into core.franchise_brand (franchise_id, valid_during, primary_hex, source_id, source_key) values
  (3, '[1990-07-01,2000-07-01)', 'EEEEEE', 93, 'Q3'), (3, '[2000-07-01,2005-07-01)', 'EEEEEE', 93, 'Q3');
-- franchise 1, source 51, logo only: an open-ended row on the left joins the touching one (14, 15)
insert into core.franchise_brand (franchise_id, valid_during, logo_url, source_id, source_key) values
  (1, '(,1980-07-01)', 'x.png', 51, 'Q1'), (1, '[1980-07-01,1990-07-01)', 'x.png', 51, 'Q1');
SQL
rows() { psql_ -c "select franchise_brand_id || ':' || franchise_id || ':' || source_id || ':' || valid_during from core.franchise_brand order by franchise_brand_id"; }
run_step() { printf '%s\n' "$FRAGMENT" | psql_ -o /dev/null; }
check() { psql_ -c "$CHECK" | grep -c . || true; }

[ "$(check)" -gt 0 ] && ok "check 099 lists the split rows before the step" || bad "check 099 before"
run_step
A="$(rows)"
echo "$A" | grep -q '^1:1:51:\[1997-07-01,)$' && ok "the cut rows and the whole run become the lowest id over all the years" || bad "franchise 1 colour A: $A"
echo "$A" | grep -q '^[234]:' && bad "rows of the run left: $A" || ok "the other rows of the run are gone"
echo "$A" | grep -q '^5:1:51:\[1980-07-01,1997-07-01)$' && ok "a row of other values is left alone" || bad "colour B row: $A"
echo "$A" | grep -q '^6:1:93:\[1997-07-01,)$' && ! echo "$A" | grep -q '^[78]:' && ok "another source joins on its own, an overlapping tail is absorbed" || bad "source 93: $A"
echo "$A" | grep -q '^9:2:93:\[1990-07-01,2000-07-01)$' && echo "$A" | grep -q '^10:2:93:\[2001-07-01,2005-07-01)$' && ok "a gap keeps two rows" || bad "gap: $A"
echo "$A" | grep -q '^12:3:93:\[1990-07-01,2000-07-01)$' && echo "$A" | grep -q '^13:3:93:\[2000-07-01,2005-07-01)$' && ok "a row of another league is left alone" || bad "franchise 3: $A"
echo "$A" | grep -q '^14:1:51:(,1990-07-01)$' && ok "an open-ended row joins the touching one" || bad "open left: $A"
[ "$(check)" = 0 ] && ok "check 099 has no row after the step" || bad "check 099 after: $(check)"
run_step
[ "$A" = "$(rows)" ] && ok "a rerun changes nothing" || bad "rerun changed rows"

echo
echo "passed $pass, failed $fail"
[ "$fail" = 0 ]

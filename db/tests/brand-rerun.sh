#!/bin/bash
# The brand steps (db/build/175_team_brand.sql, 175_team_logo_extra.sql, 175_team_logo_fit.sql and the NBA join 175_team_logo_join.sql) run in that order
# after any change to franchises, identities or the logo seeds. A second run, and a run right after the build order, must change nothing in
# core.franchise_brand (ids, ranges, every column) or core.logo_fit; it must also delete no row another step wrote.
# The fixture is the history of six real clubs that went wrong on 2026-10-29 (SPX-760): SPX cut its NBA identities at its first and last game,
# step 147 joined them, and brand rows already hold the joined years. Padres, Pistons and Trail Blazers have a Commons logo that "replaces" the one
# Wikidata gave (the step must not clear its own row); Bobcats, New Orleans Hornets and Nets have SportsLogos.Net marks that a joined row already covers
# (the step must not add the seed's own cut beside it). Scratch Postgres with a small hand-made schema, removed by name. The SQL under test is the real
# step files; the seeds are the real db/seed files.
#   bash db/tests/brand-rerun.sh               # port 7746, name spx-scratch-brandrerun
#   BUILD_DIR=/path/to/db/build bash ...       # run another copy of the steps (to see an older version fail)
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BUILD_DIR="${BUILD_DIR:-$REPO/db/build}"
NAME="${SCRATCH_NAME:-spx-scratch-brandrerun}"
PORT="${SCRATCH_PORT:-7746}"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && { echo "port $PORT is busy"; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "${T:-}"; }
trap cleanup EXIT
docker info >/dev/null 2>&1 || { echo "Docker is not running"; exit 1; }
pass=0 fail=0
T="$(mktemp -d)"
ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; }

docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx \
  -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
docker exec "$NAME" mkdir -p /work/db
docker cp "$REPO/db/seed" "$NAME:/work/db/seed"
docker cp "$BUILD_DIR" "$NAME:/work/db/build"
psql_() { docker exec -i -w /work "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }

psql_ -o /dev/null <<'SQL'
create extension if not exists btree_gist;
create schema core; create schema meta; create schema legacy_team_brand; create schema legacy_franchise_info; create schema legacy_game_venue;
create schema legacy_sportslogos;
create table meta.source (source_id smallint primary key, code text unique);
insert into meta.source values (1, 'wikidata'), (2, 'wikipedia'), (3, 'wikimedia_commons'), (4, 'sportslogos');
create table meta.data_issue (data_issue_id serial primary key, source_id smallint, entity_kind text, entity_key text, issue text, resolution text, resolved_at timestamptz);
create table core.franchise (franchise_id int primary key);
create table core.franchise_identity (
  franchise_identity_id integer generated always as identity primary key, franchise_id integer not null references core.franchise,
  valid_during daterange not null, location text, nickname text, full_name text not null);
create table core.franchise_league (franchise_id integer not null references core.franchise, league_code text not null, valid_during daterange);
create table core.franchise_brand (
  franchise_brand_id integer generated always as identity primary key, franchise_id integer not null references core.franchise,
  valid_during daterange not null default daterange(null, null), primary_hex text, secondary_hex text, logo_url text, logo_licence text, logo_page text,
  home_venue text, latitude numeric(8,5), longitude numeric(8,5), source_id smallint not null references meta.source, source_key text not null,
  unique (franchise_id, valid_during, source_id));
create function core.logo_file(url text) returns text language sql immutable parallel safe as $$
  select coalesce(
    (select m[1] || ':' || m[2] from regexp_match(url, '/wikipedia/([^/]+)/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/?]+)') m),
    (select 'sl:' || m[1] from regexp_match(url, '^/team-logos/sl/([^/?]+)$') m)) $$;
create table core.logo_fit (logo_file text primary key, league_code text, team text not null, wordmark boolean not null default false, mark_url text,
  mark_licence text, mark_page text, scale numeric(4,2) not null default 1, dx numeric(5,1) not null default 0, dy numeric(5,1) not null default 0,
  bg text not null default 'auto', status text not null default 'proposed', note text);
create table legacy_team_brand.team (league_code text, qid text, label text, inception date, dissolved date, primary key (league_code, qid));
create table legacy_team_brand.team_colour (qid text, ordinal int, colour_qid text, colour_label text, hex text, rank text);
create table legacy_team_brand.team_logo (qid text, file text, starts_on date, ends_on date, rank text, thumb_url text, file_url text, page_url text,
  licence text, licence_code text, restrictions text);
create table legacy_team_brand.team_place (qid text, kind text, place_qid text, label text, latitude numeric(8,5), longitude numeric(8,5),
  starts_on date, ends_on date, rank text);
create table legacy_team_brand.wikipedia_logo (qid text primary key, league_code text, title text, file text, thumb_url text, file_url text, page_url text,
  licence text, non_free boolean);
create table legacy_team_brand.wikipedia_colour (league_code text, module_page text, entry_key text, seq int, team_name text, start_year int, end_year int,
  alias_of text, resolved_name text, primary_hex text, secondary_hex text);
create table legacy_team_brand.commons_logo (file text primary key, page_url text, file_url text, licence text, restrictions text);
create table legacy_franchise_info.place (qid text primary key, label text, latitude numeric(9,6), longitude numeric(9,6), opened_on date, closed_on date);
create table legacy_game_venue.venue (qid text, label text, latitude numeric(9,6), longitude numeric(9,6));
create table legacy_sportslogos.logo (sl_logo_key text primary key, hosted_path text, page_url text);

-- the clubs (franchise ids 1 to 6); the leagues
insert into core.franchise values (1), (2), (3), (4), (5), (6);
insert into core.franchise_league values (1, 'nba', null), (2, 'mlb', null), (3, 'nba', null), (4, 'nba', null), (5, 'nba', null), (6, 'nba', null);

-- Wikidata: a free logo and dated venues (Pistons, Padres); the Trail Blazers have only the English Wikipedia picture (non-free)
insert into legacy_team_brand.team values ('nba', 'Q1', 'Detroit Pistons', '1941-01-01', null), ('mlb', 'Q2', 'San Diego Padres', '1968-01-01', null),
  ('nba', 'Q3', 'Portland Trail Blazers', '1970-01-01', null);
insert into legacy_team_brand.team_logo values
  ('Q1', 'Logo_of_the_Detroit_Pistons.png', null, null, 'preferred', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/39/Logo_of_the_Detroit_Pistons.png/120px-x.png',
   'https://upload.wikimedia.org/x', 'https://commons.wikimedia.org/wiki/File:Logo_of_the_Detroit_Pistons.png', 'Public domain', 'pd', null),
  ('Q2', 'SD_Logo_Gold.jpg', null, null, 'preferred', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/82/SD_Logo_Gold.jpg/120px-x.jpg',
   'https://upload.wikimedia.org/y', 'https://commons.wikimedia.org/wiki/File:SD_Logo_Gold.jpg', 'Public domain', 'pd', 'trademarked');
insert into legacy_team_brand.wikipedia_logo values ('Q3', 'nba', 'Portland Trail Blazers', 'Portland_Trail_Blazers_logo.svg',
  'https://thumb.wikimedia.org/wikipedia/en/thumb/2/21/Portland_Trail_Blazers_logo.svg/250px-x.png', null,
  'https://en.wikipedia.org/wiki/File:Portland_Trail_Blazers_logo.svg', 'Non-free logo, fair use (English Wikipedia)', true);
insert into legacy_team_brand.team_place values
  ('Q1', 'home_venue', 'P11', 'Pontiac Silverdome', 42.64, -83.26, '1978-01-01', '2017-01-01', null),
  ('Q1', 'home_venue', 'P12', 'Little Caesars Arena', 42.34, -83.05, '2017-01-01', null, null),
  ('Q2', 'home_venue', 'P21', 'Petco Park', 32.71, -117.16, '2004-04-08', null, null),
  ('Q3', 'home_venue', 'P31', 'Veterans Memorial Coliseum', 45.53, -122.66, '1970-01-01', '1995-01-01', null),
  ('Q3', 'home_venue', 'P32', 'Moda Center', 45.53, -122.67, '1995-01-01', null, null);
insert into legacy_team_brand.wikipedia_colour values
  ('nba', 'm', 'Detroit Pistons', 1, 'Detroit Pistons', null, null, null, 'Detroit Pistons', '1D428A', 'C8102E'),
  ('nba', 'm', 'Portland Trail Blazers', 2, 'Portland Trail Blazers', null, null, null, 'Portland Trail Blazers', '000000', 'E03A3E'),
  ('mlb', 'm', 'San Diego Padres 1969thru1984', 3, 'San Diego Padres', 1969, 1984, null, 'San Diego Padres', '693F23', 'FFC425'),
  ('mlb', 'm', 'San Diego Padres', 4, 'San Diego Padres', null, null, null, 'San Diego Padres', '2F241D', 'FFC425');

-- every file the logo seed names exists (licences as the sweep and SportsLogos.Net give them)
create temp table seed_logo_extra (league text, team text, from_year integer, to_year integer, source text, file_key text, replaces text, note text);
\copy seed_logo_extra from 'db/seed/logo_extra.csv' with (format csv, header true)
insert into legacy_team_brand.commons_logo
select distinct file_key, 'https://commons.wikimedia.org/wiki/File:' || file_key, 'https://upload.wikimedia.org/wikipedia/commons/a/ab/' || file_key,
       'Public domain', case when file_key like 'San_Diego%' then 'trademarked' end
from seed_logo_extra where source = 'wikimedia_commons';
insert into legacy_sportslogos.logo
select distinct file_key, '/team-logos/sl/' || file_key || '.gif', 'https://www.sportslogos.net/logos/view/' || file_key from seed_logo_extra where source = 'sportslogos';
SQL

# identities: stage 1 is what SPX had (cut at its first and last game), stage 2 is what step 147 leaves (one run under a name)
ident() { # franchise_id, valid_during, full_name
  printf "insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name) values (%s, '%s', 'x', 'x', '%s');\n" "$1" "$2" "$3"
}
stage1() {
  { echo "delete from core.franchise_identity;"
    ident 1 '[1948-07-01,1957-07-01)' 'Fort Wayne Pistons'; ident 1 '[1957-07-01,2012-04-27)' 'Detroit Pistons'; ident 1 '[2012-04-27,)' 'Detroit Pistons'
    ident 2 '[1969-04-08,)' 'San Diego Padres'
    ident 3 '[1970-07-01,2002-10-08)' 'Portland Trail Blazers'; ident 3 '[2002-10-08,2012-04-27)' 'Portland Trail Blazers'; ident 3 '[2012-04-27,)' 'Portland Trail Blazers'
    ident 4 '[2002-07-01,2012-04-27)' 'New Orleans Hornets'; ident 4 '[2012-04-27,2013-07-01)' 'New Orleans Hornets'; ident 4 '[2013-07-01,)' 'New Orleans Pelicans'
    ident 5 '[1988-07-01,2002-07-01)' 'Charlotte Hornets'; ident 5 '[2004-07-01,2012-04-27)' 'Charlotte Bobcats'; ident 5 '[2012-04-27,2014-07-01)' 'Charlotte Bobcats'
    ident 5 '[2014-07-01,)' 'Charlotte Hornets'
    ident 6 '[1977-07-01,2002-10-09)' 'New Jersey Nets'; ident 6 '[2002-10-09,2012-07-01)' 'New Jersey Nets'; ident 6 '[2012-07-01,)' 'Brooklyn Nets'
  } | psql_ -o /dev/null
}
stage2() {
  { echo "delete from core.franchise_identity;"
    ident 1 '[1948-07-01,1957-07-01)' 'Fort Wayne Pistons'; ident 1 '[1957-07-01,)' 'Detroit Pistons'
    ident 2 '[1969-04-08,)' 'San Diego Padres'
    ident 3 '[1970-07-01,)' 'Portland Trail Blazers'
    ident 4 '[2002-07-01,2013-07-01)' 'New Orleans Hornets'; ident 4 '[2013-07-01,)' 'New Orleans Pelicans'
    ident 5 '[1988-07-01,2002-07-01)' 'Charlotte Hornets'; ident 5 '[2004-07-01,2014-07-01)' 'Charlotte Bobcats'; ident 5 '[2014-07-01,)' 'Charlotte Hornets'
    ident 6 '[1977-07-01,2012-07-01)' 'New Jersey Nets'; ident 6 '[2012-07-01,)' 'Brooklyn Nets'
  } | psql_ -o /dev/null
}

STEPS="175_team_brand.sql 175_team_logo_extra.sql 175_team_logo_fit.sql"
[ -f "$BUILD_DIR/175_team_logo_join.sql" ] && STEPS="$STEPS 175_team_logo_join.sql"
chain() { for f in $STEPS; do psql_ -f "/work/db/build/$f" -o /dev/null; done; }
snap() {
  psql_ -c "select franchise_brand_id, franchise_id, valid_during, primary_hex, secondary_hex, logo_url, logo_licence, logo_page, home_venue, latitude, longitude, source_id, source_key
            from core.franchise_brand order by franchise_brand_id"
  psql_ -c "select * from core.logo_fit order by logo_file"
}
rows() { psql_ -c "select franchise_id || ' ' || (select code from meta.source s where s.source_id = b.source_id) || ' ' || valid_during || ' ' || coalesce(substr(logo_url, length(logo_url) - 22), '-') || ' ' || coalesce(home_venue, '-') || ' ' || coalesce(primary_hex, '-')
                  from core.franchise_brand b where franchise_id = $1 order by 1"; }
CHECK099="$(grep -v '^--' "$REPO/db/checks/099_nba_brand_split.sql")"

stage1; chain
snap > $T/a1; chain; snap > $T/a2
cmp -s $T/a1 $T/a2 && ok "before the merge: a second run changes nothing" \
  || { bad "before the merge: a second run changes rows"; diff $T/a1 $T/a2 | head -20; }

# step 147 joins the identities; the brand rows keep the cut years
stage2
chain; snap > $T/b
chain; snap > $T/c
chain; snap > $T/d
if cmp -s $T/b $T/c; then ok "after the merge: the first run settles it, the second changes nothing (ids and every column)"
else bad "after the merge: the second run changed rows (diff of run 1 against run 2)"; diff $T/b $T/c | head -30; fi
cmp -s $T/c $T/d && ok "a third run changes nothing either" || bad "third run changed rows"
# an id may disappear after the merge only by being joined into the lowest id of its run; no id may appear that was not there before
ids() { grep -o '^[0-9]*|' "$1" | tr -d '|' | sort -n; }
NEW="$(comm -13 <(ids "$T/a2") <(ids "$T/c"))"
[ -z "$NEW" ] && ok "the merge adds no brand row id: every row after it is a row that existed" || bad "ids that did not exist before the merge: $NEW"

# a Wikidata logo that a seed row replaces comes back when 175_team_brand.sql runs alone; the next full run takes it off again and changes nothing else
psql_ -f /work/db/build/175_team_brand.sql -o /dev/null
chain; snap > "$T/e"
cmp -s "$T/c" "$T/e" && ok "after a run of 175_team_brand.sql alone, the four steps return to the same rows (ids and every column)" \
  || { bad "the four steps did not return to the same rows"; diff "$T/c" "$T/e" | head -20; }

[ "$(psql_ -c "$CHECK099" | grep -c .)" = 0 ] && ok "check 099 has no row after the runs" || bad "check 099 lists rows: $(psql_ -c "$CHECK099" | head -5)"
[ "$(psql_ -c "select count(*) from core.franchise_brand where logo_url is null and primary_hex is null and secondary_hex is null and home_venue is null")" = 0 ] \
  && ok "no empty brand row is left" || bad "empty brand rows exist"
[ "$(psql_ -c "select count(*) from core.franchise_brand a join core.franchise_brand b on a.franchise_id = b.franchise_id and a.source_id = b.source_id
              and a.franchise_brand_id < b.franchise_brand_id and a.valid_during && b.valid_during
              and (a.logo_url, a.home_venue, a.primary_hex) is not distinct from (b.logo_url, b.home_venue, b.primary_hex)")" = 0 ] \
  && ok "no two rows of one source carry the same values over overlapping years" || bad "overlapping duplicate rows"

# the seed's own Commons rows survive (the Padres cap logo, the Pistons logo from 2012)
[ "$(psql_ -c "select count(*) from core.franchise_brand where source_id = 3 and franchise_id in (1, 2)")" = 2 ] \
  && ok "the Padres and Pistons Commons rows are kept" || bad "Padres or Pistons Commons row missing: $(rows 1; rows 2)"
# the logo they replace is gone and the row keeps its venue
[ "$(psql_ -c "select count(*) from core.franchise_brand where source_id = 1 and franchise_id = 2 and logo_url is not null")" = 0 ] \
  && ok "the Wikidata logo the Padres cap logo replaces is gone" || bad "Padres Wikidata logo still there"
[ "$(psql_ -c "select count(*) from core.franchise_brand where source_id = 1 and franchise_id = 2 and home_venue = 'Petco Park'")" = 1 ] \
  && ok "the Petco Park row keeps its venue" || bad "Petco Park row lost"

echo
echo "-- brand rows of the six clubs after the last run"
for f in 1 2 3 4 5 6; do rows $f; done
echo
echo "passed $pass, failed $fail"
[ "$fail" = 0 ]

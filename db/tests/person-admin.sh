#!/bin/bash
# Migrations 122+123: api.person_admin lists every core.person, including athletes with
# no club season, as a materialized view with letter_first/last and chip aggregates.
# Scratch Postgres, removed by name.
#   bash db/tests/person-admin.sh
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="spx-person-admin-$$"
PORT=""
for p in 7740 7741 7742 7743 7744 7745 7746 7747 7748 7749; do
  if ! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then PORT=$p; break; fi
done
[ -n "$PORT" ] || { echo "no free port in 7740-7749"; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker info >/dev/null 2>&1 || { echo "Docker is not running"; exit 1; }
docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx \
  -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
docker exec -i "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create schema extensions;
create schema core;
create schema meta;
create schema ref;
create schema api;
grant usage on schema api to anon, authenticated;
create extension if not exists pg_trgm with schema extensions;
create function core.fold_text(t text) returns text language sql immutable parallel safe as $$
  select btrim(regexp_replace(replace(replace(replace(translate(
    regexp_replace(lower(normalize(t, nfd)), '[̀-ͯ.''’]', '', 'g'),
    'øłđðı', 'olddi'), 'æ', 'ae'), 'œ', 'oe'), 'ß', 'ss'), '[^[:alnum:]]+', ' ', 'g'))
$$;
create table meta.source (source_id smallint primary key, code text not null unique);
create table ref.country (country_code text primary key);
create table ref.sport (sport_code text primary key, name text);
create table ref.league (league_code text primary key, sport_code text not null);
create table core.person (
  person_id bigint primary key,
  full_name text not null,
  kind text not null default 'player',
  birth_date date,
  death_date date,
  birth_country_code text,
  nationality_code text,
  source_id smallint references meta.source
);
create table core.season (season_id int primary key, league_code text not null, start_year int);
create table core.team_season (team_season_id int primary key, season_id int);
create table core.roster_stint (
  roster_stint_id bigint primary key,
  person_id bigint not null references core.person,
  team_season_id int not null,
  role text not null default 'player'
);
create table core.player_season_stat (
  person_id bigint not null,
  team_season_id int not null,
  primary key (person_id, team_season_id)
);
create table core.external_id (
  entity_kind text not null,
  entity_id bigint not null,
  source_id smallint not null,
  external_key text not null,
  primary key (source_id, entity_kind, external_key)
);
create table core.person_sport (
  person_id bigint not null references core.person,
  sport_code text not null,
  source_id smallint not null,
  source_key text not null,
  primary key (person_id, sport_code, source_id)
);
insert into meta.source values (1, 'wikidata'), (2, 'wikidata_meigen'), (3, 'spx');
insert into ref.league values ('nhl', 'hockey'), ('mlb', 'baseball');
insert into core.person values
  (1, 'Usain Bolt', 'player', '1986-08-21', null, null, null, 2),
  (2, 'José Gretzky', 'player', '1961-01-26', null, 'CA', null, 3),
  (3, 'Cecil Bolton', 'player', '1904-02-13', '1993-08-25', 'US', null, 3);
insert into core.season values (10, 'nhl', 1984), (11, 'mlb', 1928);
insert into core.team_season values (100, 10), (101, 11);
insert into core.roster_stint values (1000, 2, 100, 'player'), (1001, 3, 101, 'player');
insert into core.external_id values ('person', 1, 1, 'Q5798'), ('person', 2, 3, 'spx:2');
insert into core.person_sport values (1, 'athletics', 2, 'wikidata:Q5798:P641:athletics');
SQL
docker cp "$REPO/db/migrations/122_person_admin.sql" "$NAME:/tmp/122.sql"
docker cp "$REPO/db/migrations/123_person_admin_matview.sql" "$NAME:/tmp/123.sql"
docker exec "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -f /tmp/122.sql >/dev/null
docker exec "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -f /tmp/123.sql >/dev/null
OUT=$(docker exec -i "$NAME" psql -U postgres -d spx -v ON_ERROR_STOP=1 -At <<'SQL'
select person_id || ',' || name || ',' || search || ',' || coalesce(qid,'') || ',' || sports::text || ',' || has_seasons::text || ',' || sources::text
  from api.person_admin where person_id = 1;
set role anon;
select case when count(*) = 1 and min(person_id) = 1 and min(qid) = 'Q5798'
            and min(sports::text) = '{athletics}' and bool_and(not has_seasons)
            and string_agg(sources::text, '') like '%wikidata_meigen%'
            and min(letter_last) = 'b' and min(letter_first) = 'u'
       then 'ok bolt' else 'FAIL bolt' end
  from api.person_admin where search like '%usain bolt%';
select case when (select has_seasons from api.person_admin where person_id = 2)
            and (select sports @> '{hockey}' from api.person_admin where person_id = 2)
       then 'ok seasons' else 'FAIL seasons' end;
select case when (select search from api.person_admin where person_id = 2) = 'jose gretzky'
       then 'ok fold' else 'FAIL fold' end;
select case when (select count(*) from api.person_admin where sports @> '{athletics}' and has_seasons is false) = 1
       then 'ok sport-filter' else 'FAIL sport-filter' end;
select case when (select count(*) from api.person_admin_sports where sport = 'athletics') = 1
            and (select n from api.person_admin_letters where kind = 'last' and letter = 'b') >= 1
            and (select min_year from api.person_admin_span) = 1904
       then 'ok chips' else 'FAIL chips' end;
reset role;
select case when has_table_privilege('anon', 'api.person_admin', 'select')
            and exists (select 1 from pg_matviews where schemaname = 'api' and matviewname = 'person_admin')
            and exists (select 1 from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = 'api' and c.relname = 'person_admin' and i.indisunique)
       then 'ok grant' else 'FAIL grant' end;
SQL
)
printf '%s\n' "$OUT"
printf '%s\n' "$OUT" | grep -q '^FAIL' && { echo "person-admin: FAIL"; exit 1; }
echo "person-admin: ok (postgres $NAME on 127.0.0.1:$PORT, removed)"

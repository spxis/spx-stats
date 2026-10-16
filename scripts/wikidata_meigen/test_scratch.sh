#!/bin/bash
# Scratch Postgres for meigen-people. Removes the container by name when done.
# Never talks to DS1 or production.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
NAME=spx-meigen-people-scratch
PORT=7743
export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres PGDATABASE=spx_stats PGSSLMODE=disable

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port $PORT is in use" >&2
  exit 1
fi

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=spx_stats \
  -p 127.0.0.1:${PORT}:5432 \
  postgres:17-alpine >/dev/null

for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if pg_isready -h 127.0.0.1 -p "$PORT" -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
pg_isready -h 127.0.0.1 -p "$PORT" -U postgres

psql -v ON_ERROR_STOP=1 -q -f "$HERE/scratch_schema.sql"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/db/migrations/121_legacy_wikidata_meigen.sql"
python3 -I "$ROOT/scripts/wikidata_meigen/load.py"

psql -v ON_ERROR_STOP=1 -q <<'SQL'
insert into legacy_wikidata_meigen.athlete
  (qid, label, sport, birth_on, birth_prec, death_on, death_prec, birth_place, sitelinks, batch)
values
  ('Q209518', 'Wayne Gretzky', 'ice_hockey', '1961-01-26', 11, null, null, 'Brantford', 900, 'fixture'),
  ('Q9990001', 'Meigen Newperson', 'tennis', '1988-04-12', 11, null, null, 'Osaka', 12, 'fixture'),
  ('Q9990002', 'Jane Duplicate', 'golf', '1990-05-05', 11, null, null, 'Perth', 3, 'fixture'),
  ('Q9990003', 'Year Only', 'boxing', '1961-01-01', 9, null, null, 'Rome', 2, 'fixture')
on conflict (qid, sport) do update
  set label = excluded.label, birth_on = excluded.birth_on, birth_prec = excluded.birth_prec,
      birth_place = excluded.birth_place, sitelinks = excluded.sitelinks, batch = excluded.batch;

insert into core.person (full_name, kind, birth_date, source_id)
select 'Wayne Gretzky', 'player', '1961-01-26', source_id from meta.source where code = 'wikidata';
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'person', p.person_id, s.source_id, 'Q209518'
from core.person p, meta.source s
where p.full_name = 'Wayne Gretzky' and s.code = 'wikidata';

insert into core.person (full_name, kind, birth_date, source_id)
select 'Jane Duplicate', 'player', '1990-05-05', source_id from meta.source where code = 'wikidata';
SQL

psql -1 -v ON_ERROR_STOP=1 -q -f "$ROOT/db/build/215_meigen_people.sql"
psql -1 -v ON_ERROR_STOP=1 -q -f "$ROOT/db/build/215_meigen_people.sql"

psql -v ON_ERROR_STOP=1 -At <<'SQL'
select
  case when (select count(*) from core.person p join core.external_id x on x.entity_id = p.person_id
              where x.entity_kind = 'person' and x.external_key = 'Q209518') = 1
       then 'ok gretzky_one_record' else 'FAIL gretzky_dup' end;
select
  case when (select birth_place from core.person p join core.external_id x on x.entity_id = p.person_id
              where x.entity_kind = 'person' and x.external_key = 'Q209518') = 'Brantford'
       then 'ok gretzky_place_filled' else 'FAIL gretzky_place' end;
select
  case when exists (select 1 from core.person p join core.external_id x on x.entity_id = p.person_id
                    where x.external_key = 'Q9990001' and p.full_name = 'Meigen Newperson'
                      and p.birth_date = '1988-04-12' and p.birth_place = 'Osaka')
       then 'ok new_person' else 'FAIL new_person' end;
select
  case when (select birth_date from core.person p join core.external_id x on x.entity_id = p.person_id
              where x.external_key = 'Q9990003') is null
       then 'ok year_only_not_copied' else 'FAIL year_only' end;
select
  case when (select count(*) from core.person where core.fold_text(full_name) = 'jane duplicate') = 2
       then 'ok duplicate_not_merged' else 'FAIL duplicate_merged' end;
select
  case when (select count(*) from meta.data_issue where issue like 'possible-duplicate:%' and entity_key like 'meigen-people:%') >= 1
       then 'ok possible_duplicate_logged' else 'FAIL no_possible_duplicate' end;
select
  case when (select count(*) from core.person_sport ps join core.external_id x on x.entity_id = ps.person_id
              where x.external_key = 'Q209518' and ps.sport_code = 'ice_hockey') = 1
       then 'ok sport_row' else 'FAIL sport_row' end;
select 'athletes=' || count(*) from legacy_wikidata_meigen.athlete;
select 'people=' || count(*) from core.person;
select 'sports=' || count(*) from core.person_sport;
select 'issues=' || count(*) from meta.data_issue where entity_key like 'meigen-people:%';
SQL

role_out="$(psql -v ON_ERROR_STOP=1 -Atc "set role anon; select count(*) from api.person_sports;")"
echo "ok anon_person_sports=$role_out"
psql -v ON_ERROR_STOP=1 -Atc "select pg_size_pretty(pg_total_relation_size('core.person')) as person, pg_size_pretty(pg_total_relation_size('core.external_id')) as xid, pg_size_pretty(pg_total_relation_size('core.person_sport')) as sport, pg_size_pretty(pg_total_relation_size('legacy_wikidata_meigen.athlete')) as legacy;"
echo "scratch ok"

#!/bin/bash
# Scratch-only behavioral check for the Wikidata person facts build step.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="spx-wd-person-test-$$"
PORT=""
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

for candidate in 7745 7746 7747 7748 7749; do
  if ! nc -z 127.0.0.1 "$candidate" >/dev/null 2>&1; then PORT="$candidate"; break; fi
done
if [[ -z "$PORT" ]]; then echo 'no free scratch port in 7745-7749' >&2; exit 1; fi

docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx_stats \
  -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 40); do
  if pg_isready -h 127.0.0.1 -p "$PORT" -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
P=(psql -h 127.0.0.1 -p "$PORT" -U postgres -d spx_stats -X -q -v ON_ERROR_STOP=1)
"${P[@]}" -f "$REPO/scripts/people/person_facts_fixture.sql"
"${P[@]}" -f "$REPO/db/build/214_wikidata_harvest_person_facts.sql"
"${P[@]}" <<'SQL'
do $$ begin
  if not exists(select 1 from core.person where person_id=1 and birth_date='1980-01-02') then raise exception 'exact birth date not filled'; end if;
  if not exists(select 1 from core.person where person_id=3 and death_date='2020-05-06') then raise exception 'exact death date not filled'; end if;
  if not exists(select 1 from core.person where person_id=4 and birth_place='New town' and birth_country_code='CA') then raise exception 'birthplace and derived country not filled'; end if;
  if not exists(select 1 from core.person where person_id=5 and nationality_code='CA') then raise exception 'citizenship not filled'; end if;
  if not exists(select 1 from core.person where person_id=6 and height_cm=180 and weight_kg=80) then raise exception 'measurements not filled'; end if;
  if not exists(select 1 from core.person where person_id=7 and primary_position='PG' and positions=array['PG']) then raise exception 'position not filled'; end if;
  if not exists(select 1 from core.person where person_id=8 and birth_date='1970-01-01') then raise exception 'existing birth date overwritten'; end if;
  if not exists(select 1 from core.person where person_id=10 and birth_place='Old town' and birth_country_code='US') then raise exception 'existing birthplace or country overwritten'; end if;
  if not exists(select 1 from meta.data_issue where entity_kind='game' and entity_key='unrelated:game:1') then raise exception 'unrelated data issue removed'; end if;
end $$;
SQL
"${P[@]}" -f "$REPO/db/build/214_wikidata_harvest_person_facts.sql"
"${P[@]}" -f "$REPO/scripts/people/test_person_facts_edge_data.sql"
"${P[@]}" -f "$REPO/db/build/214_wikidata_harvest_person_facts.sql"
"${P[@]}" -f "$REPO/scripts/people/test_person_facts_edges.sql"
"${P[@]}" -f "$REPO/db/build/214_wikidata_harvest_person_facts.sql"
"${P[@]}" <<'SQL'
do $$ begin
  if not exists(select 1 from core.person where person_id=1 and birth_date='1980-01-02') or not exists(select 1 from core.person where person_id=3 and death_date='2020-05-06') then raise exception 'positive facts disappeared on rerun'; end if;
  if (select count(*) from meta.data_issue where entity_kind='person_wikidata_enrichment') <> 11 then raise exception 'owned issue set is not stable and complete'; end if;
  if not exists(select 1 from meta.data_issue where entity_kind='game' and entity_key='unrelated:game:1') then raise exception 'unrelated data issue removed on rerun'; end if;
end $$;
SQL
"${P[@]}" -c "insert into core.external_id(entity_kind,entity_id,source_id,external_key) values ('person',1,1,'Q101')"
if "${P[@]}" -f "$REPO/db/build/214_wikidata_harvest_person_facts.sql" >/dev/null 2>&1; then
  echo 'duplicate QID mapping should fail closed' >&2; exit 1
fi
"${P[@]}" <<'SQL'
do $$ begin
  if (select count(*) from meta.data_issue where entity_kind='person_wikidata_enrichment') <> 11 then raise exception 'duplicate mapping changed issue rows'; end if;
  if (select count(*) from meta.data_issue where entity_kind='game') <> 1 then raise exception 'duplicate mapping changed unrelated issues'; end if;
end $$;
SQL
echo 'person facts scratch checks passed'

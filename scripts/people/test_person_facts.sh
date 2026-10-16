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
"${P[@]}" -f "$REPO/scripts/people/position_map_fixture.sql"
"${P[@]}" -f "$REPO/db/build/185_ref_position.sql"
"${P[@]}" -f "$REPO/scripts/people/position_consumer_fixture.sql"
"${P[@]}" -f "$REPO/db/build/186_person_positions.sql"
"${P[@]}" <<'SQL'
do $$ begin
  if not exists(select 1 from core.person where person_id=51 and primary_position='SG' and positions=array['SG']) then raise exception '186 ignored QID mapping or accepted conflicting label'; end if;
end $$;
update core.person set primary_position='C',positions=array['C'] where person_id=53;
SQL
"${P[@]}" -f "$REPO/db/build/214_wikidata_harvest_person_facts.sql"
"${P[@]}" -f "$REPO/scripts/people/audit_unmapped_position_qids.sql" >/dev/null
"${P[@]}" <<'SQL'
do $$ begin
  if not exists(select 1 from core.person where person_id=1 and birth_date='1980-01-02') then raise exception 'exact birth date not filled'; end if;
  if not exists(select 1 from core.person where person_id=3 and death_date='2020-05-06') then raise exception 'exact death date not filled'; end if;
  if not exists(select 1 from core.person where person_id=4 and birth_place='New town' and birth_country_code='CA') then raise exception 'birthplace and derived country not filled'; end if;
  if not exists(select 1 from core.person where person_id=5 and nationality_code='CA') then raise exception 'citizenship not filled'; end if;
  if not exists(select 1 from core.person where person_id=6 and height_cm=180 and weight_kg=80) then raise exception 'measurements not filled'; end if;
  if not exists(select 1 from core.person where person_id=7 and primary_position='PG' and positions=array['PG']) then raise exception 'position not filled'; end if;
  if not exists(select 1 from core.person where person_id=51 and primary_position='SG' and positions=array['SG']) then raise exception 'QID position mapping did not beat conflicting label'; end if;
  if exists(select 1 from core.person where person_id in (52,54) and primary_position is not null) then raise exception 'unknown or unsupported-league position was guessed'; end if;
  if not exists(select 1 from core.person where person_id=53 and primary_position='C' and positions=array['C']) then raise exception 'existing position was overwritten'; end if;
  if not exists(select 1 from ref.position_alias where source_code='external' and league_code='nba' and raw_value='preserve-me') then raise exception '185 deleted an alias owned by another source'; end if;
  if not exists(select 1 from ref.position_alias where source_code='wikidata' and league_code='nba' and raw_value='q212413' and code='PG') then raise exception 'NBA point-guard QID alias missing'; end if;
  if not exists(select 1 from ref.position_alias where source_code='wikidata' and league_code='nba' and raw_value='q462471' and code='PF') then raise exception 'NBA power-forward QID alias missing'; end if;
  if not exists(select 1 from ref.position_alias where source_code='wikidata' and league_code='nba' and raw_value='q222052' and code='C') then raise exception 'NBA center QID alias missing'; end if;
  if not exists(select 1 from ref.position_alias where source_code='wikidata' and league_code='mlb' and raw_value='q1048902' and code='P') then raise exception 'MLB pitcher QID alias missing'; end if;
  if not exists(select 1 from ref.position_alias where source_code='wikidata' and league_code='nfl' and raw_value='q918224' and code='WR') or not exists(select 1 from ref.position_alias where source_code='wikidata' and league_code='cfl' and raw_value='q918224' and code='WR') then raise exception 'gridiron wide-receiver QID aliases missing'; end if;
  if exists(select 1 from ref.position_alias where source_code='wikidata' and league_code='nhl' and raw_value='q273199') then raise exception 'basketball QID mapped to hockey'; end if;
  if exists(select 1 from ref.position_alias where source_code='wikidata' and league_code in ('nhl','nba','mlb','nfl','cfl') and raw_value in ('q193592','q280658','q336286','q201330','q268258','q8025128','q90173132')) then raise exception 'association-football QID mapped to an unsupported league'; end if;
  if not exists(select 1 from core.person where person_id=8 and birth_date='1970-01-01') then raise exception 'existing birth date overwritten'; end if;
  if not exists(select 1 from core.person where person_id=10 and birth_place='Old town' and birth_country_code='US') then raise exception 'existing birthplace or country overwritten'; end if;
  if not exists(select 1 from meta.data_issue where entity_kind='game' and entity_key='unrelated:game:1') then raise exception 'unrelated data issue removed'; end if;
end $$;
SQL
"${P[@]}" -f "$REPO/db/build/214_wikidata_harvest_person_facts.sql"
"${P[@]}" -f "$REPO/db/build/185_ref_position.sql"
"${P[@]}" -f "$REPO/db/build/214_wikidata_harvest_person_facts.sql"
"${P[@]}" -f "$REPO/scripts/people/test_person_facts_edge_data.sql"
"${P[@]}" -f "$REPO/db/build/214_wikidata_harvest_person_facts.sql"
"${P[@]}" -f "$REPO/scripts/people/test_person_facts_edges.sql"
"${P[@]}" -f "$REPO/db/build/214_wikidata_harvest_person_facts.sql"
ISSUES_BEFORE_RERUN=$("${P[@]}" -Atc "select count(*) from meta.data_issue where entity_kind='person_wikidata_enrichment'")
"${P[@]}" <<'SQL'
do $$ begin
  if not exists(select 1 from core.person where person_id=1 and birth_date='1980-01-02') or not exists(select 1 from core.person where person_id=3 and death_date='2020-05-06') then raise exception 'positive facts disappeared on rerun'; end if;
  if not exists(select 1 from core.person where person_id=51 and primary_position='SG' and positions=array['SG']) then raise exception 'QID position mapping disappeared on rerun'; end if;
  if (select count(*) from meta.data_issue where entity_kind='person_wikidata_enrichment') < 11 then raise exception 'owned issue set is incomplete'; end if;
  if not exists(select 1 from meta.data_issue where entity_kind='game' and entity_key='unrelated:game:1') then raise exception 'unrelated data issue removed on rerun'; end if;
end $$;
SQL
ISSUES_AFTER_RERUN=$("${P[@]}" -Atc "select count(*) from meta.data_issue where entity_kind='person_wikidata_enrichment'")
if [[ "$ISSUES_BEFORE_RERUN" != "$ISSUES_AFTER_RERUN" ]]; then echo 'owned issue set changed on rerun' >&2; exit 1; fi
ISSUES_BEFORE_DUPLICATE=$("${P[@]}" -Atc "select count(*) from meta.data_issue where entity_kind='person_wikidata_enrichment'")
"${P[@]}" -c "insert into core.external_id(entity_kind,entity_id,source_id,external_key) values ('person',1,1,'Q101')"
if "${P[@]}" -f "$REPO/db/build/214_wikidata_harvest_person_facts.sql" >/dev/null 2>&1; then
  echo 'duplicate QID mapping should fail closed' >&2; exit 1
fi
"${P[@]}" <<'SQL'
do $$ begin
  if (select count(*) from meta.data_issue where entity_kind='game') <> 1 then raise exception 'duplicate mapping changed unrelated issues'; end if;
end $$;
SQL
ISSUES_AFTER_DUPLICATE=$("${P[@]}" -Atc "select count(*) from meta.data_issue where entity_kind='person_wikidata_enrichment'")
if [[ "$ISSUES_BEFORE_DUPLICATE" != "$ISSUES_AFTER_DUPLICATE" ]]; then echo 'duplicate mapping changed owned issues' >&2; exit 1; fi
echo 'person facts scratch checks passed'

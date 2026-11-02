#!/bin/bash
# Scratch Postgres for the bio step (migration 190, db/build/239, load_bio.py) on top of 121 and 215.
# Removes the container by name when done. Never talks to DS1 or production.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT"
NAME=spx-meigen-bio-scratch
PORT=""
for p in 7740 7741 7742 7743 7744 7745 7746 7747 7748 7749; do
  if ! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then PORT=$p; break; fi
done
[ -n "$PORT" ] || { echo "no free port in 7740-7749" >&2; exit 1; }
export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres PGDATABASE=spx_stats PGSSLMODE=disable
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx_stats \
  -p "127.0.0.1:${PORT}:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 30); do pg_isready -h 127.0.0.1 -p "$PORT" -U postgres >/dev/null 2>&1 && break; sleep 1; done

psql -v ON_ERROR_STOP=1 -q -f "$HERE/scratch_schema.sql"
psql -v ON_ERROR_STOP=1 -q -f db/migrations/121_legacy_wikidata_meigen.sql
psql -v ON_ERROR_STOP=1 -q -f db/migrations/190_meigen_person_bio.sql
# a second run of the migration changes nothing
psql -v ON_ERROR_STOP=1 -q -f db/migrations/190_meigen_person_bio.sql
python3 -I scripts/wikidata_meigen/load.py
python3 -I scripts/wikidata_meigen/load_bio.py

# two people the seeds know and one the bio seed does not, one of them already in core.person with a date of its own
psql -v ON_ERROR_STOP=1 -q <<'SQL'
insert into core.person (full_name, kind, birth_date, source_id)
select 'Muhammad Ali', 'player', '1942-01-18', source_id from meta.source where code = 'wikidata';
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'person', p.person_id, s.source_id, 'Q36107' from core.person p, meta.source s
 where p.full_name = 'Muhammad Ali' and s.code = 'wikidata';
SQL

run() { psql -1 -v ON_ERROR_STOP=1 -q -At -F $'\t' -f "$1"; }
run db/build/215_meigen_people.sql >/dev/null
echo "239 first run (bios_matched honours images stints wiki_pages):"
FIRST=$(run db/build/239_meigen_person_bio.sql | tail -1); echo "$FIRST"
echo "239 second run:"
SECOND=$(run db/build/239_meigen_person_bio.sql | tail -1); echo "$SECOND"
[ "$FIRST" = "$SECOND" ] && echo "ok second_run_same" || { echo "FAIL second_run_same"; exit 1; }

psql -v ON_ERROR_STOP=1 -At <<'SQL'
select case when (select count(*) from legacy_wikidata_meigen.bio) = 953 then 'ok bios_953' else 'FAIL bios' end;
select case when (select birth_date from core.person p join core.external_id x on x.entity_id = p.person_id where x.external_key = 'Q36107') = '1942-01-18'
       then 'ok existing_date_kept' else 'FAIL existing_date_overwritten' end;
select case when (select count(*) from core.person_honour where source_key like 'meigen-bio:%') = (select count(*) from legacy_wikidata_meigen.honour)
       then 'ok honours_all_matched' else 'FAIL honours' end;
select case when (select count(*) from core.person_career where source_key like 'meigen-bio:%') = (select count(*) from legacy_wikidata_meigen.team_stint where club_name is not null or club_qid is not null)
       then 'ok stints_all_matched' else 'FAIL stints' end;
select case when (select count(*) from core.person_honour) = (select count(distinct (source_id, source_key)) from core.person_honour)
       then 'ok honours_unique' else 'FAIL honours_dup' end;
select case when exists (select 1 from core.person p where p.height_cm is not null) then 'ok height_filled' else 'FAIL height' end;
select case when not exists (select 1 from core.person where height_cm is not null and height_cm not between 120 and 250) then 'ok height_range' else 'FAIL height_range' end;
select case when not exists (select 1 from legacy_wikidata_meigen.athlete where sport ~ '^para' or sport = 'paralympics' or batch ~ '^(women|para)-')
       then 'ok no_para_or_women_label' else 'FAIL label' end;
select case when not exists (select 1 from legacy_wikidata_meigen.athlete where sport = 'motor_racing' and qid in (select qid from legacy_wikidata_meigen.athlete where sport = 'baseball'))
       then 'ok no_double_sport' else 'FAIL double_sport' end;
select 'athletes=' || count(*) || ' people=' || (select count(*) from core.person) || ' sports=' || (select count(*) from core.person_sport) from legacy_wikidata_meigen.athlete;
select 'honours=' || count(*) from core.person_honour;
select 'images=' || count(*) from core.person_image;
select 'stints=' || count(*) from core.person_career where source_key like 'meigen-bio:%';
SQL
echo "anon sees api.person_honours: $(psql -v ON_ERROR_STOP=1 -Atc 'set role anon; select count(*) from api.person_honours;')"
echo "anon sees api.person_images: $(psql -v ON_ERROR_STOP=1 -Atc 'set role anon; select count(*) from api.person_images;')"
echo "bio scratch ok"

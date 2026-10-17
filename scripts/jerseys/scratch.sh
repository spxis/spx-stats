#!/usr/bin/env bash
# Scratch Postgres on 7743. Never DS1 or production. Removes itself by name.
set -euo pipefail
NAME=spx-jersey-scratch
PORT=7743
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port $PORT is in use" >&2
  exit 2
fi

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" --rm \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx_stats \
  -p 127.0.0.1:"$PORT":5432 postgres:17-alpine >/dev/null

for i in $(seq 1 30); do
  if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 0.4
done

export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres PGDATABASE=spx_stats
psql -v ON_ERROR_STOP=1 -q -f scripts/jerseys/scratch_schema.sql
psql -v ON_ERROR_STOP=1 -q -f db/migrations/130_jersey_numbers.sql
python3 -I scripts/jerseys/load_scratch.py
# Wikipedia titles the preview does not expose: the three names the ticket asks for.
psql -v ON_ERROR_STOP=1 -q -c "
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'person', p.person_id, (select source_id from meta.source where code = 'wikipedia'), p.full_name
from core.person p
where p.full_name in ('Wayne Gretzky', 'Mario Lemieux', 'Pavel Bure')
on conflict do nothing;
"
python3 -I scripts/jerseys/load.py raw/wikipedia_jersey/parsed/*.json raw/wikidata_jersey/sport_number.json
psql -v ON_ERROR_STOP=1 -f db/build/220_jersey_numbers.sql
psql -v ON_ERROR_STOP=1 -c "
select p.full_name, r.league_code, r.jersey_number, r.franchise_id is null as league_wide
from core.retired_number r
join core.person p on p.person_id = r.person_id
where p.full_name in ('Wayne Gretzky', 'Mario Lemieux', 'Pavel Bure')
order by 1, 2, 3, 4;
"
echo "scratch ok; container $NAME will be removed"

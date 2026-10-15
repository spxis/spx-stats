#!/bin/bash
# A scratch Postgres in Docker shaped like DS1 for the tables the harvest job uses (port 7770, inside this project's 7700-7799 block).
#   scratch.sh up      start the container (spx-harvest-scratch), load the real migrations the harvest reads (and 092_legacy_rosters of scripts/rosters), 095, and a few rows (seed.sql)
#   scratch.sh down    stop and remove only that container
#   scratch.sh psql    open psql on it       (HARVEST_PSQL for the tests is printed by `scratch.sh env`)
#   scratch.sh env     the environment the tests and harvest.py need to talk to it
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
NAME="${HARVEST_SCRATCH_NAME:-spx-harvest-scratch}"
PORT="${HARVEST_SCRATCH_PORT:-7770}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
dpsql() { docker exec -i "$NAME" psql -U postgres -d harvest_test -X -q -v ON_ERROR_STOP=1 "$@"; }
case "${1:-}" in
  up)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=harvest_test -p 127.0.0.1:$PORT:5432 postgres:17-alpine >/dev/null
    for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres -d harvest_test >/dev/null 2>&1 && break; sleep 1; done
    sleep 2
    echo "create schema extensions; create schema api; create schema ingest; create role anon nologin; create role authenticated nologin;" | dpsql
    for f in 001_core_schema 007_standings 010_awards 020_more_fields 042_team_season_stat 048_ingest_daily_run 092_legacy_rosters 095_harvest_queue; do
      dpsql < "$REPO/db/migrations/$f.sql"
    done
    dpsql < "$HERE/seed.sql"
    echo "scratch DS1 ready on 127.0.0.1:$PORT"
    ;;
  down) docker rm -f "$NAME" >/dev/null 2>&1 && echo removed || echo "not running" ;;
  psql) shift; exec docker exec -it "$NAME" psql -U postgres -d harvest_test "$@" ;;
  env)
    echo "export PGHOST=127.0.0.1 PGPORT=$PORT PGUSER=postgres PGDATABASE=harvest_test HARVEST_PSQL=psql"
    ;;
  *) echo "usage: scratch.sh up|down|psql|env" >&2; exit 2 ;;
esac

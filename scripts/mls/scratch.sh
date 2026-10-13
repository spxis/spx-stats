#!/bin/bash
# Build the local scratch database for MLS work: a Postgres container on port 3130 (the SPX Stats block, 3100-3199) with the repo's migrations
# applied in order. Prints the first error of any migration that needs data the scratch does not have.
# Usage: bash scripts/mls/scratch.sh up      start the container (if missing) and apply every db/migrations file
#        bash scripts/mls/scratch.sh psql    psql into it           bash scripts/mls/scratch.sh down    remove it
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME=spx-mls-scratch
case "${1:-up}" in
  down) docker rm -f "$NAME" >/dev/null && echo removed ;;
  psql) shift; exec docker exec -i "$NAME" psql -U postgres -d spx_stats "$@" ;;
  up)
    if ! docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
      docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx_stats -p 127.0.0.1:3130:5432 postgres:17-alpine >/dev/null
      sleep 6
      docker exec "$NAME" psql -U postgres -d spx_stats -qc "create role anon nologin; create role authenticated nologin; create schema extensions;"
    fi
    for f in "$REPO"/db/migrations/*.sql; do
      if ! docker exec -i "$NAME" psql -U postgres -d spx_stats -q -v ON_ERROR_STOP=1 -1 < "$f" >/dev/null 2>"$HERE/.err"; then
        echo "FAILED $(basename "$f"): $(head -c 300 "$HERE/.err")"
      fi
    done
    rm -f "$HERE/.err"; echo "scratch ready on 127.0.0.1:3130" ;;
esac

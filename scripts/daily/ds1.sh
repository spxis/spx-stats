#!/bin/bash
# Run psql against DS1 (read-only use). Finds the host with ds1_host from scripts/mac/spx-checks.sh and takes the
# password from the keychain item 'spx-stats-db DS1 55440' inside this process; it is never printed.
# Usage: ds1.sh <psql arguments...>      (e.g. ds1.sh -Atc 'select 1')   ds1.sh --host prints the address only.
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../mac/spx-checks.sh"
H="$(ds1_host)" || { echo "DS1: $(ds1_missing)" >&2; exit 2; }
if [ "$1" = "--host" ]; then echo "$H"; exit 0; fi
PGPASSWORD="$(kc_get 'spx-stats-db DS1 55440')"
[ -n "$PGPASSWORD" ] || { echo "DS1: keychain item 'spx-stats-db DS1 55440' is empty" >&2; exit 3; }
export PGPASSWORD PGCONNECT_TIMEOUT=10
exec psql -h "$H" -p "$SPX_DS1_PORT" -U postgres -d spx_stats -v ON_ERROR_STOP=1 "$@"

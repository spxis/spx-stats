#!/bin/bash
# Run psql against DS1 (read-only use). Two ways to find DS1:
#   macOS:  the host comes from ds1_host in scripts/mac/spx-checks.sh (hosts-file name ds1, home LAN, then Tailscale) and the
#           password from the keychain item 'spx-stats-db DS1 55440', read inside this process; it is never printed.
#   Linux (the Docker job on the NAS, daily/README.md): no keychain. PGHOST and PGPASSWORD must be set (PGPORT 55440, PGUSER postgres,
#           PGDATABASE spx_stats by default). On a Mac the PG* variables are ignored on purpose, so a stray PGHOST in a shell
#           (another database) can never be written to by mistake.
# Usage: ds1.sh <psql arguments...>      (e.g. ds1.sh -Atc 'select 1')   ds1.sh --host prints the address only.
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ "$(uname -s)" != "Darwin" ]; then
  [ -n "${PGHOST:-}" ] || { echo "DS1: PGHOST is not set (see daily/README.md)" >&2; exit 2; }
  if [ "${1:-}" = "--host" ]; then echo "$PGHOST"; exit 0; fi
  [ -n "${PGPASSWORD:-}" ] || { echo "DS1: PGPASSWORD is not set (see daily/README.md)" >&2; exit 3; }
  export PGPASSWORD PGCONNECT_TIMEOUT=10
  exec psql -h "$PGHOST" -p "${PGPORT:-55440}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-spx_stats}" -v ON_ERROR_STOP=1 "$@"
fi
. "$HERE/../mac/spx-checks.sh"
H="$(ds1_host)" || { echo "DS1: $(ds1_missing)" >&2; exit 2; }
if [ "$1" = "--host" ]; then echo "$H"; exit 0; fi
PGPASSWORD="$(kc_get 'spx-stats-db DS1 55440')"
[ -n "$PGPASSWORD" ] || { echo "DS1: keychain item 'spx-stats-db DS1 55440' is empty" >&2; exit 3; }
export PGPASSWORD PGCONNECT_TIMEOUT=10
exec psql -h "$H" -p "$SPX_DS1_PORT" -U postgres -d spx_stats -v ON_ERROR_STOP=1 "$@"

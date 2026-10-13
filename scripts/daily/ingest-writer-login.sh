#!/bin/bash
# Gives the NOLOGIN role ingest_writer (migration 046) a way in on DS1, with a password that is generated here, sent to the database
# and put in the Mac keychain, and never printed or written to a file or a log. DS1 only: ingest.report_results is not installed on
# production, and production gets daily scores through data releases (scripts/daily/README.md, scripts/release/README.md).
# The daily job does not need this login: it connects as the DS1 admin user and switches to ingest_writer inside its transaction
# (`set local role ingest_writer`). This script is for a person who wants to call the function as the role from outside.
#
#   bash scripts/daily/ingest-writer-login.sh ds1            # needs the DS1 admin password from the keychain (as ds1.sh does)
#   add --rotate to replace an existing password (the old one stops working at once)
#
# What it does, in order, stopping at the first failure:
#   1. checks migrations 044 and 046 are applied (the role and ingest.report_results exist)
#   2. makes a 40-character password with openssl in this process (never an argument, never echoed)
#   3. ALTER ROLE ingest_writer LOGIN PASSWORD ... CONNECTION LIMIT 3 (psql on stdin)
#   4. stores it in the Mac keychain item 'spx-stats ingest_writer DS1 55440' (security add-generic-password -U; the account is ingest_writer)
#   5. proves it: connects AS ingest_writer, calls ingest.report_results('[]') (must answer observations 0), and tries
#      select * from core.game (must be refused). Prints only ok / FAIL lines.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-}"; ROTATE=0
[ "${2:-}" = "--rotate" ] && ROTATE=1
case "$TARGET" in ds1) ;; *) echo "usage: ingest-writer-login.sh ds1 [--rotate]" >&2; exit 2 ;; esac
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin:/usr/local/bin:$PATH"
ITEM='spx-stats ingest_writer DS1 55440'

if security find-generic-password -s "$ITEM" >/dev/null 2>&1 && [ "$ROTATE" = 0 ]; then
  echo "FAIL: keychain item '$ITEM' exists; use --rotate to replace the password" >&2; exit 1
fi

# 1. migrations in place
CHECK="select (to_regprocedure('ingest.report_results(jsonb)') is not null and exists (select 1 from pg_roles where rolname = 'ingest_writer'))::text"
[ "$(echo "$CHECK;" | "$HERE/ds1.sh" -X -q -At -f -)" = "true" ] || { echo "FAIL: apply migrations 044 and 046 first" >&2; exit 1; }

# 2-3. password, role
PW="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 40)"
[ "${#PW}" -eq 40 ] || { echo "FAIL: could not make a password" >&2; exit 1; }
printf '%s\n' "alter role ingest_writer login password '$PW' connection limit 3;" | "$HERE/ds1.sh" -X -q -At -f - >/dev/null
echo "ok: ingest_writer can log in on DS1"

# 4. keychain
security add-generic-password -U -a ingest_writer -s "$ITEM" -w "$PW" >/dev/null
echo "ok: password stored in the keychain item '$ITEM'"

# 5. proof, as ingest_writer
. "$HERE/../mac/spx-checks.sh"
H="$(ds1_host)" || { echo "FAIL: DS1 not reachable" >&2; exit 1; }
export PGPASSWORD="$PW" PGCONNECT_TIMEOUT=10
P=(psql -X -q -At -h "$H" -p "$SPX_DS1_PORT" -U ingest_writer -d spx_stats)
[ "$("${P[@]}" -c "select ingest.report_results('[]'::jsonb) ->> 'observations'")" = "0" ] && echo "ok: ingest.report_results answers" || { echo "FAIL: ingest.report_results did not answer" >&2; exit 1; }
if "${P[@]}" -c "select count(*) from core.game" >/dev/null 2>&1; then echo "FAIL: ingest_writer can read core.game" >&2; exit 1; else echo "ok: ingest_writer cannot read core.game"; fi
unset PW PGPASSWORD

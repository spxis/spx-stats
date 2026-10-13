#!/bin/bash
# PHASE B. Gives the NOLOGIN role ingest_writer (migration 046) a way in, on DS1 or on production, with a password that is
# generated here, sent to the database and put in the Mac keychain, and never printed or written to a file or a log.
# NOT RUN in phase A. Needs John's OK for production (a new login on the production database).
#
#   bash scripts/daily/ingest-writer-login.sh ds1           # DS1: needs the DS1 admin password from the keychain (as ds1.sh does)
#   bash scripts/daily/ingest-writer-login.sh production    # production: needs SUPABASE_ACCESS_TOKEN (environment or keychain item
#                                                           #   'spx-stats SUPABASE_ACCESS_TOKEN'); migrations 044 and 046 applied first
#   add --rotate to replace an existing password (the old one stops working at once)
#
# What it does, in order, stopping at the first failure:
#   1. checks migrations 044 and 046 are applied (the role and ingest.report_results exist)
#   2. makes a 40-character password with openssl in this process (never an argument, never echoed)
#   3. ALTER ROLE ingest_writer LOGIN PASSWORD ... CONNECTION LIMIT 3 (DS1: psql on stdin; production: the Management API query endpoint)
#   4. stores it in the Mac keychain: item 'spx-stats ingest_writer DS1 55440' or 'spx-stats ingest_writer production'
#      (security add-generic-password -U; the account is ingest_writer)
#   5. proves it: connects AS ingest_writer, calls ingest.report_results('[]') (must answer observations 0), and tries
#      select * from core.game (must be refused). Prints only ok / FAIL lines.
# Where the daily job reads it (stage 3, the job runs in Docker on DS1): from a root-only file next to the container,
#   /volume1/docker/spx-stats-daily/secrets/ingest_writer.pw (mode 0600), mounted read-only as a Docker secret and read into
#   PGPASSWORD by the job's entrypoint. Put it there from the Mac without showing it:
#     security find-generic-password -s 'spx-stats ingest_writer DS1 55440' -w | ssh <ds1-admin>@ds1 'umask 077; mkdir -p /volume1/docker/spx-stats-daily/secrets && cat > /volume1/docker/spx-stats-daily/secrets/ingest_writer.pw'
#   Production's login (when the job reports to production) is a second file, ingest_writer.production.pw, the same way.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-}"; ROTATE=0
[ "${2:-}" = "--rotate" ] && ROTATE=1
case "$TARGET" in ds1|production) ;; *) echo "usage: ingest-writer-login.sh ds1|production [--rotate]" >&2; exit 2 ;; esac
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin:/usr/local/bin:$PATH"
REF="njpvfrceahkvnrduerkk"
ITEM_DS1='spx-stats ingest_writer DS1 55440'; ITEM_PROD='spx-stats ingest_writer production'
ITEM=$([ "$TARGET" = ds1 ] && echo "$ITEM_DS1" || echo "$ITEM_PROD")

if security find-generic-password -s "$ITEM" >/dev/null 2>&1 && [ "$ROTATE" = 0 ]; then
  echo "FAIL: keychain item '$ITEM' exists; use --rotate to replace the password" >&2; exit 1
fi

api_query() {   # reads SQL on stdin, runs it through the Management API; prints nothing but the HTTP status line on failure
  local tok="${SUPABASE_ACCESS_TOKEN:-$(security find-generic-password -s 'spx-stats SUPABASE_ACCESS_TOKEN' -w 2>/dev/null || true)}"
  [ -n "$tok" ] || { echo "FAIL: no SUPABASE_ACCESS_TOKEN" >&2; return 1; }
  python3 -I -c '
import json, sys, urllib.request, urllib.error
ref, tok = sys.argv[1], sys.argv[2]
body = json.dumps({"query": sys.stdin.read()}).encode()
req = urllib.request.Request("https://api.supabase.com/v1/projects/%s/database/query" % ref, data=body, method="POST",
      headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json", "User-Agent": "spx-stats-ingest-login/1"})
try:
    print(urllib.request.urlopen(req, timeout=60).read().decode())
except urllib.error.HTTPError as e:
    sys.exit("FAIL: HTTP %d" % e.code)
' "$REF" "$tok"
}

# 1. migrations in place
CHECK="select (to_regprocedure('ingest.report_results(jsonb)') is not null and exists (select 1 from pg_roles where rolname = 'ingest_writer'))::text"
if [ "$TARGET" = ds1 ]; then
  [ "$(echo "$CHECK;" | "$HERE/ds1.sh" -X -q -At -f -)" = "true" ] || { echo "FAIL: apply migrations 044 and 046 first" >&2; exit 1; }
else
  echo "$CHECK;" | api_query | grep -q 'true' || { echo "FAIL: apply migrations 044 and 046 to production first" >&2; exit 1; }
fi

# 2-3. password, role
PW="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 40)"
[ "${#PW}" -eq 40 ] || { echo "FAIL: could not make a password" >&2; exit 1; }
SQL="alter role ingest_writer login password '$PW' connection limit 3;"
if [ "$TARGET" = ds1 ]; then printf '%s\n' "$SQL" | "$HERE/ds1.sh" -X -q -At -f - >/dev/null
else printf '%s\n' "$SQL" | api_query >/dev/null; fi
echo "ok: ingest_writer can log in on $TARGET"

# 4. keychain
security add-generic-password -U -a ingest_writer -s "$ITEM" -w "$PW" >/dev/null
echo "ok: password stored in the keychain item '$ITEM'"

# 5. proof, as ingest_writer
if [ "$TARGET" = ds1 ]; then
  . "$HERE/../mac/spx-checks.sh"
  H="$(ds1_host)" || { echo "FAIL: DS1 not reachable" >&2; exit 1; }
  export PGPASSWORD="$PW" PGCONNECT_TIMEOUT=10
  P=(psql -X -q -At -h "$H" -p "$SPX_DS1_PORT" -U ingest_writer -d spx_stats)
else
  : "${SPX_PROD_POOLER_HOST:?set SPX_PROD_POOLER_HOST to the pooler host of the project (Supabase dashboard > Connect)}"
  export PGPASSWORD="$PW" PGCONNECT_TIMEOUT=10 PGSSLMODE=require
  P=(psql -X -q -At -h "$SPX_PROD_POOLER_HOST" -p 5432 -U "ingest_writer.$REF" -d postgres)
fi
[ "$("${P[@]}" -c "select ingest.report_results('[]'::jsonb) ->> 'observations'")" = "0" ] && echo "ok: ingest.report_results answers" || { echo "FAIL: ingest.report_results did not answer" >&2; exit 1; }
if "${P[@]}" -c "select count(*) from core.game" >/dev/null 2>&1; then echo "FAIL: ingest_writer can read core.game" >&2; exit 1; else echo "ok: ingest_writer cannot read core.game"; fi
unset PW PGPASSWORD

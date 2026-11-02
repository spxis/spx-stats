#!/bin/bash
# Gives the NOLOGIN role spx_backup (db/ds1/002_backup_role.sql) a way in on DS1, with a password that is generated here, sent to the
# database and put in the Mac keychain, and never printed or written to a file or a log. DS1 only.
#   bash scripts/backup/backup-role-login.sh            first time (refuses if the keychain item exists)
#   bash scripts/backup/backup-role-login.sh --rotate   replace the password (the old one stops working at once)
# Steps, stopping at the first failure: 1 the role exists; 2 password made with openssl in this process; 3 ALTER ROLE ... LOGIN
# (psql on stdin); 4 keychain item 'spx-stats spx_backup DS1 55440'; 5 proof as spx_backup: it reads core.game, and a write is refused.
# DS1_PSQL (default scripts/daily/ds1.sh) is the admin psql; BACKUP_ROLE_HOST / BACKUP_ROLE_PORT override where the proof connects.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/../mac/lib/hosts.sh"
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin:/usr/local/bin:$PATH"
DS1_PSQL="${DS1_PSQL:-$HERE/../daily/ds1.sh}"
ITEM='spx-stats spx_backup DS1 55440'
ROTATE=0; [ "${1:-}" = "--rotate" ] && ROTATE=1

if security find-generic-password -s "$ITEM" >/dev/null 2>&1 && [ "$ROTATE" = 0 ]; then
  echo "FAIL: keychain item '$ITEM' exists; use --rotate to replace the password" >&2; exit 1
fi
[ "$(echo "select exists (select 1 from pg_roles where rolname = 'spx_backup')::text;" | "$DS1_PSQL" -X -q -At -f -)" = "true" ] \
  || { echo "FAIL: apply db/ds1/002_backup_role.sql first (bash scripts/mac/ds1-apply.sh db/ds1/002_backup_role.sql)" >&2; exit 1; }
PW="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 40)"
[ "${#PW}" -eq 40 ] || { echo "FAIL: could not make a password" >&2; exit 1; }
printf '%s\n' "alter role spx_backup login password '$PW' connection limit 3;" | "$DS1_PSQL" -X -q -At -f - >/dev/null
echo "ok: spx_backup can log in on DS1"
security add-generic-password -U -a spx_backup -s "$ITEM" -w "$PW" >/dev/null
echo "ok: password stored in the keychain item '$ITEM'"

H="${BACKUP_ROLE_HOST:-$("$DS1_PSQL" --host)}"
export PGPASSWORD="$PW" PGCONNECT_TIMEOUT=10
P=(psql -X -q -At -h "$H" -p "${BACKUP_ROLE_PORT:-$NAS1_DB_PORT}" -U spx_backup -d "${PGDATABASE:-spx_stats}")
"${P[@]}" -c "select count(*) from core.game" >/dev/null && echo "ok: spx_backup reads core.game" || { echo "FAIL: spx_backup cannot read core.game" >&2; exit 1; }
if "${P[@]}" -c "create table public.zz_backup_must_not_exist (i int)" >/dev/null 2>&1; then
  "${P[@]}" -c "drop table public.zz_backup_must_not_exist" >/dev/null 2>&1 || true
  echo "FAIL: spx_backup can write" >&2; exit 1
fi
echo "ok: spx_backup cannot write"

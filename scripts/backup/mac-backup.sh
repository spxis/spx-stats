#!/bin/bash
# The machine1 fallback: the same ds1-backup.sh, run from a Mac, for when nas2 cannot do it (and as a spare copy). Finds DS1 like the other
# Mac scripts do, takes the password from the keychain, writes to ~/Projects/backups/spx-stats (BACKUP_DIR overrides).
#   bash scripts/backup/mac-backup.sh [--check]
# Login: the keychain item 'spx-stats spx_backup DS1 55440' (read-only role, made by backup-role-login.sh); until that exists it uses
# the admin item 'spx-stats-db DS1 55440' (the session is still forced read-only) and says so.
# Scheduled nightly by launchd: scripts/backup/launchd/ (install with the command in backup/README.md).
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/../mac/spx-checks.sh"
host="$(ds1_host)" || { echo "backup: DS1 not reachable: $(ds1_missing)" >&2; exit 2; }
pw="$(kc_get 'spx-stats spx_backup DS1 55440')"; user=spx_backup
if [ -z "$pw" ]; then
  pw="$(kc_get 'spx-stats-db DS1 55440')"; user=postgres
  [ -n "$pw" ] || { echo "backup: no DS1 password in the keychain (zsh scripts/mac/spx-credentials.sh setup)" >&2; exit 2; }
  echo "backup: using the admin login, the read-only role spx_backup is not set up yet"
fi
export PGHOST="$host" PGPORT="$SPX_DS1_PORT" PGUSER="$user" PGPASSWORD="$pw" PGDATABASE=spx_stats RUNLOG_KEYCHAIN=1
export BACKUP_ACTOR="${BACKUP_ACTOR:-${SPX_ACTOR:-$(spx_this_mac 2>/dev/null)}}"
exec bash "$HERE/ds1-backup.sh" "$@"

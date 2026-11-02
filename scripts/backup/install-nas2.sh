#!/bin/bash
# Installs (or updates) the nightly DS1 backup job on nas2, from a Mac, in one command. Only the coordinating session runs it.
#   bash scripts/backup/install-nas2.sh [--first-dump]
# Needs the private host mapping (NAS2_LAN_HOST is only for spx-check; here: NAS2_SSH_ALIAS, NAS2_DOCKER_DIR, NAS2_BACKUP_DIR, NAS1_LAN_PRIMARY),
# the keychain item 'spx-stats spx_backup DS1 55440' (bash scripts/backup/backup-role-login.sh), and a docker command on nas2 that the
# login may run WITHOUT sudo. It prints no secret.
# Steps, stopping at the first failure:
#   1. the folders on nas2 (ABSOLUTE paths from the mapping; rsync and scp resolve a relative path against another home than the ssh shell)
#   2. the job's files shipped with tar over ssh, then each file's checksum read back at its absolute path on nas2 and compared
#   3. backup.env (mode 600) written on nas2 from the keychain: DS1 address, role password, run-log settings; and .env with the dump folder
#   4. docker compose up -d --build, then `entry.sh once --check` inside the container (connects to DS1, proves the login is read-only)
#   --first-dump  then take the first full dump now (10 to 60 minutes; the output streams)
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/../mac/lib/hosts.sh"
spx_hosts_need NAS2_SSH_ALIAS NAS2_DOCKER_DIR NAS2_BACKUP_DIR NAS1_LAN_PRIMARY || exit 1
case "$NAS2_DOCKER_DIR" in /*) ;; *) echo "FAIL: NAS2_DOCKER_DIR must be absolute" >&2; exit 1 ;; esac
case "$NAS2_BACKUP_DIR" in /*) ;; *) echo "FAIL: NAS2_BACKUP_DIR must be absolute" >&2; exit 1 ;; esac
A="$NAS2_SSH_ALIAS"; DK="$NAS2_DOCKER_BIN"; D="$NAS2_DOCKER_DIR/spx-ds1-backup"; BK="$NAS2_BACKUP_DIR"
r() { ssh -o BatchMode=yes -o ConnectTimeout=10 "$A" "$@"; }
kc() { security find-generic-password -s "$1" -w 2>/dev/null || true; }

PW="$(kc 'spx-stats spx_backup DS1 55440')"
[ -n "$PW" ] || { echo "FAIL: keychain item 'spx-stats spx_backup DS1 55440' is missing (bash scripts/backup/backup-role-login.sh)" >&2; exit 1; }
r "$DK ps >/dev/null 2>&1" || { echo "FAIL: the docker command on nas2 ($DK) did not run for this login without sudo. One step for John: let this login use docker on nas2 (add it to nas2's docker group, then log in again), or set NAS2_DOCKER_BIN" >&2; exit 1; }
echo "ok: docker runs on nas2"

r "mkdir -p '$D/data' '$BK/daily' '$BK/weekly'" || { echo "FAIL: cannot create the folders on nas2" >&2; exit 1; }
FILES="Dockerfile entry.sh docker-compose.yml backup.env.example"
( cd "$REPO/backup" && tar -cf - $FILES ) | r "tar -xf - -C '$D'" || { echo "FAIL: could not ship the files" >&2; exit 1; }
for f in $FILES; do
  a="$(cksum < "$REPO/backup/$f" | awk '{print $1 " " $2}')"
  b="$(r "cksum < '$D/$f'" | awk '{print $1 " " $2}')"
  [ -n "$a" ] && [ "$a" = "$b" ] || { echo "FAIL: $f on nas2 differs from the repository (local '$a', nas2 '$b')" >&2; exit 1; }
done
echo "ok: 4 files on nas2 at $D, checksums equal"

URL="$(kc 'spx-stats TURSO_DATABASE_URL')"; TOK="$(kc 'spx-stats TURSO_RUNLOG_TOKEN')"
{ printf 'PGHOST=%s\nPGPORT=%s\nPGUSER=spx_backup\nPGDATABASE=spx_stats\nPGPASSWORD=%s\nTURSO_DATABASE_URL=%s\nTURSO_RUNLOG_TOKEN=%s\nBACKUP_ACTOR=nas2\n' \
    "$NAS1_LAN_PRIMARY" "$NAS1_DB_PORT" "$PW" "$URL" "$TOK"; } | r "umask 077; cat > '$D/backup.env.new' && mv '$D/backup.env.new' '$D/backup.env'" || { echo "FAIL: could not write backup.env" >&2; exit 1; }
printf 'BACKUP_HOST_DIR=%s\n' "$BK" | r "umask 077; cat > '$D/.env'" || { echo "FAIL: could not write .env" >&2; exit 1; }
echo "ok: backup.env written ($(r "grep -c '=.' '$D/backup.env'") of 8 values set; mode $(r "ls -l '$D/backup.env'" | cut -c1-10)); run log $([ -n "$URL" ] && [ -n "$TOK" ] && echo configured || echo 'NOT configured: no keychain items for Turso')"

if r "$DK compose version >/dev/null 2>&1"; then C="$DK compose"; elif r "docker-compose version >/dev/null 2>&1"; then C="docker-compose"; else echo "FAIL: neither '$DK compose' nor docker-compose runs on nas2" >&2; exit 1; fi
r "cd '$D' && $C up -d --build" || { echo "FAIL: compose up failed" >&2; exit 1; }
sleep 3
r "$DK exec spx-ds1-backup bash /usr/local/bin/entry.sh once --check" || { echo "FAIL: the check inside the container failed (see its lines above)" >&2; exit 1; }
echo "ok: the container is up and its check passed; the first scheduled run is 05:30 America/Toronto"
if [ "${1:-}" = "--first-dump" ]; then
  echo "taking the first full dump now"
  r "$DK exec spx-ds1-backup bash /usr/local/bin/entry.sh once" || { echo "FAIL: the first dump failed (see above)" >&2; exit 1; }
  echo "ok: first dump done. Next: the restore drill (docs/backups.md)"
fi

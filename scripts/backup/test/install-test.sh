#!/bin/bash
# Tests install-nas2.sh with stand-ins: `ssh` runs the remote command in a local shell, `docker` records its arguments, `security` answers
# from a table. Stand-in paths and values only; nothing leaves the temp folder.   bash scripts/backup/test/install-test.sh
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../.." && pwd)
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/spx-install-test.XXXXXX")
trap 'rm -rf "${ROOT:?}"' EXIT
PASS=0; FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got [$2], wanted [$3])"; fi; }
mkdir -p "$ROOT/bin" "$ROOT/nas/docker" "$ROOT/nas/backups"
cat > "$ROOT/bin/ssh" <<'EOT'
#!/bin/bash
while [ $# -gt 0 ]; do case "$1" in -o) shift 2 ;; -*) shift ;; *) break ;; esac; done
shift   # the alias
exec bash -c "$1"
EOT
cat > "$ROOT/bin/docker" <<EOT
#!/bin/bash
echo "\$*" >> "$ROOT/docker.log"
[ "\${DOCKER_FAIL:-0}" = 1 ] && exit 1
exit 0
EOT
cat > "$ROOT/bin/security" <<'EOT'
#!/bin/bash
case "$3" in
  'spx-stats spx_backup DS1 55440') [ "${KC_NO_ROLE:-0}" = 1 ] && exit 44; printf 'standin-role-password' ;;
  'spx-stats TURSO_DATABASE_URL') printf 'http://127.0.0.1:1' ;;
  'spx-stats TURSO_RUNLOG_TOKEN') printf 'standin-token' ;;
  *) exit 44 ;;
esac
EOT
chmod +x "$ROOT/bin/"*
export PATH="$ROOT/bin:$PATH"
export SPX_HOSTS_CONFIG="$ROOT/none.env" NAS1_LAN_PRIMARY=192.0.2.11 NAS2_SSH_ALIAS=nas2 NAS2_DOCKER_DIR="$ROOT/nas/docker" NAS2_BACKUP_DIR="$ROOT/nas/backups" NAS2_DOCKER_BIN="$ROOT/bin/docker"
D="$ROOT/nas/docker/spx-ds1-backup"

bash "$REPO/scripts/backup/install-nas2.sh" > "$ROOT/o" 2>&1; eq "install exit" "$?" 0
eq "the four files arrived and match" "$(for f in Dockerfile entry.sh docker-compose.yml backup.env.example; do cmp -s "$REPO/backup/$f" "$D/$f" && echo y; done | wc -l | tr -d ' ')" 4
eq "daily/ and weekly/ were made at the absolute path" "$(ls -d "$ROOT/nas/backups/daily" "$ROOT/nas/backups/weekly" | wc -l | tr -d ' ')" 2
eq "data/ was made" "$(ls -d "$D/data" | wc -l | tr -d ' ')" 1
eq "backup.env is mode 600" "$(stat -f '%Lp' "$D/backup.env" 2>/dev/null || stat -c '%a' "$D/backup.env")" 600
eq "backup.env holds the role, host, run-log values" "$(grep -c -E '^(PGUSER=spx_backup|PGHOST=192.0.2.11|PGPASSWORD=standin-role-password|TURSO_RUNLOG_TOKEN=standin-token|BACKUP_ACTOR=nas2)$' "$D/backup.env")" 5
eq ".env names the absolute dump folder" "$(cat "$D/.env")" "BACKUP_HOST_DIR=$ROOT/nas/backups"
eq "no password or token in the output" "$(grep -c -E 'standin-(role-password|token)' "$ROOT/o")" 0
eq "the output says the run log is configured" "$(grep -c 'run log configured' "$ROOT/o")" 1
eq "docker compose up --build was called" "$(grep -c 'compose up -d --build' "$ROOT/docker.log")" 1
eq "the check ran inside the container" "$(grep -c 'exec spx-ds1-backup bash /usr/local/bin/entry.sh once --check' "$ROOT/docker.log")" 1
eq "no first dump without --first-dump" "$(grep -c 'entry.sh once$' "$ROOT/docker.log")" 0
bash "$REPO/scripts/backup/install-nas2.sh" --first-dump > "$ROOT/o" 2>&1; eq "second run (an update) with --first-dump: exit" "$?" 0
eq "…the first dump was started" "$(grep -c 'entry.sh once$' "$ROOT/docker.log")" 1
KC_NO_ROLE=1 bash "$REPO/scripts/backup/install-nas2.sh" > "$ROOT/o" 2>&1; eq "no role password in the keychain: exit 1" "$?" 1
eq "…names the fix" "$(grep -c 'backup-role-login.sh' "$ROOT/o")" 1
DOCKER_FAIL=1 bash "$REPO/scripts/backup/install-nas2.sh" > "$ROOT/o" 2>&1; eq "docker not usable without sudo: exit 1" "$?" 1
eq "…says what John has to do" "$(grep -c 'One step for John' "$ROOT/o")" 1
NAS2_DOCKER_DIR=relative/docker bash "$REPO/scripts/backup/install-nas2.sh" > "$ROOT/o" 2>&1; eq "a relative path is refused: exit" "$?" 1
echo; echo "passed $PASS, failed $FAIL"
[ "$FAIL" = 0 ]

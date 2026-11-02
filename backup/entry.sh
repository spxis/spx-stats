#!/bin/bash
# The nightly DS1 backup job on nas2: at BACKUP_TIME (default 05:30) in BACKUP_TZ (default America/Toronto) run
#   scripts/backup/ds1-backup.sh
# which dumps DS1 over the LAN with a read-only login, verifies the archive, keeps 14 daily and 8 weekly dumps and writes a run-log
# heartbeat. 05:30 Eastern is after the daily scores run (03:00, with hourly retries to 05:00), before the 10:00 run, outside the release
# runner's nightly drift check (about 22:00-23:00 Eastern) and outside the harvester's pause window (09:50-10:30).
# Between runs the container just sleeps. The code is the public repo, fetched at each run and checked out at BACKUP_REF; if GitHub
# cannot be reached the copy already checked out is used, so a GitHub outage never costs a backup.
#
#   entry.sh                      the daily loop (what the container does)
#   entry.sh once [--check]       one run now, then exit (--check: connect and report, change nothing); the schedule files are not touched
set -u
REPO_URL="${BACKUP_REPO_URL:-https://github.com/spxis/spx-stats.git}"
REF="${BACKUP_REF:-origin/main}"
DIR="${BACKUP_REPO:-/work/repo}"
RUN_TZ="${BACKUP_TZ:-America/Toronto}"
SLOT="${BACKUP_TIME:-05:30}"
RETRY_SECS="${BACKUP_RETRY_SECS:-3600}"
MAX_TRIES="${BACKUP_MAX_TRIES:-3}"
DATA="${BACKUP_DATA:-/data}"
mkdir -p "$DATA/logs"

log() { echo "$(TZ="$RUN_TZ" date '+%Y-%m-%d %H:%M:%S %Z') backup-job: $*"; }
at_epoch() { TZ="$RUN_TZ" date -d "$1 $2" +%s; }       # $1: today | tomorrow, $2: HH:MM

get_code() {
  if [ ! -d "$DIR/.git" ]; then
    log "cloning $REPO_URL"
    git clone --quiet --filter=blob:none "$REPO_URL" "$DIR" || { log "clone failed"; return 1; }
  fi
  if git -C "$DIR" fetch --quiet origin 2>/dev/null; then
    git -C "$DIR" checkout --quiet --detach "$REF" || { log "cannot check out $REF"; return 1; }
  else
    log "GitHub not reachable; using the code already checked out ($(git -C "$DIR" rev-parse --short HEAD))"
  fi
}
check_env() {
  for name in PGHOST PGUSER PGDATABASE PGPASSWORD; do
    [ -n "${!name:-}" ] || { log "$name is not set (see backup/README.md)"; return 1; }
  done
}
run_once() {
  local stamp code
  stamp="$(TZ="$RUN_TZ" date +%Y%m%d-%H%M%S)"
  get_code || { log "no code to run"; return 90; }
  log "starting (code $(git -C "$DIR" rev-parse --short HEAD)) $*"
  bash "$DIR/scripts/backup/ds1-backup.sh" "$@" 2>&1 | tee "$DATA/logs/run-$stamp.log"
  code="${PIPESTATUS[0]}"
  if [ "$code" -eq 0 ]; then log "finished ok"; else log "FAILED (exit $code); output in $DATA/logs/run-$stamp.log"; fi
  find "$DATA/logs" -type f -mtime +60 -delete 2>/dev/null
  return "$code"
}

if ! check_env; then sleep 600; exit 1; fi
if [ "${1:-}" = "once" ]; then shift; run_once "$@"; exit $?; fi

log "waiting for $SLOT $RUN_TZ each day"
while true; do
  now="$(date +%s)"; today="$(TZ="$RUN_TZ" date +%F)"
  due="$(at_epoch today "$SLOT")"
  last_ok="$(cat "$DATA/ok" 2>/dev/null || true)"
  tdate=""; tcount=0; tlast=0
  [ -f "$DATA/tries" ] && read -r tdate tcount tlast < "$DATA/tries"
  [ "$tdate" = "$today" ] || { tcount=0; tlast=0; }
  if [ "$now" -ge "$due" ] && [ "$last_ok" != "$today" ] && [ "$tcount" -lt "$MAX_TRIES" ] && [ $((now - tlast)) -ge "$RETRY_SECS" ]; then
    tcount=$((tcount + 1))
    echo "$today $tcount $now" > "$DATA/tries"
    if run_once; then echo "$today" > "$DATA/ok"; else log "try $tcount of $MAX_TRIES failed for $today"; fi
    continue
  fi
  if [ "$now" -lt "$due" ]; then wake="$due"
  elif [ "$last_ok" != "$today" ] && [ "$tcount" -lt "$MAX_TRIES" ]; then wake=$((tlast + RETRY_SECS))
  else wake="$(at_epoch tomorrow "$SLOT")"; fi
  [ "$wake" -gt "$now" ] || wake=$((now + 60))
  log "sleeping until $(TZ="$RUN_TZ" date -d "@$wake" '+%Y-%m-%d %H:%M %Z')"
  sleep $((wake - now))
done

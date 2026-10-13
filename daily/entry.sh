#!/bin/bash
# The daily scores job: once a day at DAILY_TIME (default 10:00) in DAILY_TZ (default America/Toronto) run
#   scripts/daily/run.py --apply
# which fetches the clubs' season articles from Wikipedia, cross-checks them and writes the results to DS1 only.
# Between runs the container just sleeps: nothing is fetched, polled or connected to except at the daily run.
# The code is the public repo, fetched read-only from GitHub at the daily run and checked out at DAILY_REF (default origin/main;
# set it to a commit sha to pin the job to that commit). The run re-checks the last 7 days itself (run.py --since default).
#
#   entry.sh            the daily loop (what the container does)
#   entry.sh once [run.py arguments]   one run now, then exit (default arguments: --apply); no schedule files are touched.
#                                      For a test: entry.sh once --dry-run
#
# A day that fails is tried again after DAILY_RETRY_SECS (default 3600), up to DAILY_MAX_TRIES (default 3) times that day.
# Every --apply run also leaves a row in DS1's ingest.daily_run (started, finished, outcome, counts): see daily/README.md.
set -u
REPO_URL="${DAILY_REPO_URL:-https://github.com/spxis/spx-stats.git}"
REF="${DAILY_REF:-origin/main}"
DIR="${DAILY_REPO:-/work/repo}"
RUN_TZ="${DAILY_TZ:-America/Toronto}"
RUN_TIME="${DAILY_TIME:-10:00}"
RETRY_SECS="${DAILY_RETRY_SECS:-3600}"
MAX_TRIES="${DAILY_MAX_TRIES:-3}"
DATA="${DAILY_DATA:-/data}"
RUN="$DIR/scripts/daily/run.py"
export SPX_DAILY_CACHE="${SPX_DAILY_CACHE:-$DATA/cache}"
mkdir -p "$DATA/logs" "$SPX_DAILY_CACHE"

log() { echo "$(TZ="$RUN_TZ" date '+%Y-%m-%d %H:%M:%S %Z') daily: $*"; }
at_epoch() { TZ="$RUN_TZ" date -d "$1 $RUN_TIME" +%s; }       # $1: today | tomorrow

get_code() {
  if [ ! -d "$DIR/.git" ]; then
    log "cloning $REPO_URL"
    git clone --quiet --filter=blob:none "$REPO_URL" "$DIR" || { log "clone failed"; return 1; }
  fi
  git -C "$DIR" fetch --quiet origin && git -C "$DIR" checkout --quiet --detach "$REF"
}

check_env() {
  for name in PGHOST PGUSER PGDATABASE PGPASSWORD; do
    [ -n "${!name:-}" ] || { log "$name is not set (see daily/README.md)"; return 1; }
  done
}

# one run; extra arguments go to run.py (default --apply). Returns run.py's exit code.
run_once() {
  local args=("$@") stamp
  [ "${#args[@]}" -gt 0 ] || args=(--apply)
  stamp="$(TZ="$RUN_TZ" date +%Y%m%d-%H%M%S)"
  if ! get_code; then log "could not update the code from GitHub"; return 90; fi
  log "starting: run.py ${args[*]} (code $(git -C "$DIR" rev-parse --short HEAD))"
  python3 -I "$RUN" "${args[@]}" --state "$SPX_DAILY_CACHE/state.json" --raw-dir "$SPX_DAILY_CACHE/raw" --log-dir "$DATA/logs" 2>&1 | tee "$DATA/logs/run-$stamp.log"
  local code="${PIPESTATUS[0]}"
  if [ "$code" -eq 0 ]; then log "run finished ok"; else log "run FAILED (exit $code); output in $DATA/logs/run-$stamp.log"; fi
  find "$DATA/logs" -type f -mtime +60 -delete 2>/dev/null
  return "$code"
}

if ! check_env; then sleep 600; exit 1; fi

if [ "${1:-}" = "once" ]; then
  shift
  run_once "$@"
  exit $?
fi

log "waiting for $RUN_TIME $RUN_TZ each day (job not started yet)"
while true; do
  now="$(date +%s)"
  today="$(TZ="$RUN_TZ" date +%F)"
  due="$(at_epoch today)"
  last_ok="$(cat "$DATA/last_ok" 2>/dev/null || true)"
  tdate=""; tcount=0; tlast=0
  [ -f "$DATA/tries" ] && read -r tdate tcount tlast < "$DATA/tries"
  [ "$tdate" = "$today" ] || { tcount=0; tlast=0; }
  if [ "$now" -ge "$due" ] && [ "$last_ok" != "$today" ] && [ "$tcount" -lt "$MAX_TRIES" ] && [ $((now - tlast)) -ge "$RETRY_SECS" ]; then
    tcount=$((tcount + 1)); tlast="$now"
    echo "$today $tcount $tlast" > "$DATA/tries"
    if run_once; then echo "$today" > "$DATA/last_ok"; else log "try $tcount of $MAX_TRIES failed for $today"; fi
    continue
  fi
  # sleep to the next thing that can happen: today's time, a retry, or tomorrow's time
  if [ "$now" -lt "$due" ]; then wake="$due"
  elif [ "$last_ok" != "$today" ] && [ "$tcount" -lt "$MAX_TRIES" ]; then wake=$((tlast + RETRY_SECS))
  else wake="$(at_epoch tomorrow)"; fi
  [ "$wake" -gt "$now" ] || wake=$((now + 60))
  log "sleeping until $(TZ="$RUN_TZ" date -d "@$wake" '+%Y-%m-%d %H:%M %Z')"
  sleep $((wake - now))
done

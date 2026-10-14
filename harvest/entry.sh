#!/bin/bash
# The harvest job: reads English Wikipedia and Wikidata for the history DS1 does not have yet, one request at a time, all day.
# The container runs this loop; the code is the public repo, fetched read-only from GitHub at the start of every cycle (about an hour) and
# checked out at HARVEST_REF (default origin/main; set a commit sha to pin the job to a reviewed commit).
#
#   entry.sh                      the loop (what the container does): one worker cycle of HARVEST_CYCLE_SECS (3600), then fetch the code again
#   entry.sh status [--measure]   what the job is doing (scripts/harvest/status.py)
#   entry.sh plan [--everything]  one planner run now
#   entry.sh once                 drain whatever is due now, then exit (no waiting)
#   entry.sh reparse [...]        read the archived pages again with the current parsers (no request)
#
# The worker stands still around the daily scores run and while it holds its lock (scripts/harvest/pause.py). Everything it learns is written to DS1 only.
set -u
REPO_URL="${HARVEST_REPO_URL:-https://github.com/spxis/spx-stats.git}"
REF="${HARVEST_REF:-origin/main}"
DIR="${HARVEST_REPO:-/work/repo}"
DATA="${HARVEST_DATA:-/data}"
H="$DIR/scripts/harvest"
mkdir -p "$DATA/logs"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S %Z') harvest-loop: $*"; }

get_code() {
  if [ ! -d "$DIR/.git" ]; then
    log "cloning $REPO_URL"
    git clone --quiet --filter=blob:none "$REPO_URL" "$DIR" || { log "clone failed"; return 1; }
  fi
  git -C "$DIR" fetch --quiet origin && git -C "$DIR" checkout --quiet --detach "$REF"
}

check_env() {
  for name in PGHOST PGUSER PGDATABASE PGPASSWORD; do
    [ -n "${!name:-}" ] || { log "$name is not set (see harvest/README.md)"; return 1; }
  done
}

check_env || { sleep 600; exit 1; }

case "${1:-}" in
  status) get_code || exit 1; shift; exec python3 -I "$H/status.py" "$@" ;;
  plan) get_code || exit 1; shift; exec python3 -I "$H/harvest.py" plan "$@" ;;
  once) get_code || exit 1; shift; exec python3 -I "$H/harvest.py" run --once "$@" ;;
  reparse) get_code || exit 1; shift; exec python3 -I "$H/harvest.py" reparse "$@" ;;
  "") ;;
  *) echo "usage: entry.sh [status|plan|once|reparse] [arguments]" >&2; exit 2 ;;
esac

fails=0
while true; do
  if ! get_code; then
    log "could not update the code from GitHub"
    [ -f "$H/harvest.py" ] || { sleep 300; continue; }      # nothing to run yet; otherwise go on with the checkout we have
  fi
  log "cycle starting (code $(git -C "$DIR" rev-parse --short HEAD))"
  start="$(date +%s)"
  python3 -I "$H/harvest.py" run 2>&1 | tee -a "$DATA/logs/harvest-$(date +%F).log"
  code="${PIPESTATUS[0]}"
  elapsed=$(( $(date +%s) - start ))
  # a cycle that ends early or badly (DS1 not answering, a bug) is waited out, longer each time, never retried in a tight loop
  if [ "$code" -ne 0 ] || [ "$elapsed" -lt 120 ]; then
    fails=$((fails + 1)); wait=$((300 * fails)); [ "$wait" -gt 3600 ] && wait=3600
    log "cycle ended after ${elapsed}s with exit $code; waiting ${wait}s (failure $fails in a row)"
  else
    fails=0; wait=5
  fi
  find "$DATA/logs" -type f -mtime +30 -delete 2>/dev/null
  sleep "$wait"
done

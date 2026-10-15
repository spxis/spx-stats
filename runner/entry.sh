#!/bin/bash
# The release runner: every 60 seconds apply the releases John approved; once a night run the drift check.
# One job at a time (this loop is sequential, and release.py run also takes a lock). Logs go to stdout.
# The code is the public repo, fetched read-only from GitHub and checked out at RELEASE_REF (default origin/main;
# set it to a commit sha to pin the runner to that commit).
set -u
REPO_URL="${RELEASE_REPO_URL:-https://github.com/spxis/spx-stats.git}"
REF="${RELEASE_REF:-origin/main}"
DIR="${RELEASE_REPO:-/work/repo}"
DRIFT_HOUR="${DRIFT_HOUR:-3}"
RELEASE="$DIR/scripts/release/release.py"
mkdir -p "${RELEASE_SNAPSHOT_DIR:-/data/snapshots}" /data

log() { echo "$(date -u '+%Y-%m-%d %H:%M:%S') runner: $*"; }

if [ ! -d "$DIR/.git" ]; then
  log "cloning $REPO_URL"
  git clone --quiet --filter=blob:none "$REPO_URL" "$DIR" || { log "clone failed"; sleep 60; exit 1; }
fi

for name in SUPABASE_ACCESS_TOKEN PGHOST PGUSER PGDATABASE PGPASSWORD; do
  [ -n "${!name:-}" ] || { log "$name is not set (see runner/README.md)"; sleep 60; exit 1; }
done

# The API watchdog (scripts/release/watchdog.py) runs beside the release loop, not inside it, so a long scores update cannot
# stop the probes. One probe a minute. WATCHDOG=0 in release-runner.env switches it off. It runs the code at REF, so a new
# version of it needs no rebuild of the image.
if [ "${WATCHDOG:-1}" = "0" ]; then
  log "watchdog: off (WATCHDOG=0)"
else
  (
    while true; do
      [ -f "$DIR/scripts/release/watchdog.py" ] && python3 -I "$DIR/scripts/release/watchdog.py" || true
      sleep "${WATCHDOG_INTERVAL:-60}"
    done
  ) &
fi

# The ops snapshot and controls (scripts/release/ops.py) run beside the release loop too, for the same reason: one tick a minute reads the
# requests an admin made on /admin/ops (pause and resume the harvester, snapshot now) and every 15 minutes pushes one status snapshot of
# the DS1 side to production. OPS_SNAPSHOT=0 in release-runner.env switches it off. It runs the code at REF, so no rebuild is needed.
if [ "${OPS_SNAPSHOT:-1}" = "0" ]; then
  log "ops snapshot: off (OPS_SNAPSHOT=0)"
else
  (
    while true; do
      [ -f "$DIR/scripts/release/ops.py" ] && python3 -I "$DIR/scripts/release/ops.py" || true
      sleep "${OPS_INTERVAL:-60}"
    done
  ) &
fi

while true; do
  if git -C "$DIR" fetch --quiet origin && git -C "$DIR" checkout --quiet --detach "$REF"; then
    python3 -I "$RELEASE" run || log "run exited with $?"
    today="$(date -u +%F)"
    hour=$((10#$(date -u +%H)))
    now="$(date -u +%s)"
    last_ok="$(cat /data/last_drift 2>/dev/null || true)"
    last_try="$(cat /data/last_drift_try 2>/dev/null || echo 0)"
    if [ "$hour" -ge "$DRIFT_HOUR" ] && [ "$last_ok" != "$today" ] && [ $((now - last_try)) -ge 3600 ]; then
      echo "$now" > /data/last_drift_try
      log "starting the nightly drift check"
      python3 -I "$RELEASE" drift
      code=$?
      if [ "$code" -le 1 ]; then
        echo "$today" > /data/last_drift
        log "drift check finished (exit $code)"
      else
        log "drift check failed (exit $code); will try again in an hour"
      fi
    fi
  else
    log "could not update the code from GitHub; trying again"
  fi
  sleep 60
done

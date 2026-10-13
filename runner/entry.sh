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

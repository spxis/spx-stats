#!/bin/bash
# Preview the site on this Mac, reading DS1 instead of production. Two modes.
#
# On demand (from this checkout, stops when you stop it):
#   bash scripts/mac/ds1-preview.sh [--port N] [--pgrst-port N] [--start] [--detach]
#   bash scripts/mac/ds1-preview.sh --stop [--port N]
# Always on (Docker Compose project spx-ds1-preview, restarts with Docker; http://localhost:7700):
#   bash scripts/mac/ds1-preview.sh --install [--nightly] [--ref REV]
#   bash scripts/mac/ds1-preview.sh --update [--force] [--ref REV]     --status     --uninstall
#
# On demand: starts a PostgREST in Docker against DS1 (read-only; scripts/mac/lib/ds1-pgrst.sh, shared with deploy-prebuilt.sh) on the
# first free port from 7730, then runs the site from this checkout's web/ with SPX_REST_URL pointing at it: `next dev` on the first free
# port from 7702. Ctrl-C (or the end of the script) stops the server and removes the container. Every data read of the site (pages, the
# release footer and admin reads) goes through web/src/lib/api/config.ts, and SPX_REST_URL is accepted there only for a loopback address
# (or the always-on project's `pgrst` service when SPX_PREVIEW=1), so nothing in either mode reaches production Supabase for data.
#   --port N        the site's port (7700-7799; default: the first free one from 7702 to 7729)
#   --pgrst-port N  the PostgREST port (7700-7799; default: the first free one from 7730 to 7749)
#   --start         `next build` then `next start` instead of `next dev`, a production-like check; the build reads DS1 only
#   --detach        leave both running in the background; the state is written to ~/Library/Caches/spx-stats/ and the stop command is printed
#   --stop          stop the detached previews (all of them, or the one on --port): server killed by its own pids, container removed
# `next dev` runs with --webpack: Turbopack's dev server fails on this site's next/font/google fonts (HTTP 500). SPX_PREVIEW_NEXT_ARGS=""
# turns that off (or passes other flags). Next allows one dev server per checkout; use a worktree for a second.
#
# Always on: one PostgREST (127.0.0.1:7750) and the site (production build, 127.0.0.1:7700) in Docker, restart unless stopped, reading DS1.
# The DS1 password goes from the keychain into a 600-permission file under ~/Library/Application Support/spx-stats/ (never printed, never in
# the repository, never on a command line). Pages are rebuilt from DS1 every 5 minutes (SPX_REVALIDATE=300; honoured only in preview mode).
# Sign-in: a second 600 file (ds1-preview-auth.env) holds a signing secret made once, NEXTAUTH_URL=http://localhost:7700 and, from the keychain
# items 'spx-stats AUTH_GOOGLE_ID', 'spx-stats AUTH_GOOGLE_SECRET', 'spx-stats ADMIN_EMAILS' (zsh scripts/mac/spx-credentials.sh auth), real Google sign-in;
# without them only "Sign in (this Mac)" (loopback and SPX_PREVIEW only; web/src/lib/auth/preview.ts). Moving from 3150/3180: --update does it.
#   --install   create the env file, build the image from REV (default origin/main) in a clean git archive, start, wait, print the address
#   --nightly   with --install: also add a launchd agent that runs --update at 04:30 (opt-in; local and free)
#   --update    git fetch, and when REV moved (or --force) rebuild the image from a clean archive and recreate the site; the pages are then
#               rebuilt inside the container, so the site is down for the length of a build
#   --status    containers, image commit, origin/main, launchd agent, one local page request
#   --uninstall remove containers, volume, image, launchd agent and the env file
#   --ref REV   the commit to build (default origin/main; HEAD tests a checkout)
# Needs: Docker running, git, python3, curl, lsof; on demand also node 22.18+, pnpm and web/node_modules; DS1 on the home LAN or Tailscale and its
# password (keychain item 'spx-stats-db DS1 55440' or SPX_DS1_DB_PASSWORD).
# Settings for tests: SPX_DS1_HOST, SPX_DS1_PORT, SPX_DS1_DB_NAME, SPX_DS1_DB_USER, SPX_PREVIEW_SITE_PORT, SPX_PREVIEW_PGRST_PORT,
# SPX_PREVIEW_ENV_FILE, SPX_PREVIEW_AUTH_ENV_FILE, SPX_PREVIEW_LAUNCHD_DIR, SPX_PREVIEW_NO_LAUNCHCTL, SPX_REVALIDATE.

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/spx-checks.sh"
. "$HERE/lib/ds1-pgrst.sh"
. "$HERE/lib/hosted-logos.sh"
set -u

STATE_DIR="$HOME/Library/Caches/spx-stats"
NAME="spx-preview-pgrst-$$"
PORT="" PGRST_PORT="" START=0 DETACH=0 STOP=0
INSTALL=0 UPDATE=0 STATUS=0 UNINSTALL=0 NIGHTLY=0 FORCE=0 REF=""
DEV_PID="" KEEP_RUNNING=0 TMP=""

# Always-on settings
PROJECT="spx-ds1-preview"
SITE_PORT="${SPX_PREVIEW_SITE_PORT:-7700}"
AO_PGRST_PORT="${SPX_PREVIEW_PGRST_PORT:-7750}"
SUPPORT_DIR="$HOME/Library/Application Support/spx-stats"
ENV_FILE="${SPX_PREVIEW_ENV_FILE:-$SUPPORT_DIR/ds1-preview.env}"
AUTH_ENV_FILE="${SPX_PREVIEW_AUTH_ENV_FILE:-$SUPPORT_DIR/ds1-preview-auth.env}"
GOOGLE_SIGNIN=0
LAUNCHD_DIR="${SPX_PREVIEW_LAUNCHD_DIR:-$HOME/Library/LaunchAgents}"
LABEL="com.spxstats.ds1-preview"
IMAGE_TAG="spx-ds1-preview-site:local"
REVALIDATE_SECONDS="${SPX_REVALIDATE:-300}"

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift ;;
    --pgrst-port) PGRST_PORT="${2:-}"; shift ;;
    --start) START=1 ;;
    --detach) DETACH=1 ;;
    --stop) STOP=1 ;;
    --install) INSTALL=1 ;;
    --update) UPDATE=1 ;;
    --status) STATUS=1 ;;
    --uninstall) UNINSTALL=1 ;;
    --nightly) NIGHTLY=1 ;;
    --force) FORCE=1 ;;
    --ref) REF="${2:-}"; shift ;;
    -h|--help) sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $1"; exit 2 ;;
  esac
  shift
done

say() { printf '%s ds1-preview: %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { say "STOP: $*"; exit 1; }
busy() { lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
in_block() { case "$1" in ''|*[!0-9]*) return 1 ;; esac; [ "$1" -ge 7700 ] && [ "$1" -le 7799 ]; }
first_free() { local p; for p in $(seq "$1" "$2"); do busy "$p" || { printf '%s' "$p"; return 0; }; done; return 1; }
# Only ever our own processes: the server we started and what it started.
kill_tree() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$c"; done; kill "$1" 2>/dev/null || true; }
is_next() { ps -p "$1" -o command= 2>/dev/null | grep -q 'next'; }
state_get() { grep "^$2=" "$1" 2>/dev/null | head -1 | cut -d= -f2-; }
need() { local t; for t in "$@"; do command -v "$t" >/dev/null 2>&1 || die "$t is not installed"; done; docker info >/dev/null 2>&1 || die "Docker is not running"; }

# ---- the always-on project ---------------------------------------------------------------------------------------------------------
compose() {
  PGRST_IMAGE="$PGRST_IMAGE" SPX_PREVIEW_ENV_FILE="$ENV_FILE" SPX_PREVIEW_AUTH_ENV_FILE="$AUTH_ENV_FILE" SPX_PREVIEW_BIND="127.0.0.1" SPX_PREVIEW_SITE_PORT="$SITE_PORT" \
  SPX_PREVIEW_PGRST_PORT="$AO_PGRST_PORT" SPX_REVALIDATE="$REVALIDATE_SECONDS" SPX_PREVIEW_SRC="${SRC:-}" SPX_PREVIEW_SHA="${SHORT:-unknown}" \
    docker compose -p "$PROJECT" -f "$HERE/ds1-preview/docker-compose.yml" "$@"
}
running_ids() { compose ps -q 2>/dev/null; }
installed() { [ -f "$ENV_FILE" ] && [ -n "$(docker image ls -q "$IMAGE_TAG" 2>/dev/null)" ]; }
image_sha() { docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$IMAGE_TAG" 2>/dev/null; }

# The env file: PGRST_DB_URI with the DS1 password. The password is read in this process, goes through a pipe to python and from there into a
# file created 600 in a 700 directory; it never appears on a command line or on the screen.
write_env() {
  local host pw dir tmp
  host="${SPX_DS1_HOST:-}"
  [ -n "$host" ] || host="$(ds1_host)" || die "DS1 $(ds1_missing)"
  pw="${SPX_DS1_DB_PASSWORD:-}"
  [ -n "$pw" ] || pw="$(kc_get 'spx-stats-db DS1 55440')"
  [ -n "$pw" ] || die "no DS1 password: the keychain item 'spx-stats-db DS1 55440' is missing here (zsh scripts/mac/spx-credentials.sh parity)"
  dir="$(dirname "$ENV_FILE")"
  mkdir -p "$dir" && chmod 700 "$dir" || die "cannot create $dir"
  tmp="$(umask 077; mktemp "$dir/.ds1-preview.XXXXXX")" || die "cannot create a file in $dir"
  printf '%s' "$pw" | python3 -I -c 'import sys, urllib.parse
user, host, port, db = sys.argv[1:5]
print("PGRST_DB_URI=postgres://%s:%s@%s:%s/%s" % (user, urllib.parse.quote(sys.stdin.read(), safe=""), host, port, db))' \
    "$DB_USER" "$host" "$SPX_DS1_PORT" "$DB_NAME" > "$tmp" || { rm -f "$tmp"; die "could not write the env file"; }
  unset pw
  chmod 600 "$tmp" && mv "$tmp" "$ENV_FILE" || die "could not place $ENV_FILE"
}

# The sign-in settings of the always-on site, in a second 600 file (so the PostgREST container never gets them): a signing secret made here
# once and kept (never printed), NEXTAUTH_URL / AUTH_URL = http://localhost:<site port> so Google's callback matches the registered address
# exactly, and, when the keychain holds them, the Google client (items 'spx-stats AUTH_GOOGLE_ID' and 'spx-stats AUTH_GOOGLE_SECRET') and
# ADMIN_EMAILS ('spx-stats ADMIN_EMAILS'). Without the Google items the site still offers "Sign in (this Mac)" (web/src/lib/auth/preview.ts:
# SPX_PREVIEW=1 and a loopback host only). Values are read in this process and written straight to the file; none reaches a command line or the screen.
auth_value_ok() { printf '%s' "$1" | grep -Eq '^[A-Za-z0-9._@,+/=:-]+$'; }
write_auth_env() {
  local dir tmp secret id gsecret admins have_id=0 have_secret=0 have_admins=0
  dir="$(dirname "$AUTH_ENV_FILE")"
  mkdir -p "$dir" && chmod 700 "$dir" || die "cannot create $dir"
  secret="$(grep '^AUTH_SECRET=' "$AUTH_ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)"
  auth_value_ok "$secret" || secret="$(openssl rand -hex 32)" || die "openssl could not make the signing secret"
  id="$(kc_get 'spx-stats AUTH_GOOGLE_ID')"; gsecret="$(kc_get 'spx-stats AUTH_GOOGLE_SECRET')"; admins="$(kc_get 'spx-stats ADMIN_EMAILS')"
  [ -n "$id" ] && auth_value_ok "$id" && have_id=1
  [ -n "$gsecret" ] && auth_value_ok "$gsecret" && have_secret=1
  [ -n "$admins" ] && auth_value_ok "$admins" && have_admins=1
  tmp="$(umask 077; mktemp "$dir/.ds1-preview-auth.XXXXXX")" || die "cannot create a file in $dir"
  {
    printf 'AUTH_SECRET=%s\nNEXTAUTH_URL=http://localhost:%s\nAUTH_URL=http://localhost:%s\n' "$secret" "$SITE_PORT" "$SITE_PORT"
    if [ "$have_id" = 1 ] && [ "$have_secret" = 1 ]; then printf 'AUTH_GOOGLE_ID=%s\nAUTH_GOOGLE_SECRET=%s\n' "$id" "$gsecret"; fi
    if [ "$have_admins" = 1 ]; then printf 'ADMIN_EMAILS=%s\n' "$admins"; fi
  } > "$tmp" || { rm -f "$tmp"; die "could not write the sign-in settings"; }
  unset secret id gsecret admins
  chmod 600 "$tmp" && mv "$tmp" "$AUTH_ENV_FILE" || die "could not place $AUTH_ENV_FILE"
  if [ "$have_id" = 1 ] && [ "$have_secret" = 1 ]; then GOOGLE_SIGNIN=1; else GOOGLE_SIGNIN=0; fi
}
google_hint() {
  if [ "${GOOGLE_SIGNIN:-0}" = 1 ]; then say "sign-in: Google (client from the keychain) at http://localhost:$SITE_PORT/login, plus \"Sign in (this Mac)\""
  else
    say "sign-in: only \"Sign in (this Mac)\" for now (no Google client in the keychain). For real Google sign-in run:"
    say "  zsh $HERE/spx-credentials.sh auth && bash $HERE/ds1-preview.sh --update"
  fi
}

# If the project's containers still publish ports other than the ones wanted now (the preview used to be on 3150 and 3180), stop the project by
# its compose project name and remove its containers (the `next` volume stays); the `up` that follows creates them on the new ports.
migrate_ports() {
  local id p stale=0
  for id in $(running_ids); do
    for p in $(docker port "$id" 2>/dev/null | sed -n 's/.*:\([0-9]*\)$/\1/p'); do
      [ "$p" = "$SITE_PORT" ] || [ "$p" = "$AO_PGRST_PORT" ] || stale=1
    done
  done
  [ "$stale" = 1 ] || return 0
  say "the preview was published on other ports: stopping the compose project $PROJECT before it comes up on $SITE_PORT and $AO_PGRST_PORT"
  compose down --remove-orphans >/dev/null 2>&1 || say "warning: compose down reported a problem"
}

# prepare_src <rev>: SRC = a clean copy of that commit (git archive) with this checkout's preview files laid over it; SHORT = its short sha.
prepare_src() {
  local rev="$1" sha
  git -C "$REPO" fetch -q origin || say "warning: git fetch failed; using what this checkout already has"
  sha="$(git -C "$REPO" rev-parse --verify "$rev^{commit}" 2>/dev/null)" || die "no such commit: $rev"
  SHORT="$(git -C "$REPO" rev-parse --short "$sha")"
  SRC="$(mktemp -d "${TMPDIR:-/tmp}/spx-ds1-preview.XXXXXX")"
  TMP="$SRC"
  git -C "$REPO" archive "$sha" | tar -x -C "$SRC" || die "git archive failed"
  mkdir -p "$SRC/scripts/mac/ds1-preview"
  cp "$HERE/ds1-preview/Dockerfile" "$HERE/ds1-preview/site-entry.sh" "$SRC/scripts/mac/ds1-preview/" || die "no preview files next to this script"
  # The SportsLogos.Net files the site serves itself (/team-logos/sl/..., not in git) come from DS1's archive into the image's web/public (sha256 checked;
  # stops when a logo a brand row names is missing). New files alone do not move the commit: use --update --force to rebuild for them.
  hosted_logos_export "$SRC/web"
}

build_and_up() {
  say "building the site image from $SHORT (clean copy of the commit)"
  compose build --quiet site >/dev/null || die "the image build failed"
  rm -rf "$SRC"; TMP=""
  migrate_ports
  compose up -d || die "docker compose could not start the project"
}

# wait_ready: the site answers on its port (the first start builds the pages from DS1 inside the container, which takes minutes).
wait_ready() {
  local i code="000" cid
  for i in $(seq 1 90); do
    code="$(curl -s -m 20 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$SITE_PORT/")"
    if [ "$code" != 000 ] && [ "$code" != 502 ]; then break; fi
    cid="$(compose ps -q site 2>/dev/null)"
    [ -n "$cid" ] && docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null | grep -q true || { say "the site container stopped; last log lines:"; compose logs --tail 15 site 2>&1 | sed 's#postgres://[^ ]*#postgres://***#g'; die "the site is not running"; }
    [ $((i % 6)) -ne 0 ] || say "still building the pages from DS1 ($((i * 10)) s)"
    sleep 10
  done
  [ "$code" != 000 ] && [ "$code" != 502 ] || die "the site did not answer within 15 minutes (docker compose -p $PROJECT logs site)"
  [ "$code" = 200 ] || say "warning: the first page answered HTTP $code"
}

plist_path() { printf '%s/%s.plist' "$LAUNCHD_DIR" "$LABEL"; }
install_nightly() {
  local p logdir; p="$(plist_path)"; logdir="$HOME/Library/Logs/spx-stats"
  case "$HERE" in */.claude/worktrees/*) say "warning: this checkout is a worktree that may be removed; run --install --nightly from ~/Projects/spx-stats so the 04:30 job keeps working" ;; esac
  mkdir -p "$LAUNCHD_DIR" "$logdir" || die "cannot create $LAUNCHD_DIR"
  cat > "$p" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$HERE/ds1-preview.sh</string><string>--update</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Applications/Docker.app/Contents/Resources/bin</string></dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>$logdir/ds1-preview-update.log</string>
  <key>StandardErrorPath</key><string>$logdir/ds1-preview-update.log</string>
</dict>
</plist>
PLIST
  plutil -lint "$p" >/dev/null || die "the launchd file is not valid: $p"
  if [ "${SPX_PREVIEW_NO_LAUNCHCTL:-}" != 1 ]; then
    launchctl bootout "gui/$(id -u)" "$p" >/dev/null 2>&1 || true
    launchctl bootstrap "gui/$(id -u)" "$p" || die "launchctl could not load $p"
  fi
  say "nightly refresh on: $LABEL runs --update at 04:30 (log $logdir/ds1-preview-update.log); remove it with --uninstall"
}
remove_nightly() {
  local p; p="$(plist_path)"
  [ -f "$p" ] || return 0
  [ "${SPX_PREVIEW_NO_LAUNCHCTL:-}" = 1 ] || launchctl bootout "gui/$(id -u)" "$p" >/dev/null 2>&1 || true
  rm -f "$p"
}

cleanup_tmp() { [ -n "$TMP" ] && [ -d "$TMP" ] && rm -rf "$TMP"; }

if [ "$INSTALL" = 1 ] || [ "$UPDATE" = 1 ] || [ "$STATUS" = 1 ] || [ "$UNINSTALL" = 1 ]; then
  trap cleanup_tmp EXIT
  trap 'exit 130' INT TERM
  in_block "$SITE_PORT" && in_block "$AO_PGRST_PORT" || die "the always-on ports must be in 7700-7799"
  SRC="" SHORT=""
fi

# ---- --install ---------------------------------------------------------------------------------------------------------------------
if [ "$INSTALL" = 1 ]; then
  need docker git python3 curl lsof
  if [ -z "$(running_ids)" ]; then
    for p in "$SITE_PORT" "$AO_PGRST_PORT"; do busy "$p" && die "port $p is in use (SPX_PREVIEW_SITE_PORT / SPX_PREVIEW_PGRST_PORT pick others in 7700-7799): $(lsof -iTCP:"$p" -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $1}')"; done
  fi
  write_env
  say "DS1 password stored in $ENV_FILE (permissions 600)"
  write_auth_env; say "sign-in settings stored in $AUTH_ENV_FILE (permissions 600; the signing secret is made once and never shown)"
  prepare_src "${REF:-origin/main}"
  build_and_up
  wait_ready
  [ "$NIGHTLY" != 1 ] || install_nightly
  say "ready: http://localhost:$SITE_PORT/  (PostgREST on 127.0.0.1:$AO_PGRST_PORT; data from DS1, read-only; pages refresh every ${REVALIDATE_SECONDS}s)"
  google_hint
  say "later: --update, --status, --uninstall"
  exit 0
fi

# ---- --update ----------------------------------------------------------------------------------------------------------------------
if [ "$UPDATE" = 1 ]; then
  need docker git python3 curl
  installed || die "not installed: run  bash $HERE/ds1-preview.sh --install"
  prepare_src "${REF:-origin/main}"
  if [ "$FORCE" != 1 ] && [ "$(image_sha)" = "$SHORT" ] && [ -n "$(running_ids)" ]; then
    say "up to date at $SHORT"
    # DS1 may have moved to another address (home LAN or Tailscale): refresh the env file; compose recreates the PostgREST only if it changed.
    ( write_env ) >/dev/null 2>&1; write_auth_env; migrate_ports
    compose up -d >/dev/null 2>&1
    google_hint
    exit 0
  fi
  ( write_env ) >/dev/null 2>&1 || say "kept the existing env file"
  write_auth_env
  build_and_up
  wait_ready
  say "updated to $SHORT: http://localhost:$SITE_PORT/"
  google_hint
  exit 0
fi

# ---- --status ----------------------------------------------------------------------------------------------------------------------
if [ "$STATUS" = 1 ]; then
  need docker git curl
  if ! installed; then say "not installed (bash $HERE/ds1-preview.sh --install)"; exit 0; fi
  compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Health}}\t{{.Ports}}' 2>/dev/null
  git -C "$REPO" fetch -q origin >/dev/null 2>&1 || true
  say "image built from $(image_sha); origin/main is $(git -C "$REPO" rev-parse --short origin/main 2>/dev/null)"
  say "env file: $ENV_FILE ($(stat -f '%Lp' "$ENV_FILE" 2>/dev/null || echo missing))"
  say "sign-in settings: $AUTH_ENV_FILE ($(stat -f '%Lp' "$AUTH_ENV_FILE" 2>/dev/null || echo missing)); Google client $(grep -q '^AUTH_GOOGLE_ID=' "$AUTH_ENV_FILE" 2>/dev/null && echo set || echo not set)"
  if [ -f "$(plist_path)" ]; then say "nightly refresh: on ($LABEL, 04:30)"; else say "nightly refresh: off (--install --nightly turns it on)"; fi
  say "http://localhost:$SITE_PORT/ answers HTTP $(curl -s -m 20 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$SITE_PORT/") (one local request)"
  exit 0
fi

# ---- --uninstall -------------------------------------------------------------------------------------------------------------------
if [ "$UNINSTALL" = 1 ]; then
  need docker
  if [ ! -f "$ENV_FILE" ]; then mkdir -p "$(dirname "$ENV_FILE")"; ( umask 077; : > "$ENV_FILE" ); fi   # compose wants the file to exist
  if [ ! -f "$AUTH_ENV_FILE" ]; then ( umask 077; : > "$AUTH_ENV_FILE" ); fi
  compose down -v --remove-orphans >/dev/null 2>&1 || say "warning: compose down reported a problem"
  docker image rm "$IMAGE_TAG" >/dev/null 2>&1 || true
  remove_nightly
  rm -f "$ENV_FILE" "$AUTH_ENV_FILE"
  say "removed: containers, volume, image, nightly agent and the env files"
  exit 0
fi

# ---- --stop ------------------------------------------------------------------------------------------------------------------------
if [ "$STOP" = 1 ]; then
  [ -z "$PORT" ] || in_block "$PORT" || die "--port must be in 7700-7799"
  found=0
  for f in "$STATE_DIR"/ds1-preview-*.state; do
    [ -f "$f" ] || continue
    [ -z "$PORT" ] || [ "$(state_get "$f" port)" = "$PORT" ] || continue
    found=1
    c="$(state_get "$f" container)"; [ -z "$c" ] || ds1_pgrst_stop "$c"
    for p in $(state_get "$f" pid) $(state_get "$f" listen_pids); do
      if is_next "$p"; then kill_tree "$p"; fi
    done
    say "stopped the preview on port $(state_get "$f" port) (container $c)"
    rm -f "$(state_get "$f" log)" "$f"
  done
  [ "$found" = 1 ] || say "no detached preview to stop"
  exit 0
fi

# ---- on demand: what we need -------------------------------------------------------------------------------------------------------
need docker pnpm node python3 curl lsof
node_ok || die "Node 22.18 or newer is needed"
[ -d "$REPO/web/node_modules" ] || die "no web/node_modules: run  cd $REPO/web && pnpm install --frozen-lockfile"

if [ -n "$PORT" ]; then
  in_block "$PORT" || die "--port must be in 7700-7799 (spx-stats' block)"
  ! busy "$PORT" || die "port $PORT is in use"
else
  PORT="$(first_free 7702 7729)" || die "no free port in 7702-7729"
fi
if [ -n "$PGRST_PORT" ]; then
  in_block "$PGRST_PORT" || die "--pgrst-port must be in 7700-7799"
  ! busy "$PGRST_PORT" || die "port $PGRST_PORT is in use"
else
  PGRST_PORT="$(first_free 7730 7749)" || die "no free port in 7730-7749"
fi
[ "$PGRST_PORT" != "$PORT" ] || die "the site and PostgREST need different ports"

cleanup() {
  [ "$KEEP_RUNNING" = 1 ] && return 0
  if [ -n "$DEV_PID" ]; then kill_tree "$DEV_PID"; wait "$DEV_PID" 2>/dev/null || true; fi
  ds1_pgrst_stop "$NAME"
  say "stopped: server and PostgREST container removed"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# ---- 1. PostgREST on DS1 -----------------------------------------------------------------------------------------------------------
ds1_pgrst_start "$NAME" "$PGRST_PORT"   # sets LOCAL=http://127.0.0.1:<pgrst port>/

# ---- 2. the site -------------------------------------------------------------------------------------------------------------------
# SPX_REST_URL makes web/src/lib/api/config.ts read LOCAL (loopback only); the next lines run in web/ with that variable only for them.
cd "$REPO/web" || die "no web/ directory"
# This checkout's web/public/team-logos/sl (git-ignored) gets the SportsLogos.Net files too; without them those logos show as missing, nothing else breaks.
( hosted_logos_export "$REPO/web" ) || say "warning: the SportsLogos.Net logo files were not written; their logos will not show in this preview"
# Sign-in on this Mac: SPX_PREVIEW=1 turns on "Sign in (this Mac)" (web/src/lib/auth/preview.ts: loopback host only, never on Vercel). It needs a
# signing secret: the always-on project's if its env file exists, else a fresh one for this run. Exported (not on a command line), so it is not
# shown by ps. Google is not offered here: its client only allows http://localhost:$SITE_PORT, the always-on site's address.
AUTH_SECRET="$(grep '^AUTH_SECRET=' "$AUTH_ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)"
auth_value_ok "$AUTH_SECRET" || AUTH_SECRET="$(openssl rand -hex 32)" || die "openssl could not make a signing secret"
export SPX_PREVIEW=1 AUTH_SECRET NEXTAUTH_URL="http://127.0.0.1:$PORT" AUTH_URL="http://127.0.0.1:$PORT"
unset AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
if [ "$START" = 1 ]; then
  say "next build (reads only $LOCAL)"
  SPX_REST_URL="$LOCAL" pnpm exec next build || die "the build failed"
  CMD=(pnpm exec next start -H 127.0.0.1 -p "$PORT")
else
  # shellcheck disable=SC2206
  NEXT_ARGS=(${SPX_PREVIEW_NEXT_ARGS---webpack})
  CMD=(pnpm exec next dev "${NEXT_ARGS[@]+"${NEXT_ARGS[@]}"}" -H 127.0.0.1 -p "$PORT")
fi

mkdir -p "$STATE_DIR"
LOG="$STATE_DIR/ds1-preview-$PORT.log"
say "starting the site: ${CMD[*]}"
if [ "$DETACH" = 1 ]; then
  SPX_REST_URL="$LOCAL" nohup "${CMD[@]}" >"$LOG" 2>&1 </dev/null &
else
  SPX_REST_URL="$LOCAL" "${CMD[@]}" &
fi
DEV_PID=$!

# Wait for the first answer from the site (any HTTP code; the first request compiles the page in dev, so allow a while).
code="000"
for _ in $(seq 1 60); do
  kill -0 "$DEV_PID" 2>/dev/null || die "the site stopped before it answered (another dev server in this checkout?)$([ "$DETACH" = 1 ] && echo " (log: $LOG)")"
  code="$(curl -s -m 60 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/")"
  [ "$code" != 000 ] && break
  sleep 2
done
[ "$code" != 000 ] || die "the site did not answer on port $PORT"
[ "$code" = 200 ] || say "warning: the first page answered HTTP $code"

URL="http://127.0.0.1:$PORT/"
if [ "$DETACH" = 1 ]; then
  {
    printf 'port=%s\npgrst_port=%s\ncontainer=%s\npid=%s\n' "$PORT" "$PGRST_PORT" "$NAME" "$DEV_PID"
    printf 'listen_pids=%s\nlog=%s\ncheckout=%s\n' "$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')" "$LOG" "$REPO"
  } > "$STATE_DIR/ds1-preview-$PORT.state"
  disown "$DEV_PID" 2>/dev/null || true
  KEEP_RUNNING=1
  say "running in the background: $URL (data from DS1 through 127.0.0.1:$PGRST_PORT; log $LOG)"
  say "stop it with:  bash $HERE/ds1-preview.sh --stop --port $PORT"
  exit 0
fi
say "ready: $URL (data from DS1 through 127.0.0.1:$PGRST_PORT, read-only; sign in with the header button, \"Sign in (this Mac)\"). Ctrl-C stops it."
wait "$DEV_PID"

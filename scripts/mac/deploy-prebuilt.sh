#!/bin/bash
# Build the site on this Mac against DS1 and deploy the result prebuilt, so `next build` reads production no more.
#
#   bash scripts/mac/deploy-prebuilt.sh [--sha <commit>] [--check-only] [--no-deploy] [--no-prune] [--force] [--keep]
#
# Steps (each prints one line):
#   1. start a PostgREST in Docker (pinned image, 127.0.0.1:3190) on DS1 Postgres, schema api, role anon, read-only session;
#   2. check it serves the same data as production (scripts/mac/same-data.py: latest release number and season_summary);
#   3. git archive of the commit into a temp dir (default: origin/main), vercel link and pull;
#   4. `vercel build --prod` there with SPX_REST_URL pointing at that PostgREST (web/src/lib/api/config.ts accepts only loopback addresses);
#   5. stop the PostgREST (by container name), then `vercel deploy --prebuilt --prod`, one request to spxn.com;
#   6. prune Vercel deployments to the live one and one previous (plus the pinned $PIN).
# Pages revalidated at run time on Vercel still read production: SPX_REST_URL is never set there.
#
#   --check-only  steps 1 and 2 only (a dry run that changes nothing)   --no-deploy  stop after the build, keep the temp dir
#   --no-prune    skip step 6       --force  go on although step 2 found a difference       --keep  keep the temp dir
# Needs: Docker running, vercel (logged in), git, node 22.18+, pnpm, python3, jq, DS1 on the home LAN or Tailscale, and the DS1 password
# (the keychain item 'spx-stats-db DS1 55440', or SPX_DS1_DB_PASSWORD; it is read here and never printed or put on a command line).
# Settings for tests: SPX_DS1_HOST, SPX_DS1_PORT, SPX_DS1_DB_NAME, SPX_DS1_DB_USER, SPX_BUILD_PGRST_PORT, SPX_PROD_URL.

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/spx-checks.sh"
. "$HERE/lib/ds1-pgrst.sh"
set -u

SCOPE="spxis-projects-0d6306b4"
PROJECT="spx-stats"
PIN="spx-stats-1p836thn0"   # a known-good deployment John keeps
PORT="${SPX_BUILD_PGRST_PORT:-3190}"   # John's port block for spx-stats is 3100-3199
NAME="spx-build-pgrst-$$"

SHA="" CHECK_ONLY=0 NO_DEPLOY=0 NO_PRUNE=0 FORCE=0 KEEP=0 TMP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --sha) SHA="${2:-}"; shift ;;
    --check-only) CHECK_ONLY=1 ;;
    --no-deploy) NO_DEPLOY=1 ;;
    --no-prune) NO_PRUNE=1 ;;
    --force) FORCE=1 ;;
    --keep) KEEP=1 ;;
    -h|--help) sed -n '2,22p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $1"; exit 2 ;;
  esac
  shift
done

say() { printf '%s deploy-prebuilt: %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { say "STOP: $*"; exit 1; }
stop_pgrst() { ds1_pgrst_stop "$NAME"; }
cleanup() {
  stop_pgrst
  if [ -n "$TMP" ] && [ -d "$TMP" ]; then
    if [ "$KEEP" = 1 ] || [ "$NO_DEPLOY" = 1 ]; then say "kept $TMP"; else rm -rf "$TMP"; fi
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# ---- 0. what we need ---------------------------------------------------------------------------------------------------------------
for t in docker git python3 jq curl; do command -v "$t" >/dev/null 2>&1 || die "$t is not installed"; done
docker info >/dev/null 2>&1 || die "Docker is not running"
if [ "$CHECK_ONLY" = 0 ]; then
  for t in vercel pnpm node; do command -v "$t" >/dev/null 2>&1 || die "$t is not installed"; done
  node_ok || die "Node 22.18 or newer is needed"
  vercel whoami --scope "$SCOPE" >/dev/null 2>&1 || die "vercel is not logged in (vercel login)"
  git -C "$REPO" fetch -q origin || die "git fetch failed"
  [ -n "$SHA" ] || SHA="origin/main"
  SHA="$(git -C "$REPO" rev-parse --verify "$SHA^{commit}")" || die "no such commit"
  git -C "$REPO" merge-base --is-ancestor "$SHA" origin/main || die "$SHA is not on origin/main (deploy only what is pushed and checked)"
  say "commit $(git -C "$REPO" rev-parse --short "$SHA")"
fi
lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && die "port $PORT is in use (SPX_BUILD_PGRST_PORT picks another in 3100-3199)"

# ---- 1. PostgREST on DS1 -----------------------------------------------------------------------------------------------------------
# (shared with ds1-preview.sh: scripts/mac/lib/ds1-pgrst.sh; sets LOCAL, calls die on failure)
ds1_pgrst_start "$NAME" "$PORT"

# ---- 2. same data as production? ---------------------------------------------------------------------------------------------------
PROD="${SPX_SAME_DATA_PROD:-$SPX_PROD_URL/rest/v1/}"   # SPX_SAME_DATA_PROD: tests only
if python3 -I "$HERE/same-data.py" "$LOCAL" "$PROD" "$SPX_PROD_KEY"; then
  say "DS1 and production serve the same data"
else
  if [ "$FORCE" = 1 ]; then say "DIFFERENT, going on because of --force"
  else die "DS1 is not what production serves (see above). Approve or finish the open releases and let the drift check run, or use --force"; fi
fi
[ "$CHECK_ONLY" = 1 ] && { say "check only: done"; exit 0; }

# ---- 3. a clean copy of the commit, linked -----------------------------------------------------------------------------------------
TMP="$(mktemp -d "${TMPDIR:-/tmp}/spx-prebuilt.XXXXXX")"
git -C "$REPO" archive "$SHA" | tar -x -C "$TMP" || die "git archive failed"
cd "$TMP" || die "no temp dir"
vercel link --yes --project "$PROJECT" --scope "$SCOPE" >/dev/null 2>&1 || die "vercel link failed"
vercel pull --yes --environment=production --scope "$SCOPE" >/dev/null 2>&1 || die "vercel pull failed"
# The footer shows VERCEL_GIT_COMMIT_SHA, and the pulled file holds the last Git deployment's value: put this commit's in its place.
ENVFILE=".vercel/.env.production.local"
if [ -f "$ENVFILE" ]; then
  # Sensitive variables come down empty (VAR=""); an empty AUTH_URL makes next-auth throw "Invalid URL" while pages are drawn.
  # Drop the empty ones for the build: the deployed functions still read the real values from the project at run time.
  # The kept pages bake in whether sign-in is set up (web/src/lib/auth/enabled.ts). The three variables of it are secrets, so the build sees them empty and would build every
  # page as "no sign-in": no link, no account menu, and a signed-in browser's hint hiding the theme button for nothing. Say so when the project holds all three.
  AUTH_FLAG=""
  if grep -qE '^(AUTH_GOOGLE_ID|GOOGLE_CLIENT_ID)=' "$ENVFILE" && grep -qE '^(AUTH_GOOGLE_SECRET|GOOGLE_CLIENT_SECRET)=' "$ENVFILE" && grep -qE '^(AUTH_SECRET|NEXTAUTH_SECRET)=' "$ENVFILE"; then AUTH_FLAG=1; fi
  grep -v '^VERCEL_GIT_COMMIT_SHA=' "$ENVFILE" | grep -vE '^[A-Za-z_][A-Za-z0-9_]*=(""|)$' > "$ENVFILE.new"; printf 'VERCEL_GIT_COMMIT_SHA="%s"\n' "$SHA" >> "$ENVFILE.new"
  [ -n "$AUTH_FLAG" ] && printf 'SPX_AUTH_CONFIGURED="1"\n' >> "$ENVFILE.new"
  mv "$ENVFILE.new" "$ENVFILE"
fi
say "linked and pulled project settings into $TMP"

# ---- 4. build against DS1 ----------------------------------------------------------------------------------------------------------
say "vercel build --prod (reads only $LOCAL)"
SPX_REST_URL="$LOCAL" VERCEL_GIT_COMMIT_SHA="$SHA" vercel build --prod --yes --scope "$SCOPE" || die "the build failed"
[ -d .vercel/output ] || die "no .vercel/output after the build"
hits="$(grep -rIl "127\.0\.0\.1:$PORT" .vercel/output/static 2>/dev/null | head -5)"
[ -z "$hits" ] || die "the local address ended up in the files visitors download: $hits"
n="$(grep -rIl "127\.0\.0\.1:$PORT" .vercel/output/functions 2>/dev/null | wc -l | tr -d ' ')"
[ "$n" = 0 ] || say "note: $n server-side files mention the local address (cached fetch records); they are not served to visitors"
stop_pgrst
say "built; PostgREST stopped"
[ "$NO_DEPLOY" = 1 ] && { say "--no-deploy: stopping here"; exit 0; }

# ---- 5. deploy prebuilt ------------------------------------------------------------------------------------------------------------
say "vercel deploy --prebuilt --prod --archive=tgz (one upload, not thousands of files)"
URL="$(vercel deploy --prebuilt --prod --archive=tgz --yes --scope "$SCOPE")" || die "the deploy failed"
say "deployed: $URL"
say "spxn.com answers HTTP $(curl -s -o /dev/null -m 20 -w '%{http_code}' https://spxn.com/) (one request)"

# ---- 6. keep the live deployment and one previous ----------------------------------------------------------------------------------
prune() {
  # AGENTS/CLAUDE rules: keep the newest two READY deployments (live + one previous), remove older READY ones and failed ones, one URL per call
  local prev="" round list u
  for round in 1 2 3 4 5; do
    list="$(vercel list "$PROJECT" --scope "$SCOPE" --json --limit 100 2>/dev/null)" || { say "prune: could not list deployments"; return 0; }
    if [ "$(printf '%s' "$list" | jq '[.deployments[] | select(.state=="BUILDING" or .state=="QUEUED" or .state=="INITIALIZING")] | length')" != 0 ]; then
      say "prune: a deployment is still building; skipping"; return 0
    fi
    list="$(printf '%s' "$list" | jq -r '(.deployments | map(select(.state=="READY")) | .[2:][]), (.deployments[] | select(.state=="ERROR" or .state=="CANCELED")) | .url' | grep -v "$PIN")"
    [ -n "$list" ] || { say "prune: nothing to remove"; return 0; }
    [ "$list" != "$prev" ] || { say "prune: the rest could not be removed (aliased); leaving them"; return 0; }
    prev="$list"
    for u in $list; do
      perl -e 'alarm 90; exec @ARGV' vercel remove "$u" --safe --yes --scope "$SCOPE" >/dev/null 2>&1 && say "prune: removed $u" || say "prune: kept $u"
    done
  done
}
if [ "$NO_PRUNE" = 1 ]; then say "prune skipped"; else prune; fi
say "done: $URL"

#!/bin/bash
# Build the site on this Mac against DS1 and deploy the result prebuilt, so `next build` reads production no more.
#
#   bash scripts/mac/deploy-prebuilt.sh [--sha <commit>] [--check-only] [--no-deploy] [--no-prune] [--force] [--keep]
#
# Steps (each prints one line):
#   1. start a PostgREST in Docker (pinned image, 127.0.0.1:7790) on DS1 Postgres, schema api, role anon, read-only session;
#   2. check it serves the same data as production (scripts/mac/same-data.py: latest release number, season_summary,
#      and every published table by row count and bucket hash; a difference stops the deploy unless --force; a side
#      that cannot be read always stops);
#   3. git archive of the commit into a temp dir (default: origin/main), vercel link and pull; then the SportsLogos.Net logo files are written from
#      DS1 into web/public/team-logos/sl (scripts/logos/export_hosted.py, sha256 checked; it stops when a file a brand row names is missing);
#   4. `vercel build --prod` there with SPX_REST_URL pointing at that PostgREST (web/src/lib/api/config.ts accepts only loopback addresses);
#   5. stop the PostgREST (by container name), then `vercel deploy --prebuilt --prod`, one request to spxn.com;
#   5b. guards (AGENTS.md section 7): before deploying, the built home page must carry the sign-in control (lib/build-auth.sh); after, one request each to
#       /api/auth/providers and / (check-live-auth.sh, which prints the rollback command on failure and stops before the prune);
#   6. prune Vercel deployments to the live one and one previous (plus the pinned $PIN).
# Pages revalidated at run time on Vercel still read production: SPX_REST_URL is never set there.
#
#   --check-only  steps 1 and 2 only (a dry run that changes nothing)   --no-deploy  stop after the build, keep the temp dir
#   --no-prune    skip step 6       --force  go on when step 2 found a data difference (a side that cannot be read still stops)       --keep  keep the temp dir
# Needs: Docker running, vercel (logged in), git, node 22.18+, pnpm, python3, jq, DS1 on the home LAN or Tailscale, and the DS1 password
# (the keychain item 'spx-stats-db DS1 55440', or SPX_DS1_DB_PASSWORD; it is read here and never printed or put on a command line).
# Settings for tests: SPX_DS1_HOST, SPX_DS1_PORT, SPX_DS1_DB_NAME, SPX_DS1_DB_USER, SPX_BUILD_PGRST_PORT, SPX_PROD_URL.

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/spx-checks.sh"
. "$HERE/lib/ds1-pgrst.sh"
. "$HERE/lib/build-auth.sh"
. "$HERE/lib/hosted-logos.sh"
. "$HERE/lib/same-data-gate.sh"
# shellcheck source=../runlog/log.sh
. "$REPO/scripts/runlog/log.sh"
set -u

SCOPE="spxis-projects-0d6306b4"
PROJECT="spx-stats"
PIN="spx-stats-1p836thn0"   # a known-good deployment John keeps
PORT="${SPX_BUILD_PGRST_PORT:-7790}"   # John's port block for spx-stats is 7700-7799
NAME="spx-build-pgrst-$$"

SHA="" CHECK_ONLY=0 NO_DEPLOY=0 NO_PRUNE=0 FORCE=0 KEEP=0 TMP=""
STAGE="" URL="" PRUNED=0 GUARD="not run" STARTED="" VERSION=""
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
# The run log (scripts/runlog): one entry for a run that built or deployed, whatever way it ended. A failed write never changes the exit code.
log_run() {
  local rc="$1" outcome=ok detail
  [ "$CHECK_ONLY" = 0 ] && [ -n "$STAGE" ] || return 0
  [ "$rc" = 0 ] || outcome=failed
  [ -z "$VERSION" ] && [ -n "$TMP" ] && [ -f "$TMP/web/package.json" ] && VERSION="$(jq -r .version "$TMP/web/package.json" 2>/dev/null)"
  detail="$(jq -nc --arg sha "$SHA" --arg version "$VERSION" --arg url "$URL" --arg stage "$STAGE" --arg guard "$GUARD" --argjson pruned "$PRUNED" --argjson force "$FORCE" --argjson deployed "$([ -n "$URL" ] && echo true || echo false)" \
    '{sha:$sha, version:$version, deployment_url:$url, last_stage:$stage, deployed:$deployed, sign_in_guard:$guard, pruned:$pruned, forced:($force==1)}' 2>/dev/null || true)"
  runlog_event deploy-prebuilt deploy "$outcome" "$([ "$outcome" = ok ] && echo deployed || echo "stopped at $STAGE"): $(printf '%s' "$SHA" | cut -c1-10) ${VERSION:+v$VERSION}" "$detail" \
    --actor "$(runlog_actor)" --ref "$(printf '%s' "$SHA" | cut -c1-10)" ${URL:+--scope "$URL"} --alert-key deploy
}
cleanup() {
  local rc=$?
  stop_pgrst
  if [ -n "$TMP" ] && [ -d "$TMP" ]; then
    if [ "$KEEP" = 1 ] || [ "$NO_DEPLOY" = 1 ]; then say "kept $TMP"; else rm -rf "$TMP"; fi
  fi
  log_run "$rc"
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
STAGE="start"
lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && die "port $PORT is in use (SPX_BUILD_PGRST_PORT picks another in 7700-7799)"

# ---- 1. PostgREST on DS1 -----------------------------------------------------------------------------------------------------------
# (shared with ds1-preview.sh: scripts/mac/lib/ds1-pgrst.sh; sets LOCAL, calls die on failure)
STAGE="same-data check"
ds1_pgrst_start "$NAME" "$PORT"

# ---- 2. same data as production? ---------------------------------------------------------------------------------------------------
PROD="${SPX_SAME_DATA_PROD:-$SPX_PROD_URL/rest/v1/}"   # SPX_SAME_DATA_PROD: tests only
export PGHOST="${SPX_DS1_HOST:-$(ds1_host)}" PGPORT="$SPX_DS1_PORT" PGUSER="${SPX_DS1_DB_USER:-postgres}" PGDATABASE="${SPX_DS1_DB_NAME:-spx_stats}"
if [ -z "${PGPASSWORD:-}" ]; then
  PGPASSWORD="${SPX_DS1_DB_PASSWORD:-}"
  [ -n "$PGPASSWORD" ] || PGPASSWORD="$(kc_get 'spx-stats-db DS1 55440')"
  export PGPASSWORD
fi
python3 -I "$HERE/same-data.py" "$LOCAL" "$PROD" "$SPX_PROD_KEY"
rc=$?
unset PGPASSWORD
case "$(same_data_gate "$rc" "$FORCE")" in
  ok) say "DS1 and production serve the same data" ;;
  warn) say "DIFFERENT, going on because of --force" ;;
  differ) die "DS1 is not what production serves (see above). Approve or finish the open releases and let the drift check run, or use --force" ;;
  *) die "could not compare DS1 with production (see above). Nothing was built" ;;
esac
[ "$CHECK_ONLY" = 1 ] && { say "check only: done"; exit 0; }

# ---- 3. a clean copy of the commit, linked -----------------------------------------------------------------------------------------
STAGE="link and pull"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/spx-prebuilt.XXXXXX")"
git -C "$REPO" archive "$SHA" | tar -x -C "$TMP" || die "git archive failed"
cd "$TMP" || die "no temp dir"
vercel link --yes --project "$PROJECT" --scope "$SCOPE" >/dev/null 2>&1 || die "vercel link failed"
vercel pull --yes --environment=production --scope "$SCOPE" >/dev/null 2>&1 || die "vercel pull failed"
# The footer shows VERCEL_GIT_COMMIT_SHA, and the pulled file holds the last Git deployment's value: put this commit's in its place.
ENVFILE=".vercel/.env.production.local"
AUTH_FLAG=""
if [ -f "$ENVFILE" ]; then
  # Sensitive variables come down empty (VAR=""); an empty AUTH_URL makes next-auth throw "Invalid URL" while pages are drawn.
  # Drop the empty ones for the build: the deployed functions still read the real values from the project at run time.
  # The kept pages bake in whether sign-in is set up (web/src/lib/auth/enabled.ts). The three variables of it are secrets, so the build sees them empty and would build every
  # page as "no sign-in": no link, no account menu, and a signed-in browser's hint hiding the theme button for nothing. Say so when the project holds all three.

  if grep -qE '^(AUTH_GOOGLE_ID|GOOGLE_CLIENT_ID)=' "$ENVFILE" && grep -qE '^(AUTH_GOOGLE_SECRET|GOOGLE_CLIENT_SECRET)=' "$ENVFILE" && grep -qE '^(AUTH_SECRET|NEXTAUTH_SECRET)=' "$ENVFILE"; then AUTH_FLAG=1; fi
  grep -v '^VERCEL_GIT_COMMIT_SHA=' "$ENVFILE" | grep -vE '^[A-Za-z_][A-Za-z0-9_]*=("")?$' > "$ENVFILE.new"; printf 'VERCEL_GIT_COMMIT_SHA="%s"\n' "$SHA" >> "$ENVFILE.new"
  [ -n "$AUTH_FLAG" ] && printf 'SPX_AUTH_CONFIGURED="1"\n' >> "$ENVFILE.new"
  # Turso's two variables are sensitive on Vercel, so the pull leaves them empty and the build would read nothing (pages read Turso at build, lib/turso).
  # Add them for the build only, from the keychain, never printed; the functions still read the project's own values at run time.
  _TU="${TURSO_DATABASE_URL:-$(kc_get 'spx-stats TURSO_DATABASE_URL')}"; _TT="${TURSO_READ_TOKEN:-$(kc_get 'spx-stats TURSO_READ_TOKEN')}"
  [ -n "$_TU" ] && [ -n "$_TT" ] || die "the keychain items spx-stats TURSO_DATABASE_URL and spx-stats TURSO_READ_TOKEN are missing: the build would read no Turso data. Nothing was built or deployed"
  printf 'TURSO_DATABASE_URL="%s"\nTURSO_AUTH_TOKEN="%s"\n' "$_TU" "$_TT" >> "$ENVFILE.new"; unset _TU _TT
  mv "$ENVFILE.new" "$ENVFILE"
fi
# The deploy guard (AGENTS.md section 7): this build must have sign-in on, or every kept page is built signed-out (2026-10-15).
[ -n "$AUTH_FLAG" ] || die "the project settings pulled from Vercel do not hold all three sign-in variables (AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_SECRET), so the build would have no sign-in. Nothing was built or deployed. Check the project's Environment Variables for production, then run this again"
say "linked and pulled project settings into $TMP"

# ---- 3b. the logo files the site serves itself --------------------------------------------------------------------------------------
# The SportsLogos.Net marks (/team-logos/sl/..., migration 108) are not in git: write them from DS1's archive into web/public before the build, so they ship
# as static files. Stops (nothing built) when a logo a brand row points at is missing from the archive or its sha256 does not match.
hosted_logos_export "$TMP/web"
# The site's own small copies of every logo (docs/logos-serving.md): rendered from what the API names, from a source cache, so a build makes no request once it is warm.
# It never stops the deploy: without them the logos keep their hot links.
hosted_logos_render "$TMP/web" "$LOCAL"

# ---- 4. build against DS1 ----------------------------------------------------------------------------------------------------------
STAGE="build"
say "vercel build --prod (reads only $LOCAL)"
SPX_REST_URL="$LOCAL" VERCEL_GIT_COMMIT_SHA="$SHA" vercel build --prod --yes --scope "$SCOPE" || die "the build failed"
[ -d .vercel/output ] || die "no .vercel/output after the build"
build_has_signin || die "the built home page ($(build_home_html || true)) has no sign-in control: the build ran with sign-in off (authEnabled was false). Nothing was deployed. Look at SPX_AUTH_CONFIGURED and the three AUTH_ variables in $ENVFILE (names only)"
say "build check: the kept home page carries the sign-in control (sign-in was on at build)"
hits="$(grep -rIl "127\.0\.0\.1:$PORT" .vercel/output/static 2>/dev/null | head -5)"
[ -z "$hits" ] || die "the local address ended up in the files visitors download: $hits"
n="$(grep -rIl "127\.0\.0\.1:$PORT" .vercel/output/functions 2>/dev/null | wc -l | tr -d ' ')"
[ "$n" = 0 ] || say "note: $n server-side files mention the local address (cached fetch records); they are not served to visitors"
stop_pgrst
say "built; PostgREST stopped"
[ "$NO_DEPLOY" = 1 ] && { STAGE=""; say "--no-deploy: stopping here"; exit 0; }

# ---- 5. deploy prebuilt ------------------------------------------------------------------------------------------------------------
STAGE="deploy"
say "vercel deploy --prebuilt --prod --archive=tgz (one upload, not thousands of files)"
URL="$(vercel deploy --prebuilt --prod --archive=tgz --yes --scope "$SCOPE")" || die "the deploy failed"
say "deployed: $URL"
STAGE="sign-in guard (the deployment exists)"; GUARD="failed"
say "spxn.com answers HTTP $(curl -s -o /dev/null -m 20 -w '%{http_code}' https://spxn.com/) (one request)"
# The deploy guard (AGENTS.md section 7): sign-in must work on the live site. On failure this prints the rollback command and stops BEFORE the prune,
# because the previous deployment is the way back.
bash "$HERE/check-live-auth.sh" --new "$URL" || die "sign-in is broken on the live site (see above); the deployment was made, nothing was pruned. Roll back with the command above, fix the cause and deploy again"

GUARD="passed"; STAGE="prune"
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
      perl -e 'alarm 90; exec @ARGV' vercel remove "$u" --safe --yes --scope "$SCOPE" >/dev/null 2>&1 && { PRUNED=$((PRUNED + 1)); say "prune: removed $u"; } || say "prune: kept $u"
    done
  done
}
if [ "$NO_PRUNE" = 1 ]; then say "prune skipped"; else prune; fi
STAGE="done"
say "done: $URL"

#!/bin/bash
# Is sign-in alive on the live site? One request each, never a loop. Run after every production deploy (deploy-prebuilt.sh does it itself;
# a deploy made another way, AGENTS.md section 7, runs it by hand).
#
#   bash scripts/mac/check-live-auth.sh [--url https://spxn.com] [--new <deployment url>] [--skip-list]
#
#   1. GET <url>/api/auth/providers must answer JSON that names "google" (the auth routes answer 404 when the build or the project lost its
#      sign-in settings: that is how every page went out signed-out on 2026-10-15);
#   2. GET <url>/ must carry the sign-in control (class="signin-link") in its HTML: the kept pages bake that in when they are built.
# Both pass: prints "live auth: ok" and exits 0. Either fails: says which, prints the exact rollback command for the previous production
# deployment (found with one `vercel list`; --new names the deployment just made so it is not offered as its own rollback; --skip-list skips
# that lookup) and exits 1. A caller must then NOT prune old deployments: the previous one is the way back.
# Settings for tests: SPX_LIVE_URL (the default for --url), SPX_VERCEL_SCOPE.

SCOPE="${SPX_VERCEL_SCOPE:-spxis-projects-0d6306b4}"
PROJECT="spx-stats"
URL="${SPX_LIVE_URL:-https://spxn.com}" NEW="" LIST=1
while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2:-}"; shift ;;
    --new) NEW="${2:-}"; shift ;;
    --skip-list) LIST=0 ;;
    -h|--help) sed -n '2,15p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $1"; exit 2 ;;
  esac
  shift
done
URL="${URL%/}"

say() { printf '%s live-auth: %s\n' "$(date '+%H:%M:%S')" "$*"; }

# The previous READY production deployment, as a URL on stdout (empty when it cannot be found).
previous_url() {
  local list new_host
  command -v vercel >/dev/null 2>&1 && command -v jq >/dev/null 2>&1 || return 0
  list="$(vercel list "$PROJECT" --scope "$SCOPE" --json --limit 10 2>/dev/null)" || return 0
  new_host="${NEW#https://}"; new_host="${new_host%%/*}"
  printf '%s' "$list" | jq -r --arg new "$new_host" '[.deployments[] | select(.state=="READY" and ((.target // "production") == "production") and (.url != $new))] | .[0].url // empty' 2>/dev/null
}

problems=()
providers="$(curl -s -m 20 -w '\n%{http_code}' "$URL/api/auth/providers" 2>/dev/null)"
code="${providers##*$'\n'}"; body="${providers%$'\n'*}"
if [ "$code" != 200 ]; then problems+=("$URL/api/auth/providers answered HTTP ${code:-none} (expected 200: the sign-in routes are off)")
elif ! printf '%s' "$body" | grep -q '"google"'; then problems+=("$URL/api/auth/providers answered 200 but does not list google")
fi

home="$(curl -s -m 30 -w '\n%{http_code}' "$URL/" 2>/dev/null)"
code="${home##*$'\n'}"; body="${home%$'\n'*}"
if [ "$code" != 200 ]; then problems+=("$URL/ answered HTTP ${code:-none}")
elif ! printf '%s' "$body" | grep -q 'class="signin-link"'; then problems+=("$URL/ has no sign-in control in its HTML (the pages were built signed-out)")
fi

if [ "${#problems[@]}" = 0 ]; then say "ok ($URL lists google and the home page carries the sign-in control)"; exit 0; fi

say "FAILED: sign-in is not working on the live site:"
for p in "${problems[@]}"; do say "  - $p"; done
prev=""
[ "$LIST" = 1 ] && prev="$(previous_url)"
if [ -n "$prev" ]; then
  say "roll back now with:  vercel promote https://$prev --scope $SCOPE --yes"
else
  say "roll back to the previous deployment: find it with  vercel list $PROJECT --scope $SCOPE  (the READY one below the newest), then  vercel promote <its url> --scope $SCOPE --yes"
fi
say "do not prune old deployments until this is fixed: the previous one is the way back"
exit 1

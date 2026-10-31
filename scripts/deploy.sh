#!/bin/bash
# Run the waiting hand-offs: no agent thinking, no guessing. John (or the coordinating session) runs it from a Mac.
#
#   bash scripts/deploy.sh [--dry-run] [--ticket <id>] [--list]
#
#   --dry-run  changes nothing: lists the hand-offs, runs the read-only checks, shows what each step would do
#              (the ds1-apply dry run is shown; it rolls back). No reply, no move, no deploy, no ticket change.
#   --ticket   only that hand-off.   --list  only list the hand-offs and replies, then stop.
#
# Hand-offs are Dropbox /Projects/Handoff/<project>/<ticket-id>.json (scripts/handoff/README.md). What it does:
#   ready, site:   every migration object the hand-off needs exists on production (to_regclass, Supabase Management API, keychain token)
#                  and every Turso table exists; refuses clearly if not. Then ONE deploy of a clean git archive of origin/main (AGENTS.md
#                  section 7), READY wait, sign-in check, the listed pages (Vercel protection-bypass header; skipped with a note when no
#                  token), then `task done`, status deployed, a reply, the file moves to done/.
#   ready, data:   shows the ds1-apply --dry-run plan, asks y/N, applies the steps in order, then release.py prepare. John still approves
#                  at /admin/data. Status becomes data-applied-not-released; a later run sees the release finish (released) and, when the
#                  hand-off says deploy_after_release, deploys it.
#   ready, package: asks y/N, then pushes the tag (instead of a deploy).
#   blocked, needs-decision: printed with the options and the recommendation; nothing runs.
# Every outcome writes replies/<ticket-id>.json for the agent that wrote the hand-off (append-only).
# A deployment carries everything on main, so if any site hand-off is refused nothing is deployed.
#
# Settings (all optional; tests stub them): SPX_REPO, SPX_GIT_REF (origin/main), SPX_NO_FETCH=1, SPX_ACTOR (board name, default deploy.sh),
# SPX_SITE_URL (https://spxn.com), SPX_VERCEL_CMD, SPX_VERCEL_SCOPE, SPX_TASK_CMD, SPX_DS1_APPLY_CMD, SPX_RELEASE_CMD, SPX_CHECK_LIVE_AUTH,
# SPX_PROD_QUERY_CMD (reads SQL on stdin), SPX_TURSO_QUERY_CMD, SPX_VERCEL_BYPASS, SPX_HANDOFF_DIR, SPX_HOSTED_LOGOS_CMD (given the web directory of the copy).
# Keychain item names (values are never printed): 'spx-stats SUPABASE_ACCESS_TOKEN', 'spx-stats VERCEL_AUTOMATION_BYPASS_SECRET',
# 'spx-stats TURSO_DATABASE_URL', 'spx-stats TURSO_AUTH_TOKEN' (Turso: also read from TURSO_DATABASE_URL / TURSO_AUTH_TOKEN).
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${SPX_REPO:-$(cd "$HERE/.." && pwd)}"
REF="${SPX_GIT_REF:-origin/main}"
SCOPE="${SPX_VERCEL_SCOPE:-spxis-projects-0d6306b4}"
SITE="${SPX_SITE_URL:-https://spxn.com}"
ACTOR="${SPX_ACTOR:-deploy.sh}"
VERCEL="${SPX_VERCEL_CMD:-vercel}"
TASK="${SPX_TASK_CMD:-node scripts/task.ts}"
DS1APPLY="${SPX_DS1_APPLY_CMD:-bash $REPO/scripts/mac/ds1-apply.sh}"
RELEASE="${SPX_RELEASE_CMD:-python3 -I $REPO/scripts/release/release.py}"
LIVEAUTH="${SPX_CHECK_LIVE_AUTH:-bash $REPO/scripts/mac/check-live-auth.sh}"
PROJECT_REF="njpvfrceahkvnrduerkk"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

DRY=0 ONLY="" LISTONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --ticket) ONLY="${2:-}"; shift ;;
    --list) LISTONLY=1 ;;
    -h|--help) sed -n '2,29p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
for c in jq python3 git curl; do command -v "$c" >/dev/null 2>&1 || { echo "needs $c" >&2; exit 2; }; done

H() { python3 -I "$HERE/handoff/handoff.py" "$@"; }
# shellcheck disable=SC1091
. "$HERE/runlog/log.sh"   # the run log: one entry for each site deploy; a failed write never changes what this script does
log_deploy() { # outcome summary tickets-json checks-json problems-json dpl url
  [ "$DRY" = 1 ] && return 0
  runlog_event deploy.sh deploy "$1" "$2" "$(jq -nc --arg sha "$SHA" --arg short "$SHORT" --arg dpl "${6:-}" --arg url "${7:-}" --argjson tickets "$3" --argjson checks "${4:-[]}" --argjson problems "${5:-[]}" \
    '{sha:$sha, version_commit:$short, deployment_id:$dpl, deployment_url:$url, tickets:$tickets, checks:$checks, problems:$problems}' 2>/dev/null || true)" \
    --actor "$ACTOR" --ref "$SHORT" --alert-key deploy
}
say() { printf '%s\n' "$*"; }
yes_no() { local a; printf '%s [y/N] ' "$1"; read -r a || a=n; [ "$a" = y ] || [ "$a" = Y ]; }
kc() { command -v security >/dev/null 2>&1 && security find-generic-password -s "$1" -w 2>/dev/null; return 0; }
# The deployment URL from what `vercel deploy` printed on stdout. Older CLIs print the URL as the last line; newer ones may print a JSON
# block, whose last line is "}" (the ticket on 2026-10-19 read "deployed }"). So: a JSON document first (first https URL or *.vercel.app
# host in it that is not a vercel.com page), else the last *.vercel.app URL in the text. Prints nothing when there is none.
vercel_url() {
  local out="$1" u=""
  if printf '%s' "$out" | jq -e . >/dev/null 2>&1; then
    u="$(printf '%s' "$out" | jq -r '[.. | strings | select(test("(^|//)[A-Za-z0-9-]+\\.vercel\\.app(/|$)"))] | first // empty' 2>/dev/null)"
  fi
  [ -n "$u" ] || u="$(printf '%s\n' "$out" | grep -oE '(https://)?[A-Za-z0-9-]+\.vercel\.app' | tail -1)"
  u="$(printf '%s' "$u" | grep -oE '[A-Za-z0-9-]+\.vercel\.app' | head -1)"
  [ -z "$u" ] || u="https://$u"
  printf '%s' "$u"
}
# The dpl_ id in the same output, if it names one.
vercel_dpl() { printf '%s\n' "$1" | grep -oE 'dpl_[A-Za-z0-9]+' | head -1; }

TMPS=()
# shellcheck disable=SC2329
cleanup() { for t in "${TMPS[@]+"${TMPS[@]}"}"; do rm -rf "$t"; done; }
trap cleanup EXIT

SUMMARY=() BAD=0
sum() { SUMMARY+=("$1"); }
bad() { BAD=1; sum "$1"; }

DIR="$(H dir)"
[ -d "$DIR" ] || { say "no hand-off folder at $DIR (Dropbox not synced on this Mac?)"; exit 2; }
HJ() { jq -r "$2" "$DIR/$1.json"; }

# ---- replies and state changes (all no-ops in --dry-run) ----
reply() { # ticket status detail [extra handoff.py reply args...]
  local t="$1" st="$2" d="$3"; shift 3
  if [ "$DRY" = 1 ]; then say "  would reply to $t: $st: $d"; return 0; fi
  H reply "$t" --status "$st" --by "$ACTOR" --detail "$d" "$@" >/dev/null || say "  (could not write the reply for $t)"
}
setstatus() { if [ "$DRY" = 1 ]; then say "  would set $1 to $2"; else H set-status "$1" "$2" ${3:+--release "$3"} >/dev/null; fi; }
close_ticket() { # ticket version entry
  if [ "$DRY" = 1 ]; then say "  would run: task done $1 --by $ACTOR --version $2"; return 0; fi
  if ! (cd "$REPO/web" && $TASK "done" "$1" --by "$ACTOR" --version "$2" ${3:+--entry "$3"}) >/dev/null 2>&1; then
    say "  could not mark $1 done; run: cd web && pnpm task done $1 --by \"$ACTOR\" --version $2"
    bad "$1: deployed but NOT marked done on the board (run the line above)"
    return 1
  fi
  say "  ticket $1 marked done"
}
archive() { if [ "$DRY" = 1 ]; then say "  would move $1 to done/"; else H "done" "$1"; fi; }

# ---- production and Turso reads ----
prod_query() { # SQL on $1 -> JSON on stdout
  if [ -n "${SPX_PROD_QUERY_CMD:-}" ]; then printf '%s' "$1" | $SPX_PROD_QUERY_CMD; return; fi
  local tok cfg
  tok="${SUPABASE_ACCESS_TOKEN:-$(kc 'spx-stats SUPABASE_ACCESS_TOKEN')}"
  [ -n "$tok" ] || { say "  no SUPABASE_ACCESS_TOKEN and no keychain item 'spx-stats SUPABASE_ACCESS_TOKEN'" >&2; return 3; }
  cfg="$(umask 077; mktemp)"; TMPS+=("$cfg")
  printf 'header = "Authorization: Bearer %s"\n' "$tok" > "$cfg"
  jq -n --arg q "$1" '{query:$q}' | curl -s -m 60 -X POST -K "$cfg" -H "Content-Type: application/json" -d @- \
    "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query"
}
turso_names() { # prints the table and view names in Turso, one per line; returns 3 when there is no way to ask
  local url tok body
  body='{"requests":[{"type":"execute","stmt":{"sql":"select name from sqlite_master where type in ('"'"'table'"'"','"'"'view'"'"')"}},{"type":"close"}]}'
  if [ -n "${SPX_TURSO_QUERY_CMD:-}" ]; then printf '%s' "$body" | $SPX_TURSO_QUERY_CMD | jq -r '.results[0].response.result.rows[][0].value'; return; fi
  url="${TURSO_DATABASE_URL:-$(kc 'spx-stats TURSO_DATABASE_URL')}"; tok="${TURSO_AUTH_TOKEN:-$(kc 'spx-stats TURSO_AUTH_TOKEN')}"
  [ -n "$url" ] && [ -n "$tok" ] || return 3
  local cfg; cfg="$(umask 077; mktemp)"; TMPS+=("$cfg")
  printf 'header = "Authorization: Bearer %s"\n' "$tok" > "$cfg"
  printf '%s' "$body" | curl -s -m 30 -X POST -K "$cfg" -H "Content-Type: application/json" -d @- "${url/libsql:\/\//https://}/v2/pipeline" \
    | jq -r '.results[0].response.result.rows[][0].value'
}

# ---- one hand-off: common checks. Prints problems; returns 1 when the hand-off cannot run ----
commits_on_main() { # ticket
  local c bad=""
  for c in $(HJ "$1" '.commits[]'); do
    git -C "$REPO" merge-base --is-ancestor "$c" "$REF" 2>/dev/null || bad="$bad $c"
  done
  [ -z "$bad" ] || { REASON="commit(s)$bad are not on $REF (push to main first)"; return 1; }
}
needs_check() { # ticket: production objects and Turso tables
  local t="$1" f="$DIR/$1.json" sql out missing names tt miss=""
  if [ "$(jq '[.migrations[]?] | length' "$f")" -gt 0 ]; then
    sql="$(H sql "$f")" || { REASON="cannot build the production check"; return 1; }
    out="$(prod_query "$sql" 2>/dev/null)" || { REASON="cannot ask production (no Supabase token, or the API is down)"; return 1; }
    missing="$(printf '%s' "$out" | jq -r 'if type=="array" then .[] | select(.ok | not) | .object else error("not rows") end' 2>/dev/null)" \
      || { REASON="production answered something unexpected: $(printf '%s' "$out" | head -c 200)"; return 1; }
    if [ -n "$missing" ]; then
      REASON="missing on production: $(printf '%s' "$missing" | tr '\n' ' ')(apply the migration there first: AGENTS.md section 8, item 4)"
      return 1
    fi
    CHECKED+=("production has the $(jq '[.migrations[].objects[]] | length' "$f") needed object(s)")
  fi
  if [ "$(jq '[.turso_tables[]?] | length' "$f")" -gt 0 ]; then
    names="$(turso_names)"; local rc=$?
    if [ "$rc" = 3 ]; then
      CHECKED+=("Turso tables NOT checked (no TURSO_DATABASE_URL / TURSO_AUTH_TOKEN or keychain items)")
    else
      for tt in $(HJ "$t" '.turso_tables[]'); do printf '%s\n' "$names" | grep -qx "$tt" || miss="$miss $tt"; done
      [ -z "$miss" ] || { REASON="missing in Turso:$miss (release.py turso-schema --apply)"; return 1; }
      CHECKED+=("Turso has the needed table(s)")
    fi
  fi
  return 0
}
show_waiting() { # ticket: blocked / needs-decision
  local t="$1"
  if [ "$(HJ "$t" .status)" = needs-decision ]; then
    say "  NEEDS A DECISION: $(HJ "$t" .decision.question)"
    jq -r '.decision as $d | $d.options[] | "    \(.id)) \(.label)\(if .note then " - " + .note else "" end)\(if .id == $d.recommendation then "   <- recommended" else "" end)"' "$DIR/$t.json"
  else
    say "  BLOCKED: $(HJ "$t" .blocked_reason)"
  fi
  [ "$(HJ "$t" '.notes_for_john // ""')" = "" ] || say "  notes: $(HJ "$t" .notes_for_john)"
}

# ================= start =================
say "deploy.sh $([ "$DRY" = 1 ] && echo '(dry run: nothing is changed)')"
if [ "${SPX_NO_FETCH:-0}" != 1 ]; then git -C "$REPO" fetch -q origin 2>/dev/null || say "(git fetch failed; using the local $REF)"; fi
SHA="$(git -C "$REPO" rev-parse "$REF" 2>/dev/null)" || { say "cannot find $REF"; exit 2; }
SHORT="$(git -C "$REPO" rev-parse --short "$SHA")"
say "main is at $SHORT"
say ""
say "replies waiting for the agents (unread):"; H replies | sed 's/^/  /'
say ""
say "hand-offs:"; H list | sed 's/^/  /'
[ "$LISTONLY" = 1 ] && exit 0

ROWS=()
while IFS= read -r l; do ROWS+=("$l"); done < <(H list --json ${ONLY:+--ticket "$ONLY"} | jq -r '.[] | [.ticket_id, .status, (.kind // "-"), (if ._errors then "invalid" else "ok" end)] | @tsv')
SITE_T=() DATA_T=() PKG_T=() TOOL_T=() REL_T=()
for row in "${ROWS[@]+"${ROWS[@]}"}"; do
  IFS=$'\t' read -r t st kind valid <<< "$row"
  say ""; say "== $t  [$st]  $(HJ "$t" '.title // ""' 2>/dev/null)"
  if [ "$valid" = invalid ]; then bad "$t: the hand-off file is invalid (handoff.py check)"; say "  INVALID: run: python3 scripts/handoff/handoff.py check $DIR/$t.json"; continue; fi
  case "$st" in
    blocked|needs-decision) show_waiting "$t"; sum "$t: waiting on John ($st)"; continue ;;
    deployed|released) sum "$t: already $st (file still in the folder; archive it with handoff.py done)"; continue ;;
    failed|needs-change) sum "$t: $st; the developer agent must change it"; continue ;;
    data-applied-not-released) REL_T+=("$t"); continue ;;
  esac
  REASON=""
  if ! commits_on_main "$t"; then say "  REFUSED: $REASON"; reply "$t" blocked "$REASON"; bad "$t: refused ($REASON)"; continue; fi
  case "$kind" in
    package) PKG_T+=("$t") ;;
    tooling) TOOL_T+=("$t") ;;
    data) DATA_T+=("$t") ;;
    *) if [ "$(jq '[.ds1_steps[]?] | length' "$DIR/$t.json")" -gt 0 ]; then DATA_T+=("$t"); else SITE_T+=("$t"); fi ;;
  esac
done

# ---- data hand-offs ----
for t in "${DATA_T[@]+"${DATA_T[@]}"}"; do
  say ""; say "== data: $t"
  f="$DIR/$t.json"; ver="$SHORT"
  STEPS=()
  while IFS= read -r l; do STEPS+=("$l"); done < <(jq -r '.ds1_steps[]? | [.file, .expect] | @tsv' "$f")
  ok=1
  for s in "${STEPS[@]+"${STEPS[@]}"}"; do
    IFS=$'\t' read -r sf sx <<< "$s"
    say "  step $sf  (expect: $sx)"
    if [ ! -f "$REPO/$sf" ]; then say "  REFUSED: $sf is not in this checkout"; reply "$t" blocked "$sf is not in the checkout of $REF at $SHORT"; bad "$t: $sf missing"; ok=0; break; fi
    $DS1APPLY "$REPO/$sf" --dry-run 2>&1 | sed 's/^/    /'
    [ "${PIPESTATUS[0]}" = 0 ] || { say "  REFUSED: dry run failed"; reply "$t" failed "ds1-apply --dry-run failed for $sf"; bad "$t: dry run failed ($sf)"; ok=0; break; }
  done
  [ "$ok" = 1 ] || continue
  say "  release: tables $(HJ "$t" '[.release_tables[]?] | join(",")')"
  if [ "$DRY" = 1 ]; then sum "$t: would apply ${#STEPS[@]} DS1 step(s) after a y/N, then release.py prepare"; continue; fi
  yes_no "  apply ${#STEPS[@]} step(s) to DS1 now, then prepare the release?" || { sum "$t: not applied (you said no)"; continue; }
  for s in "${STEPS[@]+"${STEPS[@]}"}"; do
    IFS=$'\t' read -r sf sx <<< "$s"
    log="$(umask 077; mktemp)"; TMPS+=("$log")
    $DS1APPLY "$REPO/$sf" > "$log" 2>&1; rc=$?
    sed 's/^/    /' "$log"
    if [ "$rc" != 0 ]; then
      reply "$t" failed "ds1-apply failed at $sf; later steps not run (earlier steps may have been applied; each step is one transaction)"
      bad "$t: apply failed at $sf"; ok=0; break
    fi
  done
  [ "$ok" = 1 ] || continue
  tables="$(HJ "$t" '[.release_tables[]?] | join(",")')"
  if [ -z "$tables" ]; then
    reply "$t" data-applied "applied on DS1: ${#STEPS[@]} step(s); no release tables listed" --version "$ver"
    close_ticket "$t" "$ver" "DS1 only"; archive "$t"; sum "$t: applied on DS1 (no release needed)"; continue
  fi
  out="$($RELEASE prepare --title "$(HJ "$t" '.release_title // .title')" --tables "$tables" --ticket "$t" 2>&1)"; rc=$?
  printf '%s\n' "$out" | tail -15 | sed 's/^/    /'
  num="$(printf '%s' "$out" | grep -oE '[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[0-9]+' | tail -1)"
  if [ "$rc" != 0 ] || [ -z "$num" ]; then
    reply "$t" failed "data applied on DS1 but release.py prepare failed (exit $rc); see the console of the run" --checked "DS1 steps applied"
    bad "$t: applied on DS1, release prepare FAILED"; setstatus "$t" data-applied-not-released; continue
  fi
  setstatus "$t" data-applied-not-released "$num"
  reply "$t" data-applied "applied on DS1; release $num prepared, waiting for John's approval at /admin/data" --release "$num" --version "$ver"
  sum "$t: data applied, release $num prepared -> approve at /admin/data"
done

# ---- releases that were prepared earlier ----
for t in "${REL_T[@]+"${REL_T[@]}"}"; do
  say ""; say "== release watch: $t"
  num="$(HJ "$t" '.release // ""')"
  [ -n "$num" ] || { sum "$t: data-applied-not-released but no release number in the file"; continue; }
  out="$(prod_query "select status from meta.data_release where number = '$num'" 2>/dev/null)"
  rs="$(printf '%s' "$out" | jq -r 'if type=="array" then (.[0].status // "none") else "unknown" end' 2>/dev/null)"
  say "  release $num on production: ${rs:-unknown}"
  case "$rs" in
    done)
      reply "$t" released "release $num is done on production" --release "$num" --version "$SHORT"
      if [ "$(HJ "$t" '.deploy_after_release // false')" = true ]; then setstatus "$t" released "$num"; SITE_T+=("$t")
      else close_ticket "$t" "$SHORT" "release $num"; archive "$t"; sum "$t: release $num done"; fi ;;
    failed|rejected|rolled_back) reply "$t" failed "release $num is $rs; see /admin/data" --release "$num"; bad "$t: release $num $rs" ;;
    pending|approved|running) sum "$t: release $num is $rs (John approves at /admin/data)" ;;
    *) sum "$t: release $num status unknown (no production answer)" ;;
  esac
done

# ---- packages: a tag instead of a deploy ----
for t in "${PKG_T[@]+"${PKG_T[@]}"}"; do
  say ""; say "== package: $t"
  f="$DIR/$t.json"; name="$(HJ "$t" .package.name)"; tag="$(HJ "$t" .package.tag)"; pdir="$(HJ "$t" .package.dir)"; pdir="${pdir/#\~/$HOME}"
  commit="$(HJ "$t" '.package.commit // ""')"
  if [ ! -d "$pdir/.git" ] && [ ! -f "$pdir/.git" ]; then say "  REFUSED: $pdir is not a git checkout"; reply "$t" blocked "package folder not found on this Mac"; bad "$t: package folder missing"; continue; fi
  git -C "$pdir" fetch -q origin 2>/dev/null
  [ -n "$commit" ] || commit="$(git -C "$pdir" rev-parse origin/main 2>/dev/null)"
  if git -C "$pdir" rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
    say "  REFUSED: tag $tag already exists"; reply "$t" needs-change "tag $tag already exists in $name; pick the next version" --change "bump the version"; bad "$t: tag $tag exists"; continue
  fi
  say "  $name: tag $tag at $(git -C "$pdir" rev-parse --short "$commit" 2>/dev/null) -> push to origin (the publish workflow runs on the tag)"
  if [ "$DRY" = 1 ]; then sum "$t: would tag $name $tag after a y/N"; continue; fi
  yes_no "  push tag $tag for $name?" || { sum "$t: tag not pushed (you said no)"; continue; }
  if git -C "$pdir" tag "$tag" "$commit" && git -C "$pdir" push -q origin "$tag"; then
    reply "$t" released "tag $tag pushed for $name; the publish workflow does the rest" --version "$(git -C "$pdir" rev-parse --short "$commit")"
    close_ticket "$t" "$tag" "tag pushed"; archive "$t"; sum "$t: $name $tag tag pushed"
  else
    reply "$t" failed "could not create or push tag $tag for $name"; bad "$t: tag push failed"
  fi
done

# ---- tooling: nothing to deploy ----
for t in "${TOOL_T[@]+"${TOOL_T[@]}"}"; do
  say ""; say "== tooling: $t (commits are on $REF; nothing to deploy)"
  reply "$t" released "tooling change is on main at $SHORT; nothing to deploy" --version "$SHORT"
  close_ticket "$t" "$SHORT" "tooling, no deploy" && { archive "$t"; sum "$t: closed (tooling)"; }
done

# ---- the site: one deploy for all ----
if [ "${#SITE_T[@]}" -gt 0 ]; then
  say ""; say "== site: ${SITE_T[*]}"
  refused=0 PAGES=()
  for t in "${SITE_T[@]}"; do
    CHECKED=() REASON=""
    if needs_check "$t"; then
      say "  $t ok: ${CHECKED[*]:-no database objects needed}"
      while IFS= read -r l; do [ -z "$l" ] || PAGES+=("$l"); done < <(HJ "$t" '.pages[]?')
    else
      say "  $t REFUSED: $REASON"; reply "$t" blocked "$REASON"; bad "$t: refused ($REASON)"; refused=1
    fi
  done
  if [ "$refused" = 1 ]; then
    bad "NO DEPLOY: a deployment carries all of main, and at least one hand-off needs something production lacks"
  elif [ "$DRY" = 1 ]; then
    say "  would deploy a clean archive of $SHORT to $SITE, check sign-in, check ${#PAGES[@]} page(s), close ${#SITE_T[@]} ticket(s)"
    sum "site: would deploy $SHORT for ${#SITE_T[@]} hand-off(s)"
  else
    D="$(mktemp -d)"; TMPS+=("$D")
    git -C "$REPO" archive "$SHA" | tar -x -C "$D"
    # The hosted club logos (/team-logos/sl) are not in git: without this step a deploy ships none of them and those clubs draw a broken picture.
    logos_ok=1
    say "  writing the hosted logos from DS1"
    if [ -n "${SPX_HOSTED_LOGOS_CMD:-}" ]; then $SPX_HOSTED_LOGOS_CMD "$D/web" || logos_ok=0
    else ( say() { printf '  %s\n' "$*"; }; die() { printf '  %s\n' "$*" >&2; exit 1; }; . "$REPO/scripts/mac/lib/hosted-logos.sh"; hosted_logos_export "$D/web" ) || logos_ok=0
    fi
    say "  deploying $SHORT (about a minute; nothing prints until the build is done)"
    url="" dpl="" dout=""
    if [ "$logos_ok" = 1 ] && (cd "$D" && $VERCEL link --yes --project spx-stats --scope "$SCOPE" >/dev/null 2>&1); then
      dout="$(cd "$D" && $VERCEL deploy --prod --yes --scope "$SCOPE" 2>/dev/null)"
      url="$(vercel_url "$dout")"; dpl="$(vercel_dpl "$dout")"
    fi
    rm -rf "$D"
    [ -z "$url" ] || [ -n "$dpl" ] || dpl="$($VERCEL inspect "$url" --scope "$SCOPE" 2>&1 | grep -oE 'dpl_[A-Za-z0-9]+' | head -1)"
    dep="${dpl:-$url}"
    if [ -z "$url" ]; then
      log_deploy failed "deploy of $SHORT failed or printed no URL" "$(printf '%s\n' "${SITE_T[@]}" | jq -R . | jq -sc .)"
      for t in "${SITE_T[@]}"; do reply "$t" failed "the Vercel deploy of $SHORT failed or printed no URL; nothing was marked done"; done
      bad "site: deploy FAILED (no URL); see AGENTS.md section 7"
    else
      say "  deployed $url"
      problems=() checked=("deployment READY: $dep")
      la="$(umask 077; mktemp)"; TMPS+=("$la")
      if $LIVEAUTH --new "$url" > "$la" 2>&1; then checked+=("sign-in check ok"); else problems+=("sign-in check failed: $(tail -3 "$la" | tr '\n' ' ')"); fi
      tok="${SPX_VERCEL_BYPASS:-$(kc 'spx-stats VERCEL_AUTOMATION_BYPASS_SECRET')}"
      if [ -z "$tok" ]; then
        checked+=("pages NOT checked (no Vercel protection-bypass token: set SPX_VERCEL_BYPASS or keychain item 'spx-stats VERCEL_AUTOMATION_BYPASS_SECRET')")
        say "  page checks skipped: no bypass token"
      else
        cfg="$(umask 077; mktemp)"; TMPS+=("$cfg"); printf 'header = "x-vercel-protection-bypass: %s"\n' "$tok" > "$cfg"
        for p in "${PAGES[@]+"${PAGES[@]}"}"; do
          body="$(curl -s -m 40 -A "$UA" -K "$cfg" -w '\n%{http_code}' "$SITE$p" 2>/dev/null)"; code="${body##*$'\n'}"
          if [ "$code" != 200 ]; then problems+=("$p answered HTTP ${code:-none}")
          elif printf '%s' "$body" | grep -q "Couldn't load"; then problems+=("$p shows a Couldn't load message")
          else checked+=("$p 200"); fi
        done
      fi
      CARGS=(); for c in "${checked[@]}"; do CARGS+=(--checked "$c"); done
      TJ="$(printf '%s\n' "${SITE_T[@]}" | jq -R . | jq -sc .)"; CJ="$(printf '%s\n' "${checked[@]}" | jq -R . | jq -sc .)"
      PJ="$( [ "${#problems[@]}" -gt 0 ] && printf '%s\n' "${problems[@]}" | jq -R . | jq -sc . || echo '[]')"
      if [ "${#problems[@]}" -gt 0 ]; then log_deploy failed "deployed $SHORT but the checks failed" "$TJ" "$CJ" "$PJ" "$dep" "$url"
      else log_deploy ok "deployed $SHORT (${#SITE_T[@]} hand-off(s))" "$TJ" "$CJ" "$PJ" "$dep" "$url"; fi
      if [ "${#problems[@]}" -gt 0 ]; then
        for t in "${SITE_T[@]}"; do reply "$t" failed "deployed $SHORT but checks failed: ${problems[*]}" --version "$SHORT" --deployment "$dep" "${CARGS[@]}"; done
        bad "site: $SHORT deployed but CHECKS FAILED: ${problems[*]} (roll back: AGENTS.md section 7; tickets not closed)"
      else
        for t in "${SITE_T[@]}"; do
          reply "$t" deployed "deployed $SHORT to production; checks passed" --version "$SHORT" --deployment "$dep" "${CARGS[@]}"
          setstatus "$t" deployed
          close_ticket "$t" "$SHORT" "$dep"; archive "$t"
        done
        sum "site: $SHORT deployed ($dep); ${SITE_T[*]} closed; ${checked[*]}"
      fi
    fi
  fi
fi

say ""; say "---- summary ----"
if [ "${#SUMMARY[@]}" -eq 0 ]; then say "nothing to do"; fi
for l in "${SUMMARY[@]+"${SUMMARY[@]}"}"; do say "- $l"; done
exit "$BAD"

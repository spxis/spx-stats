# Source this from a shell script to write one entry to the run log (scripts/runlog/runlog.py). It never fails the caller: whatever happens,
# the function returns 0 and prints nothing.
#
#   . "$REPO/scripts/runlog/log.sh"
#   runlog_event <job> <kind> <outcome> "<summary>" ['<detail json>'] [more runlog.py event arguments, e.g. --actor machine2 --ref <sha> --alert-key k]
#
# kind: job | data | release | approval | deploy | ops.   outcome: ok | warning | failed | skipped.
# RUNLOG=0 switches it off (every test of a script that calls this sets it). Turso settings: scripts/runlog/runlog.py.
RUNLOG_PY="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)/runlog.py"

runlog_event() {
  [ "${RUNLOG:-1}" = 0 ] && return 0
  command -v python3 >/dev/null 2>&1 || return 0
  local job="${1:-}" kind="${2:-job}" outcome="${3:-ok}" summary="${4:-}" detail="${5:-}"
  [ "$#" -ge 5 ] && shift 5 || shift "$#"
  RUNLOG_KEYCHAIN=1 python3 -I "$RUNLOG_PY" event --job "$job" --kind "$kind" --outcome "$outcome" --summary "$summary" ${detail:+--detail-json "$detail"} "$@" >/dev/null 2>&1 || true
  return 0
}

# runlog_actor: who ran this (SPX_ACTOR, else the role of this Mac when the private host mapping names it, else the login name)
runlog_actor() {
  if [ -n "${SPX_ACTOR:-}" ]; then printf '%s' "$SPX_ACTOR"; return 0; fi
  local ln
  ln="$(scutil --get LocalHostName 2>/dev/null || true)"
  if [ -n "$ln" ] && [ "$ln" = "${MACHINE1_LOCALNAME:-}" ]; then printf 'machine1'; return 0; fi
  if [ -n "$ln" ] && [ "$ln" = "${MACHINE2_LOCALNAME:-}" ]; then printf 'machine2'; return 0; fi
  id -un 2>/dev/null || printf 'unknown'
}

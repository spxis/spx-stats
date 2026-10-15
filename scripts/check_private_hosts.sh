#!/bin/bash
# Fails when a file in the repository (tracked, or new and not ignored) reveals the private setup. The repository is public: machines are named
# by role (machine1, machine2, nas1 = DS1, nas2) and what they really are lives in ~/.config/spx-stats/hosts.env (scripts/mac/lib/hosts.sh).
#
#   bash scripts/check_private_hosts.sh [directory]      default: the repository this script is in. Run it before every push.
#
# It looks for, in every text file:
#   1. a private-range IPv4 address (10.x, 172.16-31.x, 192.168.x, 100.64-127.x). Documentation ranges (192.0.2.x, 198.51.100.x, 203.0.113.x) are fine
#      and are what tests use for stand-ins;
#   2. a machine, NAS or platform name from the old docs and scripts (the list is built from fragments below so this file does not hold them);
#   3. a home folder under /Users;
#   4. when the private mapping exists on this Mac: every address or host name it holds, and its HOSTS_GUARD_WORDS.
# Prints one line per hit (file:line: what) and exits 1; prints `ok` and exits 0 when clean. Never prints a value from the private mapping.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${1:-$HERE/..}"
ROOT="$(cd "$ROOT" && pwd)"
. "$HERE/mac/lib/hosts.sh"

B='(^|[^0-9.])'      # before an address: not part of a longer number
A='([^0-9]|$)'       # after it
OCT='[0-9]{1,3}'
IP_RE="${B}(10\\.${OCT}\\.${OCT}\\.${OCT}|172\\.(1[6-9]|2[0-9]|3[01])\\.${OCT}\\.${OCT}|192\\.168\\.${OCT}\\.${OCT}|100\\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\\.${OCT}\\.${OCT})${A}"
# names of the two Macs, the NAS and its platform software, and the ad-blocker the NAS runs: case-insensitive, built from fragments so that
# this file does not hold them. The platform-software names are matched as whole words (a name such as loadGuard is fine).
NAME_RE="Mac ?St""udio|Mac""Book|Disk""Station|Syno""logy|(^|[^A-Za-z])DS""M([^A-Za-z]|$)|/vol""ume[0-9]|Container ""Manager|File ""Station|(^|[^A-Za-z])Ad""Guard"
HOME_RE='/Users/[A-Za-z0-9_.-]+'

hits=0
report() { printf '%s\n' "$1"; hits=$((hits + 1)); }

files="$(mktemp)"; trap 'rm -f "$files"' EXIT
if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git -C "$ROOT" ls-files -z --cached --others --exclude-standard > "$files"
else
  (cd "$ROOT" && find . -type f -not -path './.git/*' -not -path '*/node_modules/*' -print0) > "$files"
fi

# scan <label> <grep -E pattern> <extra grep flags>: one line per hit; the hit text itself is not printed for the private values
scan() {
  local label="$1" re="$2" flags="${3:-}"
  # shellcheck disable=SC2086
  (cd "$ROOT" && xargs -0 grep -InE $flags -e "$re" -- < "$files" 2>/dev/null) | while IFS= read -r line; do
    printf '%s: %s\n' "${line%%:*}:$(echo "$line" | cut -d: -f2)" "$label"
  done
}
run() { local out; out="$(scan "$@")"; if [ -n "$out" ]; then printf '%s\n' "$out"; hits=$((hits + $(printf '%s\n' "$out" | wc -l))); fi; }

run "private-range IP address (use a documentation range such as 192.0.2.x in tests, a NAS1_* name in the mapping)" "$IP_RE"
run "machine, NAS or platform name (use machine1, machine2, nas1, nas2; real names belong in the private mapping)" "$NAME_RE" -i
run "home folder path (use ~ or a placeholder)" "$HOME_RE"

# the private mapping's own values: addresses, host names, folders, and extra guard words. Skipped when the mapping is absent.
if [ "$SPX_HOSTS_LOADED" = 1 ]; then
  vals=""
  for v in $NAS1_LAN_HOSTS $NAS1_LAN_PRIMARY $NAS1_VPN_HOST ${NAS2_LAN_HOST:-} ${MACHINE1_LOCALNAME:-} ${MACHINE2_LOCALNAME:-} ${MACHINE1_HOST:-} ${MACHINE2_HOST:-} ${NAS1_DOCKER_DIR:-} ${HOSTS_GUARD_WORDS:-}; do
    case "$v" in ''|ds1|machine1|machine2|docker|/) continue ;; esac
    [ "${#v}" -ge 5 ] || continue
    vals="$vals $v"
  done
  for v in $vals; do
    out="$(cd "$ROOT" && xargs -0 grep -InF -i -e "$v" -- < "$files" 2>/dev/null | cut -d: -f1,2 | sed 's/$/: a value from the private host mapping/')"
    if [ -n "$out" ]; then printf '%s\n' "$out"; hits=$((hits + $(printf '%s\n' "$out" | wc -l))); fi
  done
fi

if [ "$hits" -gt 0 ]; then
  echo "check_private_hosts: $hits hit(s). The repository is public: replace each with a role name (machine1, machine2, nas1, nas2) or a documentation address; the real value goes in ~/.config/spx-stats/hosts.env"
  exit 1
fi
echo "check_private_hosts: ok"

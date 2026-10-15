# Shared connection tests for spx-check.sh and spx-credentials.sh. Source it; works in bash 3.2 and zsh.
# Contains no secrets: the production URL and key are the public read-only ones the site ships with.

# Private host mapping: this file names machines only by role (machine1, machine2, nas1 = DS1, nas2); the addresses, host names and
# the NAS login come from ~/.config/spx-stats/hosts.env, or from the environment (scripts/mac/lib/hosts.sh explains every name).
if [ -n "${BASH_VERSION:-}" ]; then _SPX_CK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; else _SPX_CK_DIR="$(cd "$(dirname "${(%):-%x}")" && pwd)"; fi
. "$_SPX_CK_DIR/lib/hosts.sh"

# DS1 (nas1) has two routes from a Mac: the home LAN (it may answer on several addresses; a .local name may not resolve: macOS
# cannot look up a NAS that answers unicast mDNS only) and the VPN. Try both, never one. `ds1` (NAS1_SSH_ALIAS) is a hosts-file
# name set per Mac; where it is not set it fails fast and is skipped.
# nas2 is a different NAS with no spx database: never add its address to the mapping.
SPX_DS1_LAN_HOSTS="${SPX_DS1_LAN_HOSTS:-$NAS1_SSH_ALIAS ${NAS1_LAN_HOSTS:-}}"
SPX_DS1_VPN_HOST="${SPX_DS1_VPN_HOST:-${NAS1_VPN_HOST:-}}"
SPX_DS1_PORT="${SPX_DS1_PORT:-$NAS1_DB_PORT}"
SPX_BOARD_URL="https://api.sumilabu.com/api/v1/projects/spx-stats/tickets"
SPX_PROD_URL="https://njpvfrceahkvnrduerkk.supabase.co"
SPX_PROD_KEY="sb_publishable_FmeiL6oX9_Mrb8psQZFSQg_YO_O4afC"
SPX_TAILSCALE_BIN="/Applications/Tailscale.app/Contents/MacOS/Tailscale"

kc_get() { security find-generic-password -s "$1" -w 2>/dev/null || true; }
board_ok() { [ -n "$1" ] && [ "$(curl -s -m 8 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $1" "$SPX_BOARD_URL")" = 200 ]; }
# ds1_host: print the first DS1 address whose port answers, preferring this order: $SPX_DS1_HOST (optional override),
# the ds1 name and the home LAN addresses (NAS1_SSH_ALIAS, NAS1_LAN_HOSTS), then the VPN address (NAS1_VPN_HOST). Probes run side by side and the first answer wins
# (so an unresolvable .local name, which fails only after about 5 s, never slows a good answer). Gives up after 4 s;
# exit 1 and print nothing if none answers.
ds1_host() {
  local d h i=0 n t=0 any
  d=$(mktemp -d)
  for h in $(printf '%s\n' "${SPX_DS1_HOST:-} $SPX_DS1_LAN_HOSTS $SPX_DS1_VPN_HOST" | tr -s ' ' '\n'); do
    i=$((i + 1))
    eval "ds1_cand_$i=\$h"
    ( nc -z -G 3 "$h" "$SPX_DS1_PORT" >/dev/null 2>&1 && : > "$d/$i" ) &
    eval "ds1_pid_$i=$!"
  done
  while [ "$t" -lt 40 ]; do
    any=0
    for n in $(seq 1 "$i"); do [ -e "$d/$n" ] && any=1; done
    if [ "$any" = 1 ]; then sleep 0.3; break; fi  # short grace so a LAN answer beats a VPN one
    sleep 0.1
    t=$((t + 1))
  done
  for n in $(seq 1 "$i"); do
    if [ -e "$d/$n" ]; then
      eval "h=\$ds1_cand_$n"
      for n in $(seq 1 "$i"); do eval "kill \$ds1_pid_$n" 2>/dev/null || true; done
      rm -rf "$d"; printf '%s\n' "$h"; return 0
    fi
  done
  for n in $(seq 1 "$i"); do eval "kill \$ds1_pid_$n" 2>/dev/null || true; done
  rm -rf "$d"
  return 1
}
# ds1_route <address>: a short name for the route, e.g. "home LAN" or "VPN" (never the address itself).
ds1_route() {
  case "$1" in
    "$SPX_DS1_VPN_HOST") printf 'VPN' ;;
    "$NAS1_SSH_ALIAS") printf 'hosts-file name %s' "$NAS1_SSH_ALIAS" ;;
    *) printf 'home LAN' ;;
  esac
}
# ds1_missing: the one fix text when neither route answers; names both routes, and the mapping file when it is not set up.
ds1_missing() {
  if [ "$SPX_HOSTS_LOADED" != 1 ] && [ -z "${NAS1_LAN_HOSTS:-}${NAS1_VPN_HOST:-}" ]; then
    printf 'no private host mapping (%s does not exist); run: %s' "$SPX_MAP_FILE" "$(spx_hosts_fix)"
  else
    printf 'not reachable on the home LAN or over the VPN; join the home network or turn the VPN on'
  fi
}
# ds1_ok <password>: a real login. Uses $SPX_DS1_FOUND when the caller already ran ds1_host.
ds1_ok() { [ -n "$1" ] && PGPASSWORD="$1" PGCONNECT_TIMEOUT=8 psql -h "${SPX_DS1_FOUND:-$(ds1_host)}" -p "$SPX_DS1_PORT" -U postgres -d spx_stats -Atc 'select 1' >/dev/null 2>&1; }
node_ok() { node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)' 2>/dev/null; }
prod_ok() { [ "$(curl -s -m 8 -o /dev/null -w '%{http_code}' -H "apikey: $SPX_PROD_KEY" -H "Accept-Profile: api" "$SPX_PROD_URL/rest/v1/season_summary?select=league&limit=1")" = 200 ]; }

# --- Per-Mac setup (spx-credentials.sh machine | copy-from | copy-to | parity). Names only, no values. ---
SPX_DS1_LAN_PRIMARY="${SPX_DS1_LAN_PRIMARY:-${NAS1_LAN_PRIMARY:-}}"   # the address the `ds1` hosts name and the ssh config use on the home LAN
SPX_DS1_SSH_USER="${SPX_DS1_SSH_USER:-${NAS1_SSH_USER:-}}"
# limited <seconds> <command...>: run with a time limit (perl alarm; macOS has no timeout).
limited() { perl -e 'alarm shift; exec @ARGV' "$@"; }
# Keychain items every Mac must hold, and the optional ones (set up later on both Macs or neither). One name per line.
spx_kc_required() { printf '%s\n' "spx-stats-db DS1 55440" "sumilabu board spx-stats" "spx-stats SUPABASE_ACCESS_TOKEN"; }
spx_kc_optional() { printf '%s\n' "spx-stats dropbox app key" "spx-stats dropbox app secret" "spx-stats dropbox refresh token" "spx-stats tailscale authkey"; }
# kc_has <item>: is the item in the login keychain? Never reads the value (no -w).
kc_has() { security find-generic-password -s "$1" >/dev/null 2>&1; }
# The two Macs reach each other with an ssh alias that differs by side (MACHINE1_SSH_ALIAS / MACHINE2_SSH_ALIAS in the private
# mapping): machine1 uses MACHINE2_SSH_ALIAS for machine2, machine2 uses MACHINE1_SSH_ALIAS for machine1.
# spx_this_mac: machine1, machine2 or machine-unknown, from this Mac's LocalHostName against MACHINE1_LOCALNAME / MACHINE2_LOCALNAME
# (SPX_THIS_MAC overrides, for tests).
spx_this_mac() {
  local n
  if [ -n "${SPX_THIS_MAC:-}" ]; then printf '%s' "$SPX_THIS_MAC"; return; fi
  n=$(scutil --get LocalHostName 2>/dev/null || hostname -s)
  if [ -n "${MACHINE1_LOCALNAME:-}" ] && [ "$n" = "$MACHINE1_LOCALNAME" ]; then printf 'machine1'
  elif [ -n "${MACHINE2_LOCALNAME:-}" ] && [ "$n" = "$MACHINE2_LOCALNAME" ]; then printf 'machine2'
  else printf 'machine-unknown'; fi
}
spx_other_mac_alias() { case "$(spx_this_mac)" in machine1) printf '%s' "$MACHINE2_SSH_ALIAS" ;; machine2) printf '%s' "$MACHINE1_SSH_ALIAS" ;; *) printf '<other-mac-alias>' ;; esac; }
spx_other_mac_host() { case "$(spx_this_mac)" in machine1) printf '%s' "${MACHINE2_HOST:-}" ;; machine2) printf '%s' "${MACHINE1_HOST:-}" ;; *) printf '' ;; esac; }
spx_other_mac_key() { printf 'id_ed25519_%s' "$(spx_other_mac_alias)"; }

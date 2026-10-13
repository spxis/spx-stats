# Shared connection tests for spx-check.sh and spx-credentials.sh. Source it; works in bash 3.2 and zsh.
# Contains no secrets: the production URL and key are the public read-only ones the site ships with.

# DS1 (DiskStation1) has two routes from a Mac: the home LAN (the NAS has four network ports, 10.0.0.101-104; the
# .local name does not resolve today: DS1 answers unicast mDNS only, so macOS cannot look it up) and Tailscale.
# Try both, never one. `ds1` is a hosts-file name John sets per Mac (Mac Studio: 10.0.0.101, MacBook: the Tailscale
# IP); where it is not set it fails fast and is skipped.
# 10.0.0.115 is DS15 (DiskStation15), a different NAS with no spx database: never add it here.
SPX_DS1_LAN_HOSTS="${SPX_DS1_LAN_HOSTS:-ds1 DiskStation1.local 10.0.0.101 10.0.0.102 10.0.0.103 10.0.0.104}"
SPX_DS1_TAILSCALE_HOST="100.87.30.7"
SPX_DS1_PORT="${SPX_DS1_PORT:-55440}"
SPX_BOARD_URL="https://api.sumilabu.com/api/v1/projects/spx-stats/tickets"
SPX_PROD_URL="https://njpvfrceahkvnrduerkk.supabase.co"
SPX_PROD_KEY="sb_publishable_FmeiL6oX9_Mrb8psQZFSQg_YO_O4afC"
SPX_TAILSCALE_BIN="/Applications/Tailscale.app/Contents/MacOS/Tailscale"

kc_get() { security find-generic-password -s "$1" -w 2>/dev/null || true; }
board_ok() { [ -n "$1" ] && [ "$(curl -s -m 8 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $1" "$SPX_BOARD_URL")" = 200 ]; }
# ds1_host: print the first DS1 address whose port answers, preferring this order: $SPX_DS1_HOST (optional override),
# ds1, DiskStation1.local and the home LAN addresses, then Tailscale. Probes run side by side and the first answer wins
# (so an unresolvable .local name, which fails only after about 5 s, never slows a good answer). Gives up after 4 s;
# exit 1 and print nothing if none answers.
ds1_host() {
  local d h i=0 n t=0 any
  d=$(mktemp -d)
  for h in $(printf '%s\n' "${SPX_DS1_HOST:-} $SPX_DS1_LAN_HOSTS $SPX_DS1_TAILSCALE_HOST" | tr -s ' ' '\n'); do
    i=$((i + 1))
    eval "ds1_cand_$i=\$h"
    ( nc -z -G 3 "$h" "$SPX_DS1_PORT" >/dev/null 2>&1 && : > "$d/$i" ) &
    eval "ds1_pid_$i=$!"
  done
  while [ "$t" -lt 40 ]; do
    any=0
    for n in $(seq 1 "$i"); do [ -e "$d/$n" ] && any=1; done
    if [ "$any" = 1 ]; then sleep 0.3; break; fi  # short grace so a LAN answer beats a Tailscale one
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
# ds1_route <address>: a short name for the route, e.g. "home LAN 10.0.0.101" or "Tailscale".
ds1_route() {
  case "$1" in
    "$SPX_DS1_TAILSCALE_HOST") printf 'Tailscale' ;;
    ds1) printf 'hosts-file name ds1' ;;
    *) printf 'home LAN %s' "$1" ;;
  esac
}
# ds1_missing: the one fix text when neither route answers; names both routes.
ds1_missing() { printf 'not reachable on the home LAN (%s) or Tailscale (%s); join the home network or turn Tailscale on' "${SPX_DS1_LAN_HOSTS// /, }" "$SPX_DS1_TAILSCALE_HOST"; }
# ds1_ok <password>: a real login. Uses $SPX_DS1_FOUND when the caller already ran ds1_host.
ds1_ok() { [ -n "$1" ] && PGPASSWORD="$1" PGCONNECT_TIMEOUT=8 psql -h "${SPX_DS1_FOUND:-$(ds1_host)}" -p "$SPX_DS1_PORT" -U postgres -d spx_stats -Atc 'select 1' >/dev/null 2>&1; }
node_ok() { node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)' 2>/dev/null; }
prod_ok() { [ "$(curl -s -m 8 -o /dev/null -w '%{http_code}' -H "apikey: $SPX_PROD_KEY" -H "Accept-Profile: api" "$SPX_PROD_URL/rest/v1/season_summary?select=league&limit=1")" = 200 ]; }

# --- Per-Mac setup (spx-credentials.sh machine | copy-from | copy-to | parity). Names only, no values. ---
SPX_DS1_LAN_PRIMARY="${SPX_DS1_LAN_PRIMARY:-10.0.0.101}"   # the address the `ds1` hosts name and the ssh config use on the home LAN
SPX_DS1_SSH_USER="spxis"
# limited <seconds> <command...>: run with a time limit (perl alarm; macOS has no timeout).
limited() { perl -e 'alarm shift; exec @ARGV' "$@"; }
# Keychain items every Mac must hold, and the optional ones (set up later on both Macs or neither). One name per line.
spx_kc_required() { printf '%s\n' "spx-stats-db DS1 55440" "sumilabu board spx-stats" "spx-stats SUPABASE_ACCESS_TOKEN"; }
spx_kc_optional() { printf '%s\n' "spx-stats dropbox app key" "spx-stats dropbox app secret" "spx-stats dropbox refresh token" "spx-stats tailscale authkey"; }
# kc_has <item>: is the item in the login keychain? Never reads the value (no -w).
kc_has() { security find-generic-password -s "$1" >/dev/null 2>&1; }
# The two Macs reach each other with an ssh alias that differs by side: the Mac Studio calls the MacBook `laptop`,
# the MacBook calls the Mac Studio `macstudio`.
spx_this_mac() { scutil --get LocalHostName 2>/dev/null || hostname -s; }
spx_other_mac_alias() { case "$(spx_this_mac)" in MacStudio*) printf 'laptop' ;; *) printf 'macstudio' ;; esac; }
spx_other_mac_host() { case "$(spx_this_mac)" in MacStudio*) printf 'MacBookProM5Max.local' ;; *) printf 'MacStudioM1.local' ;; esac; }
spx_other_mac_key() { printf 'id_ed25519_%s' "$(spx_other_mac_alias)"; }

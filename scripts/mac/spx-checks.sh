# Shared connection tests for spx-check.sh and spx-credentials.sh. Source it; works in bash 3.2 and zsh.
# Contains no secrets: the production URL and key are the public read-only ones the site ships with.

# DS1 (DiskStation1) has two routes from a Mac: the home LAN (the NAS has four network ports, 10.0.0.101-104; the
# .local name works only if DS1 advertises Bonjour) and Tailscale. Try both, never one.
# 10.0.0.115 is DS15 (DiskStation15), a different NAS with no spx database: never add it here.
SPX_DS1_LAN_HOSTS="${SPX_DS1_LAN_HOSTS:-DiskStation1.local 10.0.0.101 10.0.0.102 10.0.0.103 10.0.0.104}"
SPX_DS1_TAILSCALE_HOST="100.87.30.7"
SPX_DS1_PORT="${SPX_DS1_PORT:-55440}"
SPX_BOARD_URL="https://api.sumilabu.com/api/v1/projects/spx-stats/tickets"
SPX_PROD_URL="https://njpvfrceahkvnrduerkk.supabase.co"
SPX_PROD_KEY="sb_publishable_FmeiL6oX9_Mrb8psQZFSQg_YO_O4afC"
SPX_TAILSCALE_BIN="/Applications/Tailscale.app/Contents/MacOS/Tailscale"

kc_get() { security find-generic-password -s "$1" -w 2>/dev/null || true; }
board_ok() { [ -n "$1" ] && [ "$(curl -s -m 8 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $1" "$SPX_BOARD_URL")" = 200 ]; }
# ds1_host: print the first DS1 address whose port answers, preferring this order: $SPX_DS1_HOST (optional override),
# DiskStation1.local and the home LAN addresses, then Tailscale. Probes run side by side and the first answer wins
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
ds1_route() { if [ "$1" = "$SPX_DS1_TAILSCALE_HOST" ]; then printf 'Tailscale'; else printf 'home LAN %s' "$1"; fi; }
# ds1_missing: the one fix text when neither route answers; names both routes.
ds1_missing() { printf 'not reachable on the home LAN (%s) or Tailscale (%s); join the home network or turn Tailscale on' "${SPX_DS1_LAN_HOSTS// /, }" "$SPX_DS1_TAILSCALE_HOST"; }
# ds1_ok <password>: a real login. Uses $SPX_DS1_FOUND when the caller already ran ds1_host.
ds1_ok() { [ -n "$1" ] && PGPASSWORD="$1" PGCONNECT_TIMEOUT=8 psql -h "${SPX_DS1_FOUND:-$(ds1_host)}" -p "$SPX_DS1_PORT" -U postgres -d spx_stats -Atc 'select 1' >/dev/null 2>&1; }
node_ok() { node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)' 2>/dev/null; }
prod_ok() { [ "$(curl -s -m 8 -o /dev/null -w '%{http_code}' -H "apikey: $SPX_PROD_KEY" -H "Accept-Profile: api" "$SPX_PROD_URL/rest/v1/season_summary?select=league&limit=1")" = 200 ]; }

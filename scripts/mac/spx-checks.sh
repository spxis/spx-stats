# Shared connection tests for spx-check.sh and spx-credentials.sh. Source it; works in bash 3.2 and zsh.
# Contains no secrets: the production URL and key are the public read-only ones the site ships with.

SPX_DS1_TAILSCALE_HOST="100.87.30.7"
SPX_DS1_PORT="${SPX_DS1_PORT:-55440}"
SPX_BOARD_URL="https://api.sumilabu.com/api/v1/projects/spx-stats/tickets"
SPX_PROD_URL="https://njpvfrceahkvnrduerkk.supabase.co"
SPX_PROD_KEY="sb_publishable_FmeiL6oX9_Mrb8psQZFSQg_YO_O4afC"
SPX_TAILSCALE_BIN="/Applications/Tailscale.app/Contents/MacOS/Tailscale"

kc_get() { security find-generic-password -s "$1" -w 2>/dev/null || true; }
board_ok() { [ -n "$1" ] && [ "$(curl -s -m 8 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $1" "$SPX_BOARD_URL")" = 200 ]; }
ds1_ok() { [ -n "$1" ] && PGPASSWORD="$1" PGCONNECT_TIMEOUT=8 psql -h "${SPX_DS1_HOST:-$SPX_DS1_TAILSCALE_HOST}" -p "$SPX_DS1_PORT" -U postgres -d spx_stats -Atc 'select 1' >/dev/null 2>&1; }
node_ok() { node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)' 2>/dev/null; }
prod_ok() { [ "$(curl -s -m 8 -o /dev/null -w '%{http_code}' -H "apikey: $SPX_PROD_KEY" -H "Accept-Profile: api" "$SPX_PROD_URL/rest/v1/season_summary?select=league&limit=1")" = 200 ]; }

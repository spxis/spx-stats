#!/bin/bash
# Startup check on John's Mac: one line per connection, "ok" or "MISSING: <the one fix>". Read-only, no values printed.
# Run it any time: bash scripts/mac/spx-check.sh. The session-start hook runs it too. Always exits 0.
# claude.ai connectors (Supabase, Vercel, Dropbox, GitHub, Neon, Turso) cannot be seen from a script: the agent checks its tool list.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/spx-checks.sh"
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin:/usr/local/bin:$PATH"

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

# Each check writes one line to $OUT/<n>; they run side by side so the whole run takes as long as the slowest.
limited() { perl -e 'alarm shift; exec @ARGV' "$@"; }
line() { echo "$2" > "$OUT/$1"; }

check_prod() {
  if prod_ok; then line 1 "production Supabase (read): ok"
  else line 1 "production Supabase (read): MISSING: no answer from the public API (check the network, or Supabase is down)"; fi
}
check_ds1() {
  local host="${SPX_DS1_HOST:-$SPX_DS1_TAILSCALE_HOST}"
  if ! command -v psql >/dev/null; then line 2 "DS1 Postgres: MISSING: brew install libpq"
  elif ! nc -z -G 4 "$host" "$SPX_DS1_PORT" 2>/dev/null; then line 2 "DS1 Postgres: MISSING: turn Tailscale on (or join the home network)"
  elif ds1_ok "$(kc_get "spx-stats-db DS1 55440")"; then line 2 "DS1 Postgres: ok"
  else line 2 "DS1 Postgres: MISSING: password not in the keychain or refused (zsh scripts/mac/spx-credentials.sh setup, command in the private file)"; fi
}
check_board() {
  if board_ok "$(kc_get "sumilabu board spx-stats")"; then line 3 "board key: ok"
  else line 3 "board key: MISSING: keychain item 'sumilabu board spx-stats' absent or refused (zsh scripts/mac/spx-credentials.sh setup)"; fi
}
check_vercel() {
  local who
  who=$(limited 10 vercel whoami 2>/dev/null | tail -n 1)
  if [ "$who" = "spxis" ]; then line 4 "Vercel CLI: ok (spxis)"
  else line 4 "Vercel CLI: MISSING: vercel login (account spxis)"; fi
}
check_gh() {
  if limited 8 gh auth status >/dev/null 2>&1; then line 5 "gh login: ok"
  else line 5 "gh login: MISSING: unset GH_TOKEN; gh auth login"; fi
}
check_tailscale() {
  if limited 5 "$SPX_TAILSCALE_BIN" status >/dev/null 2>&1; then line 6 "Tailscale: ok"
  else line 6 "Tailscale: MISSING: open the Tailscale app and turn it on (not needed if DS1 is ok on the home network)"; fi
}
check_tools() {
  local bad=""
  node_ok || bad="node 22.18 or newer"
  command -v pnpm >/dev/null || bad="${bad:+$bad, }pnpm (npm i -g pnpm)"
  if [ -z "$bad" ]; then line 7 "node >= 22.18, pnpm: ok"; else line 7 "node/pnpm: MISSING: install $bad"; fi
}
check_turso() {
  if ! command -v turso >/dev/null; then line 8 "Turso CLI: not installed (optional: brew install tursodatabase/tap/turso)"
  elif limited 8 turso auth whoami >/dev/null 2>&1; then line 8 "Turso CLI: ok"
  else line 8 "Turso CLI: installed, not logged in (optional: turso auth login)"; fi
}
check_neon() {
  if ! command -v neonctl >/dev/null; then line 9 "Neon CLI: not installed (optional: npm i -g neonctl)"
  elif limited 8 neonctl me >/dev/null 2>&1; then line 9 "Neon CLI: ok"
  else line 9 "Neon CLI: installed, not logged in (optional: neonctl auth)"; fi
}

for c in check_prod check_ds1 check_board check_vercel check_gh check_tailscale check_tools check_turso check_neon; do "$c" & done
wait

echo "[spx-check] connections on this Mac (claude.ai connectors: the agent checks its own tool list)"
n=0
for i in 1 2 3 4 5 6 7 8 9; do
  l=$(cat "$OUT/$i" 2>/dev/null || echo "check $i: MISSING: check did not finish")
  echo "[spx-check] $l"
  case "$l" in *MISSING*) n=$((n + 1));; esac
done
if [ "$n" -gt 0 ]; then
  echo "[spx-check] fix list: $n missing. Report each to John as NEED FROM YOU: with the fix shown above, then carry on with what works."
fi
exit 0

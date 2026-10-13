#!/bin/bash
# Startup check on John's Mac: one line per connection, "ok" or "MISSING: <the one fix>". Read-only, no values printed.
# DS1 is tried on the home LAN and on Tailscale; a Mac on the home network needs no Tailscale.
# Run it any time: bash scripts/mac/spx-check.sh. The session-start hook runs it too. Always exits 0.
# claude.ai connectors (Supabase, Vercel, Dropbox, GitHub) cannot be seen from a script: the agent checks its tool list.
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
  local host
  if ! command -v psql >/dev/null; then line 2 "DS1 Postgres: MISSING: brew install libpq"; return; fi
  host=$(ds1_host) || { line 2 "DS1 Postgres: MISSING: $(ds1_missing)"; return; }
  SPX_DS1_FOUND="$host"
  if ds1_ok "$(kc_get "spx-stats-db DS1 55440")"; then line 2 "DS1 Postgres: ok ($(ds1_route "$host"))"
  else line 2 "DS1 Postgres: MISSING: $(ds1_route "$host") answers, but the password is not in the keychain or was refused (zsh scripts/mac/spx-credentials.sh setup, command in the private file)"; fi
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
  local host
  if limited 5 "$SPX_TAILSCALE_BIN" status >/dev/null 2>&1; then line 6 "Tailscale: ok"
  elif host=$(ds1_host); then line 6 "Tailscale: off (not needed: DS1 answers on $(ds1_route "$host"))"
  else line 6 "Tailscale: MISSING: off, and DS1 does not answer on the home LAN either; open the Tailscale app and turn it on, or join the home network"; fi
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

# Optional: DS1 is the truth, production a copy. Compares row counts of a few key tables; exact diffs: scripts/sync/compare.py.
check_counts() {
  local token host pw q p d
  token="${SUPABASE_ACCESS_TOKEN:-$(kc_get "spx-stats SUPABASE_ACCESS_TOKEN")}"
  if [ -z "$token" ]; then line 9 "row counts DS1 vs production: skipped (optional: no SUPABASE_ACCESS_TOKEN or keychain item 'spx-stats SUPABASE_ACCESS_TOKEN')"; return; fi
  command -v psql >/dev/null || { line 9 "row counts DS1 vs production: skipped (no psql)"; return; }
  host=$(ds1_host) || { line 9 "row counts DS1 vs production: skipped (DS1 not reachable)"; return; }
  pw=$(kc_get "spx-stats-db DS1 55440")
  [ -n "$pw" ] || { line 9 "row counts DS1 vs production: skipped (no DS1 password in the keychain)"; return; }
  q="select string_agg(t || '=' || n, ' ' order by t) as s from (
    select 'core.game' t, count(*) n from core.game union all select 'core.person', count(*) from core.person
    union all select 'core.team_season', count(*) from core.team_season union all select 'core.roster_stint', count(*) from core.roster_stint
    union all select 'core.franchise_brand', count(*) from core.franchise_brand) x"
  d=$(PGPASSWORD="$pw" PGCONNECT_TIMEOUT=8 limited 20 psql -h "$host" -p "$SPX_DS1_PORT" -U postgres -d spx_stats -Atc "$q" 2>/dev/null)
  p=$(printf '{"query": "%s"}' "$(echo "$q" | tr '\n' ' ')" |
    limited 30 curl -s -m 25 -X POST "https://api.supabase.com/v1/projects/njpvfrceahkvnrduerkk/database/query" \
      -H "Authorization: Bearer $token" -H "Content-Type: application/json" -H "User-Agent: spx-check" --data-binary @- |
    sed -n 's/.*"s" *: *"\([^"]*\)".*/\1/p')
  if [ -z "$d" ] || [ -z "$p" ]; then line 9 "row counts DS1 vs production: skipped (no answer from $([ -z "$d" ] && echo DS1 || echo the Management API))"
  elif [ "$d" = "$p" ]; then line 9 "row counts DS1 vs production: ok"
  else line 9 "row counts DS1 vs production: MISMATCH: DS1 [$d] production [$p]; run scripts/sync/compare.py (see scripts/sync/README.md); DS1 first, then production"; fi
}

check_migrations() {
  local out
  if out=$(bash "$HERE/../check_migration_numbers.sh" 2>&1); then line 10 "$out"
  else line 10 "migration numbers: MISSING: fix the clash (git fetch && git rebase origin/main, renumber your file): $(echo "$out" | head -n 1)"; fi
}

for c in check_prod check_ds1 check_board check_vercel check_gh check_tailscale check_tools check_turso check_counts check_migrations; do "$c" & done
wait

echo "[spx-check] connections on this Mac (claude.ai connectors: the agent checks its own tool list)"
n=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  l=$(cat "$OUT/$i" 2>/dev/null || echo "check $i: MISSING: check did not finish")
  echo "[spx-check] $l"
  case "$l" in *MISSING*) n=$((n + 1));; esac
done
if [ "$n" -gt 0 ]; then
  echo "[spx-check] fix list: $n missing. Report each to John as NEED FROM YOU: with the fix shown above, then carry on with what works."
fi
exit 0

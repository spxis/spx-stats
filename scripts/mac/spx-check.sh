#!/bin/bash
# Startup check on John's Mac: one line per connection, "ok" or "MISSING: <the one fix>". Read-only, no values printed.
# DS1 (nas1) is tried on the home LAN and over the VPN; a Mac on the home network needs no VPN. Addresses and names come from the
# private host mapping (scripts/mac/lib/hosts.sh); without it the lines say MISSING and how to create it.
# Run it any time: bash scripts/mac/spx-check.sh. The session-start hook runs it too. Always exits 0.
# claude.ai connectors (Supabase, Vercel, Dropbox, GitHub) cannot be seen from a script: the agent checks its tool list.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/spx-checks.sh"
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin:/usr/local/bin:$PATH"

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

# Each check writes one line to $OUT/<n>; they run side by side so the whole run takes as long as the slowest.
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
  if limited 5 "$SPX_TAILSCALE_BIN" status >/dev/null 2>&1; then line 6 "Tailscale (VPN): ok"
  elif host=$(ds1_host); then line 6 "Tailscale (VPN): off (not needed: DS1 answers on $(ds1_route "$host"))"
  else line 6 "Tailscale (VPN): MISSING: off, and DS1 does not answer on the home LAN either; open the Tailscale app and turn it on, or join the home network"; fi
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

# Key login to DS1 over ssh (alias NAS1_SSH_ALIAS, default ds1, set up by `spx-credentials.sh machine`); the route is whichever the config chose.
ssh_fix() { if [ "$SPX_HOSTS_LOADED" = 1 ] || [ -n "${NAS1_LAN_PRIMARY:-}" ]; then printf "zsh scripts/mac/spx-credentials.sh machine"; else printf "no private host mapping yet: %s" "$(spx_hosts_fix)"; fi; }
check_ssh() {
  local out addr
  out=$(limited 14 ssh -o BatchMode=yes -o ConnectTimeout=6 -o ControlMaster=no -o ControlPath=none "$NAS1_SSH_ALIAS" hostname 2>/dev/null | tail -n 1)
  if [ -n "$out" ]; then
    addr=$(limited 6 ssh -G "$NAS1_SSH_ALIAS" 2>/dev/null | awk '$1=="hostname"{print $2}')
    if [ -n "$SPX_DS1_VPN_HOST" ] && [ "$addr" = "$SPX_DS1_VPN_HOST" ]; then line 11 "ssh $NAS1_SSH_ALIAS: ok (VPN)"; else line 11 "ssh $NAS1_SSH_ALIAS: ok (home LAN)"; fi
  else line 11 "ssh $NAS1_SSH_ALIAS: MISSING: no key login to DS1 ($(ssh_fix))"; fi
}
# Keychain parity: every required item is on this Mac (names only; a value is never read).
check_keychain() {
  local miss="" i
  while IFS= read -r i; do
    kc_has "$i" || miss="${miss:+$miss, }'$i'"
  done <<EOF
$(spx_kc_required)
EOF
  if [ -z "$miss" ]; then line 12 "keychain items (required): ok"
  else line 12 "keychain: MISSING: $miss (zsh scripts/mac/spx-credentials.sh copy-from $(spx_other_mac_alias); the DS1 password and board key can also come from 'zsh scripts/mac/spx-credentials.sh setup')"; fi
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

# The private host mapping (addresses, names, the NAS login live there, never in the repository).
check_hosts() {
  local miss=""
  [ "$SPX_HOSTS_LOADED" = 1 ] || miss="file $SPX_MAP_FILE does not exist"
  if [ -z "$miss" ]; then
    for v in NAS1_LAN_HOSTS NAS1_LAN_PRIMARY NAS1_VPN_HOST NAS1_SSH_USER NAS1_DOCKER_DIR MACHINE1_LOCALNAME MACHINE2_LOCALNAME MACHINE1_HOST MACHINE2_HOST MACHINE_SSH_USER; do
      eval "[ -n \"\${$v:-}\" ]" || miss="${miss:+$miss, }$v empty"
    done
  fi
  if [ -z "$miss" ]; then line 13 "host mapping ($SPX_MAP_FILE): ok"
  else line 13 "host mapping: MISSING: $miss; $(spx_hosts_fix)"; fi
}

# The repository must hold no private address or name (scripts/check_private_hosts.sh).
check_repo_private() {
  local out
  if out=$(bash "$HERE/../check_private_hosts.sh" 2>&1); then line 14 "repository holds no private host data: ok"
  else line 14 "repository holds private host data: MISSING: remove it before any push ($(echo "$out" | head -n 1 | cut -c1-160))"; fi
}

check_migrations() {
  local out
  if out=$(bash "$HERE/../check_migration_numbers.sh" 2>&1); then line 10 "$out"
  else line 10 "migration numbers: MISSING: fix the clash (git fetch && git rebase origin/main, renumber your file): $(echo "$out" | head -n 1)"; fi
}

# Tests source this file with SPX_CHECK_LIB_ONLY=1 to call one check without running them all (nothing is requested).
[ -z "${SPX_CHECK_LIB_ONLY:-}" ] || return 0 2>/dev/null || exit 0

for c in check_prod check_ds1 check_board check_vercel check_gh check_tailscale check_tools check_turso check_counts check_migrations check_ssh check_keychain check_hosts check_repo_private; do "$c" & done
wait

echo "[spx-check] connections on this Mac (claude.ai connectors: the agent checks its own tool list)"
n=0
for i in 13 14 1 2 3 4 5 6 7 8 9 10 11 12; do
  l=$(cat "$OUT/$i" 2>/dev/null || echo "check $i: MISSING: check did not finish")
  echo "[spx-check] $l"
  case "$l" in *MISSING*) n=$((n + 1));; esac
done
if [ "$n" -gt 0 ]; then
  echo "[spx-check] fix list: $n missing. Report each to John as NEED FROM YOU: with the fix shown above, then carry on with what works."
fi
exit 0

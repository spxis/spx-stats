#!/usr/bin/env bash
# SessionStart hook for spx-stats cloud sessions. No secret values in this file.
# Idempotent; skips fast when the database already has data. Never drops or overwrites anything.
#   DRY_RUN=1 prints what it would do and changes nothing.
# Env (cloud environment settings; see AGENTS.md): TS_AUTHKEY, SPX_DS1_DB_PASSWORD
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ] && [ "${DRY_RUN:-}" != "1" ]; then
  # Not a cloud session: on a Mac, print the connection check so it lands in the agent's context.
  if [ "$(uname)" = "Darwin" ]; then bash "$HERE/../mac/spx-check.sh" || true; fi
  exit 0
fi
echo '{"async": true, "asyncTimeout": 1800000}'

DRY="${DRY_RUN:-0}"
WORK=/home/user/spxwork
TS_DIR="$WORK/ts"
PGDATA="$WORK/pg17"
PGBIN=/usr/lib/postgresql/17/bin
PGPORT_LOCAL=55432
DS1_IP=100.87.30.7
DS1_PORT=55440
FWD_PORT=15440
TS="$TS_DIR/tailscale"
TSD="$TS_DIR/tailscaled"
SOCK="$TS_DIR/tailscaled.sock"

say() { echo "[spx-start] $*" >&2; }
run() { if [ "$DRY" = "1" ]; then say "would run: $*"; else "$@"; fi; }
pg_up() { "$PGBIN/pg_isready" -q -h /tmp -p "$PGPORT_LOCAL" 2>/dev/null; }
db_ready() {
  [ -x "$PGBIN/psql" ] && "$PGBIN/psql" -h /tmp -p "$PGPORT_LOCAL" -U postgres -d spx_stats -Atc \
    "select count(*) from core.game" 2>/dev/null | grep -qE '^[1-9]'
}

# One-line summary on stdout at every exit, in the same style as scripts/mac/spx-check.sh.
report() {
  local prod=MISSING db=MISSING ds1="MISSING: set TS_AUTHKEY and SPX_DS1_DB_PASSWORD in the cloud environment (AGENTS.md section 12)"
  [ "$(curl -s -m 8 -o /dev/null -w '%{http_code}' -H "apikey: sb_publishable_FmeiL6oX9_Mrb8psQZFSQg_YO_O4afC" \
    -H "Accept-Profile: api" "https://njpvfrceahkvnrduerkk.supabase.co/rest/v1/season_summary?select=league&limit=1" 2>/dev/null)" = 200 ] && prod=ok
  db_ready && db=ok
  [ -S "$SOCK" ] && "$TS" --socket="$SOCK" status >/dev/null 2>&1 && ds1="ok (Tailscale up)"
  [ "$db" = ok ] && [ "$ds1" != "ok (Tailscale up)" ] && ds1="not needed, local database is loaded"
  echo "[spx-check] production Supabase (read): $prod"
  echo "[spx-check] local database spx_stats: $db"
  echo "[spx-check] DS1 over Tailscale: $ds1"
  if [ -n "${SUMILABU_BOARD_TOKEN:-}" ]; then echo "[spx-check] board key: set"
  else echo "[spx-check] board key: MISSING: set SUMILABU_BOARD_TOKEN in the cloud environment"; fi
  return 0
}
[ "$DRY" = "1" ] || trap report EXIT

# Fast skip: the database is already there with data.
if [ "$DRY" != "1" ] && db_ready; then
  say "database spx_stats already has data; nothing to do"
  exit 0
fi

# 1. Postgres 17 installed, initialised (never re-inits an existing data dir) and running.
if [ ! -x "$PGBIN/postgres" ]; then
  say "installing postgresql-17"
  run apt-get update -qq
  run apt-get install -y -qq postgresql-17 postgresql-client-17
fi
run mkdir -p "$WORK"
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  say "initialising $PGDATA"
  run mkdir -p "$PGDATA"
  run chown postgres:postgres "$PGDATA"
  run su postgres -c "$PGBIN/initdb -D $PGDATA -A trust -E UTF8"
fi
if [ "$DRY" = "1" ] || ! pg_up; then
  say "starting postgres on $PGPORT_LOCAL"
  run su postgres -c "$PGBIN/pg_ctl -D $PGDATA -l /tmp/pg17.log -o '-p $PGPORT_LOCAL -k /tmp -c listen_addresses=127.0.0.1' start -w"
fi

# 2. Tailscale in userspace mode.
if [ -z "${TS_AUTHKEY:-}" ] && [ "$DRY" != "1" ]; then
  say "TS_AUTHKEY is not set, so DS1 is out of reach. Add it to the environment settings (AGENTS.md)."
  exit 0
fi
if [ ! -x "$TS" ]; then
  say "downloading tailscale"
  run mkdir -p "$TS_DIR"
  run bash -c "curl -fsSL https://pkgs.tailscale.com/stable/tailscale_1.104.1_amd64.tgz | tar -xz -C $TS_DIR --strip-components=1"
fi
if [ "$DRY" = "1" ] || [ ! -S "$SOCK" ]; then
  say "starting tailscaled (userspace)"
  run bash -c "nohup $TSD --tun=userspace-networking --state=$TS_DIR/state --socket=$SOCK >$TS_DIR/tailscaled.log 2>&1 &"
  run sleep 3
fi
if [ "$DRY" = "1" ] || ! "$TS" --socket="$SOCK" status >/dev/null 2>&1; then
  say "bringing tailscale up"
  run bash -c "$TS --socket=$SOCK up --authkey=\"\${TS_AUTHKEY}\" --hostname=spx-cloud-session --accept-dns=false"
fi

# 3. Restore from DS1 into a fresh spx_stats (skipped if a database of that name exists).
if [ "$DRY" != "1" ] && [ -z "${SPX_DS1_DB_PASSWORD:-}" ]; then
  say "SPX_DS1_DB_PASSWORD is not set; cannot restore"
  exit 0
fi
EXISTS=""
if [ "$DRY" != "1" ]; then
  EXISTS=$("$PGBIN/psql" -h /tmp -p "$PGPORT_LOCAL" -U postgres -Atc "select 1 from pg_database where datname='spx_stats'")
fi
if [ "$EXISTS" = "1" ]; then
  say "database spx_stats exists but is empty or partial; not touching it. Drop it by hand to restore."
  exit 0
fi
say "forwarding DS1 $DS1_IP:$DS1_PORT to 127.0.0.1:$FWD_PORT"
run bash -c "nohup python3 $HERE/fwd.py $FWD_PORT $DS1_IP $DS1_PORT >$TS_DIR/fwd.log 2>&1 &"
run sleep 2
run "$PGBIN/createdb" -h /tmp -p "$PGPORT_LOCAL" -U postgres spx_stats
say "restoring (dump from DS1 piped into the local database)"
run bash -c "PGPASSWORD=\"\${SPX_DS1_DB_PASSWORD}\" $PGBIN/pg_dump -h 127.0.0.1 -p $FWD_PORT -U postgres -d spx_stats -Fc --no-owner | $PGBIN/pg_restore -h /tmp -p $PGPORT_LOCAL -U postgres -d spx_stats --no-owner"
say "done. DS1's copy can be older than the last cloud session; see the handover notes."

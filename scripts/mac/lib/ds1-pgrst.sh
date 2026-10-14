# A PostgREST in Docker on DS1 Postgres, shared by deploy-prebuilt.sh and ds1-preview.sh so the two cannot drift. Source it; never run it.
#
#   ds1_pgrst_start <container name> <port>   starts it on 127.0.0.1:<port> (schema api, role anon, read-only session) and waits until
#                                             api.games answers 200; sets LOCAL=http://127.0.0.1:<port>/ ; calls die() on any failure
#   ds1_pgrst_stop  <container name>          removes the container (quiet, safe to repeat)
#
# The caller defines say() and die() (die must exit). The DS1 password comes from SPX_DS1_DB_PASSWORD or the keychain item
# 'spx-stats-db DS1 55440'; it is read in-process, never printed and never put on a command line (docker gets it through the environment).
# Settings for tests: SPX_DS1_HOST, SPX_DS1_PORT, SPX_DS1_DB_NAME, SPX_DS1_DB_USER.

_PGRST_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
type ds1_host >/dev/null 2>&1 || . "$_PGRST_HERE/../spx-checks.sh"

PGRST_IMAGE="postgrest/postgrest:v12.2.12@sha256:5f4ce744539bbba786b4e24dbbd95bdb2a956dcf568c5374995a0ff4a68f5bd2"
DB_USER="${SPX_DS1_DB_USER:-postgres}"
DB_NAME="${SPX_DS1_DB_NAME:-spx_stats}"

ds1_pgrst_stop() { docker rm -f "$1" >/dev/null 2>&1 || true; }

ds1_pgrst_start() {
  local NAME="$1" PORT="$2" HOST PW ENC ready code
  HOST="${SPX_DS1_HOST:-}"
  [ -n "$HOST" ] || HOST="$(ds1_host)" || die "DS1 $(ds1_missing)"
  PW="${SPX_DS1_DB_PASSWORD:-}"
  [ -n "$PW" ] || PW="$(kc_get 'spx-stats-db DS1 55440')"
  [ -n "$PW" ] || die "no DS1 password: the keychain item 'spx-stats-db DS1 55440' is missing here (zsh scripts/mac/spx-credentials.sh parity)"
  ENC="$(printf '%s' "$PW" | python3 -I -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=""))')"
  unset PW
  # The connection string (with the password) goes to docker through the environment, not the command line.
  # The other settings (read-only session, schema api, role anon, no LISTEN channel) are in ds1-pgrst.env, shared with the always-on compose project.
  export PGRST_DB_URI="postgres://${DB_USER}:${ENC}@${HOST}:${SPX_DS1_PORT}/${DB_NAME}"
  unset ENC
  say "starting PostgREST ($NAME) on 127.0.0.1:$PORT against DS1 $HOST:$SPX_DS1_PORT"
  docker run -d --name "$NAME" -p "127.0.0.1:$PORT:3000" --memory 512m \
    --env-file "$_PGRST_HERE/ds1-pgrst.env" -e PGRST_DB_URI \
    "$PGRST_IMAGE" >/dev/null || die "docker could not start PostgREST"
  unset PGRST_DB_URI

  LOCAL="http://127.0.0.1:$PORT/"
  ready=0
  code=""
  # A read the anon role may make (one season of one league: the root answers 401/403 for anon); 200 only. PostgREST answers 503 while it loads DS1's schema.
  for _ in $(seq 1 90); do
    code="$(curl -s -m 10 -o /dev/null -w '%{http_code}' -H 'Accept-Profile: api' "${LOCAL}games?league=eq.nhl&year=eq.2010&select=game_id&limit=1")"
    if [ "$code" = 200 ]; then ready=1; break; fi
    docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null | grep -q true || break
    sleep 1
  done
  if [ "$ready" != 1 ]; then
    say "PostgREST did not become healthy (last HTTP $code). Its log:"
    docker logs --tail 15 "$NAME" 2>&1 | sed 's#postgres://[^ ]*#postgres://***#g'
    die "no PostgREST on DS1"
  fi
  say "PostgREST healthy: api.games answers from DS1"
}

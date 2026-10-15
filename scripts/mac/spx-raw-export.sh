#!/bin/bash
# spx-raw-export.sh: copy every row of legacy_files.raw_archive from DS1's Postgres into the Dropbox folder
# <Dropbox>/Backups/spx-stats/raw/<name>, where <name> looks like source/date/file.
#
# Runs on the Mac (bash 3.2, BSD tools). The database password comes from the keychain item
# 'spx-stats-db DS1 55440' and is never printed or logged. Safe to run again: a file that is already there with the
# same sha256 is skipped, one with a different sha256 is reported and never overwritten, and every file is written to
# <file>.part, hash-checked and only then renamed.
#
#   spx-raw-export.sh                    export
#   spx-raw-export.sh --check            find DS1 and say what would be exported; write nothing
#   spx-raw-export.sh --install-schedule run hourly through launchd
#   spx-raw-export.sh --remove-schedule  undo that
#   spx-raw-export.sh --help
#
# Where DS1 (nas1) is comes from the private host mapping (NAS1_LAN_HOSTS, NAS1_VPN_HOST, NAS1_DB_PORT in
# ~/.config/spx-stats/hosts.env, scripts/mac/lib/hosts.sh); without it this script says MISSING and how to create it.
# Environment (all optional): SPX_DS1_HOST (tried first), SPX_DS1_PORT (default NAS1_DB_PORT, 55440), SPX_DROPBOX_DIR (the Dropbox
# root), SPX_DS1_DB_PASSWORD (used only when the keychain has none), SPX_PROBE_LIMIT / SPX_FETCH_LIMIT (seconds).

export LC_ALL=C
set -u -o pipefail

LABEL="ca.johnmorris.spx-raw-export"
KEYCHAIN_SERVICE="spx-stats-db DS1 55440"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOGFILE="$HOME/Library/Logs/spx-raw-export.log"
DB_NAME="spx_stats"
DB_USER="postgres"
_RAW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$_RAW_DIR/lib/hosts.sh"
PORT="${SPX_DS1_PORT:-$NAS1_DB_PORT}"
VPN_HOST="${NAS1_VPN_HOST:-}"
PROBE_LIMIT="${SPX_PROBE_LIMIT:-12}"
FETCH_LIMIT="${SPX_FETCH_LIMIT:-300}"
KEYCHAIN_LIMIT=15

# Nothing may hang: libpq gives up connecting after this many seconds, and the server cuts any statement.
export PGCONNECT_TIMEOUT="${SPX_CONNECT_TIMEOUT:-4}"
export PGOPTIONS="-c statement_timeout=$((FETCH_LIMIT * 1000))"

MODE="export"
SCHEDULED=0
TMP=""
LOCKDIR=""
CUR_PART=""
PSQL=""
HOST=""
DROPBOX=""
DEST_ROOT=""

usage() {
  cat <<'EOF'
Usage: spx-raw-export.sh [--check | --install-schedule | --remove-schedule | --help]

Exports legacy_files.raw_archive from DS1 to <Dropbox>/Backups/spx-stats/raw/<name>.
  (no flag)            export; skips files already there with the same sha256, never overwrites a different one
  --check              find DS1 and report what would be exported; writes nothing
  --install-schedule   run the export hourly through launchd (~/Library/LaunchAgents/ca.johnmorris.spx-raw-export.plist)
  --remove-schedule    undo --install-schedule
  --help               this text

DS1 is found on the home network or over the VPN, whichever answers first (addresses: the private host mapping).
Set SPX_DS1_HOST to try a host of your own first. The log of scheduled runs is ~/Library/Logs/spx-raw-export.log.
EOF
}

say() { printf '%s\n' "$*"; }
note() { if [ "$SCHEDULED" = 1 ]; then printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; else printf '%s\n' "$*"; fi; }
die() { printf '%s\n' "$*" >&2; exit 1; }

cleanup() {
  if [ -n "$CUR_PART" ] && [ -e "$CUR_PART" ]; then rm -f "$CUR_PART"; fi
  if [ -n "$TMP" ] && [ -d "$TMP" ]; then rm -rf "$TMP"; fi
  if [ -n "$LOCKDIR" ] && [ -d "$LOCKDIR" ]; then rm -rf "$LOCKDIR"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# limited SECONDS OUTFILE ERRFILE cmd args...: run cmd with its output in files and a watchdog that kills it after
# SECONDS (macOS has no timeout command). Returns the command's status, or 124 if the watchdog had to kill it.
limited() {
  local limit=$1 out=$2 err=$3 pid rc
  shift 3
  rm -f "$err.killed"
  "$@" >"$out" 2>"$err" </dev/null &
  pid=$!
  (
    exec >/dev/null 2>&1 </dev/null
    n=0
    while [ "$n" -lt "$limit" ] && kill -0 "$pid" 2>/dev/null; do sleep 1; n=$((n + 1)); done
    if kill -0 "$pid" 2>/dev/null; then
      : >"$err.killed"
      kill -TERM "$pid"
      sleep 1
      kill -KILL "$pid"
    fi
  ) &
  wait "$pid"
  rc=$?
  if [ -e "$err.killed" ]; then return 124; fi
  return "$rc"
}

find_psql() {
  local d
  PSQL=$(command -v psql 2>/dev/null || true)
  if [ -n "$PSQL" ]; then return 0; fi
  for d in /opt/homebrew/opt/libpq/bin /opt/homebrew/bin /usr/local/opt/libpq/bin /usr/local/bin \
    /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin \
    /Applications/Postgres.app/Contents/Versions/*/bin; do
    if [ -x "$d/psql" ]; then PSQL="$d/psql"; fi
  done
  if [ -n "$PSQL" ]; then return 0; fi
  die "psql not found. Install it with:  brew install libpq   (or install Postgres.app), then run this again."
}

find_dropbox() {
  local d
  if [ -n "${SPX_DROPBOX_DIR:-}" ]; then
    [ -d "$SPX_DROPBOX_DIR" ] || die "SPX_DROPBOX_DIR ($SPX_DROPBOX_DIR) is not a folder."
    DROPBOX=$SPX_DROPBOX_DIR
  else
    for d in "$HOME/Library/CloudStorage/Dropbox" "$HOME/Dropbox"; do
      if [ -z "$DROPBOX" ] && [ -d "$d" ]; then DROPBOX=$d; fi
    done
  fi
  [ -n "$DROPBOX" ] || die "No Dropbox folder found (looked for ~/Library/CloudStorage/Dropbox and ~/Dropbox). Install and sign in to the Dropbox app first."
  DEST_ROOT="$DROPBOX/Backups/spx-stats/raw"
}

pick_sha() {
  if command -v shasum >/dev/null 2>&1; then SHA_KIND=shasum
  elif command -v sha256sum >/dev/null 2>&1; then SHA_KIND=sha256sum
  else die "Neither shasum nor sha256sum found."; fi
}

file_sha() { # prints the sha256 of a file, or nothing if it cannot be read
  local out
  if [ "$SHA_KIND" = shasum ]; then out=$(shasum -a 256 "$1" 2>/dev/null) || return 1
  else out=$(sha256sum "$1" 2>/dev/null) || return 1; fi
  printf '%s' "${out%% *}"
}

hex2bin() { # hex file in $1, bytes on stdout
  if command -v xxd >/dev/null 2>&1; then xxd -r -p "$1"
  else perl -e 'local $/; open(F, "<", $ARGV[0]) or die; my $h = <F>; $h =~ s/\s+//g; binmode(STDOUT); print pack("H*", $h);' "$1"; fi
}

get_password() {
  local pw="" out err rc
  if command -v security >/dev/null 2>&1; then
    out="$TMP/kc.out"; err="$TMP/kc.err"
    limited "$KEYCHAIN_LIMIT" "$out" "$err" security find-generic-password -s "$KEYCHAIN_SERVICE" -w
    rc=$?
    if [ "$rc" = 0 ]; then pw=$(cat "$out"); fi
    rm -f "$out" "$err"
  fi
  if [ -z "$pw" ] && [ -n "${SPX_DS1_DB_PASSWORD:-}" ]; then pw=$SPX_DS1_DB_PASSWORD; fi
  if [ -z "$pw" ]; then
    die "No DS1 database password. It should be in the macOS keychain as '$KEYCHAIN_SERVICE'. Add it once with:
  security add-generic-password -s '$KEYCHAIN_SERVICE' -a postgres -w
(it asks for the password), then run this again."
  fi
  export PGPASSWORD="$pw"
}

# ---- finding DS1 -------------------------------------------------------------------------------------------------

host_label() {
  case "$1" in
    "$VPN_HOST") printf 'VPN' ;;
    127.*|localhost) printf 'local forward' ;;
    *) printf 'home network' ;;
  esac
}

probe_one() { # index host: leaves $TMP/p<index>.rc when done
  limited "$PROBE_LIMIT" "$TMP/p$1.out" "$TMP/p$1.err" \
    "$PSQL" -X -w -q -At -h "$2" -p "$PORT" -U "$DB_USER" -d "$DB_NAME" -c 'select 1'
  echo $? >"$TMP/p$1.rc.tmp"
  mv "$TMP/p$1.rc.tmp" "$TMP/p$1.rc"
}

why_failed() { # index
  local f="$TMP/p$1.err" first
  if [ -e "$f.killed" ]; then
    printf 'no answer in %ss (not on that network, or a firewall silently drops port %s)' "$PROBE_LIMIT" "$PORT"; return
  fi
  first=$(head -n 1 "$f" 2>/dev/null | cut -c1-110)
  if grep -qi 'password authentication failed' "$f" 2>/dev/null; then
    printf "reached DS1, but the password was refused (check the keychain item '%s')" "$KEYCHAIN_SERVICE"
  elif grep -qi 'no pg_hba.conf entry' "$f" 2>/dev/null; then
    printf 'reached DS1, but Postgres refuses this machine (pg_hba.conf)'
  elif grep -qi 'timeout expired' "$f" 2>/dev/null; then
    printf 'timed out (not on that network, or a firewall drops port %s)' "$PORT"
  elif grep -qi 'connection refused' "$f" 2>/dev/null; then
    printf 'refused (a machine answered but port %s is closed: DS1 firewall rejecting it, or the database is stopped)' "$PORT"
  elif grep -qiE 'no route to host|network is unreachable' "$f" 2>/dev/null; then
    printf 'no route (this Mac is not on that network)'
  elif grep -qiE 'could not translate host name|name or service not known|nodename nor servname|temporary failure in name resolution' "$f" 2>/dev/null; then
    printf 'name not found (not on the home network, or .local names are off)'
  else
    printf 'failed: %s' "${first:-unknown error}"
  fi
}

detect_ds1() {
  local cands="" h i=0 n total j found="" waited
  for h in "${SPX_DS1_HOST:-}" ${NAS1_LAN_HOSTS:-} "$VPN_HOST"; do
    [ -n "$h" ] || continue
    case " $cands " in *" $h "*) continue ;; esac
    cands="$cands $h"
  done
  if [ -z "$cands" ]; then
    if [ "$SCHEDULED" = 1 ]; then note "DS1 not configured (no private host mapping), skipping this run"; exit 0; fi
    spx_hosts_need NAS1_LAN_HOSTS NAS1_VPN_HOST || true
    exit 1
  fi
  for h in $cands; do
    i=$((i + 1))
    eval "CAND_$i=\$h"
    ( probe_one "$i" "$h" ) 2>/dev/null &
  done
  total=$i
  j=1
  while [ "$j" -le "$total" ]; do
    waited=0
    while [ ! -e "$TMP/p$j.rc" ]; do
      sleep 0.2
      waited=$((waited + 1))
      # the watchdog needs about PROBE_LIMIT+2 seconds; this is only a backstop against a lost probe
      if [ "$waited" -gt $(((PROBE_LIMIT + 8) * 5)) ]; then echo 255 >"$TMP/p$j.rc"; : >"$TMP/p$j.err.killed"; fi
    done
    if [ "$(cat "$TMP/p$j.rc")" = 0 ]; then eval "found=\$CAND_$j"; break; fi
    j=$((j + 1))
  done
  if [ -n "$found" ]; then
    HOST=$found
    say "using DS1 at $HOST ($(host_label "$HOST"))"
    return 0
  fi
  if [ "$SCHEDULED" = 1 ]; then
    note "DS1 not reachable (no home network or VPN), skipping this run"
    exit 0
  fi
  {
    say "Could not reach DS1 (database $DB_NAME, port $PORT). Tried:"
    j=1
    while [ "$j" -le "$total" ]; do
      eval "h=\$CAND_$j"
      printf '  %-20s %s: %s\n' "$h" "$(host_label "$h")" "$(why_failed "$j")"
      j=$((j + 1))
    done
    say "Fix one of these:"
    say "  1. Turn the VPN (Tailscale) on (its menu should show the NAS connected), or"
    say "  2. Allow TCP $PORT from the home network in the NAS's firewall settings."
    say "Then run this again."
  } >&2
  exit 1
}

# ---- the export --------------------------------------------------------------------------------------------------

dbq() { # sql outfile errfile limit: run one query against the chosen host
  local sql=$1 out=$2 err=$3 limit=$4
  limited "$limit" "$out" "$err" \
    "$PSQL" -X -w -q -At -F '|' -v ON_ERROR_STOP=1 -h "$HOST" -p "$PORT" -U "$DB_USER" -d "$DB_NAME" -c "$sql"
}

read -r -d '' LIST_SQL <<'SQL'
select encode(convert_to(name, 'UTF8'), 'hex'),
       regexp_replace(encode(convert_to(name, 'UTF8'), 'hex'), '(..)', '\\x\1', 'g'),
       coalesce(sha256, '-'),
       coalesce(length(data), 0)
from legacy_files.raw_archive order by name
SQL

dbq_retry() { # like dbq, but tries up to three times: a flaky link should not cost a file
  local try=1 rc
  while :; do
    dbq "$@"; rc=$?
    if [ "$rc" = 0 ] || [ "$try" -ge 3 ]; then return "$rc"; fi
    try=$((try + 1)); sleep "${SPX_RETRY_PAUSE:-2}"
  done
}

safe_name() {
  local n=$1
  case "$n" in
    '' | . | /* | ./* | */./* | */. | */ | *//* | *..* | *\\*) return 1 ;;
  esac
  case "$n" in *[[:cntrl:]]*) return 1 ;; esac
  [ "${#n}" -le 900 ]
}

WRITTEN=0; SKIPPED=0; DIFFERS=0; BAD=0; UNSAFE=0; WOULD=0; BYTES=0; TOTAL_ROWS=0; TOTAL_BYTES=0; FAILS_IN_A_ROW=0

# Small files are fetched many to a query (one connection each is slow over Tailscale); big ones one by one.
SMALL_MAX=1048576
BATCH_FILES=40
BATCH_BYTES=3145728

mb() { printf '%s.%s' "$(($1 / 1048576))" "$((($1 * 10 / 1048576) % 10))"; }

# commit_part name want size dest: the bytes are in $dest.part; check them against the archive's sha256, then rename.
commit_part() {
  local name=$1 want=$2 size=$3 dest=$4 part have
  part="$dest.part"
  have=$(file_sha "$part") || have=""
  if [ "$have" != "$want" ]; then
    rm -f "$part"; CUR_PART=""; BAD=$((BAD + 1))
    say "BAD     $name: sha256 of the fetched data does not match the archive's; nothing written"
    return 1
  fi
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    rm -f "$part"; CUR_PART=""; BAD=$((BAD + 1)); say "BAD     $name: appeared while it was being fetched; left alone"; return 1
  fi
  if ! mv "$part" "$dest"; then
    rm -f "$part"; CUR_PART=""; BAD=$((BAD + 1)); say "BAD     $name: could not rename into place"; return 1
  fi
  CUR_PART=""
  WRITTEN=$((WRITTEN + 1)); BYTES=$((BYTES + size))
  say "wrote   $name ($size bytes)"
  return 0
}

# make_part name dest hexfile: decode a hex file into $dest.part (and its folder)
make_part() {
  local name=$1 dest=$2 hexfile=$3
  if ! mkdir -p "$(dirname "$dest")" 2>/dev/null; then
    BAD=$((BAD + 1)); say "BAD     $name: cannot create its folder"; return 1
  fi
  CUR_PART="$dest.part"
  rm -f "$CUR_PART"
  if ! hex2bin "$hexfile" >"$CUR_PART" 2>/dev/null; then
    rm -f "$CUR_PART"; CUR_PART=""; BAD=$((BAD + 1)); say "BAD     $name: could not write the file"; return 1
  fi
  return 0
}

why_query_failed() { # rc errfile
  if [ "$1" = 124 ]; then printf 'no answer in %ss' "$FETCH_LIMIT"; else head -n 1 "$2" | cut -c1-100; fi
}

lost_ds1() {
  FAILS_IN_A_ROW=$((FAILS_IN_A_ROW + 1))
  if [ "$FAILS_IN_A_ROW" -ge 3 ]; then
    say "Lost DS1 (3 fetches in a row failed). Run this again when it is reachable; it picks up where it stopped."
    summary
    exit 1
  fi
}

fetch_big() { # hexname escaped sha size: one file, one query
  local hex=$1 esc=$2 want=$3 size=$4 name dest rc
  printf -v name '%b' "$esc"
  dest="$DEST_ROOT/$name"
  dbq_retry "select encode(data, 'hex') from legacy_files.raw_archive where name = convert_from(decode('$hex', 'hex'), 'UTF8') and sha256 = '$want' limit 1" \
    "$TMP/data.hex" "$TMP/data.err" "$FETCH_LIMIT"
  rc=$?
  if [ "$rc" != 0 ]; then
    BAD=$((BAD + 1)); say "BAD     $name: fetch failed ($(why_query_failed "$rc" "$TMP/data.err"))"
    lost_ds1; return
  fi
  FAILS_IN_A_ROW=0
  make_part "$name" "$dest" "$TMP/data.hex" && commit_part "$name" "$want" "$size" "$dest"
}

# flush_batch: fetch every row listed in $TMP/batch.tsv (hexname|escaped|sha|size) with one query
flush_batch() {
  local hex esc want size hx esc2 sha2 data name dest rc conds="" n=0
  [ -s "$TMP/batch.tsv" ] || return 0
  while IFS='|' read -r hex esc want size <&6; do
    conds="$conds,(convert_from(decode('$hex', 'hex'), 'UTF8'), '$want')"
    n=$((n + 1))
  done 6<"$TMP/batch.tsv"
  dbq_retry "select encode(convert_to(name, 'UTF8'), 'hex'), regexp_replace(encode(convert_to(name, 'UTF8'), 'hex'), '(..)', '\\\\x\\1', 'g'), sha256, encode(data, 'hex') from legacy_files.raw_archive where (name, sha256) in (${conds#,})" \
    "$TMP/batch.out" "$TMP/batch.err" "$FETCH_LIMIT"
  rc=$?
  if [ "$rc" != 0 ]; then
    BAD=$((BAD + n))
    say "BAD     $n files not fetched ($(why_query_failed "$rc" "$TMP/batch.err")); first: $(printf '%b' "$(head -n 1 "$TMP/batch.tsv" | cut -d'|' -f2)")"
    : >"$TMP/batch.tsv"
    lost_ds1; return
  fi
  FAILS_IN_A_ROW=0
  : >"$TMP/seen.txt"
  while IFS='|' read -r hx esc2 sha2 data <&7; do
    [ -n "$hx$esc2$sha2" ] || continue
    printf '%s|%s\n' "$hx" "$sha2" >>"$TMP/seen.txt"
    printf -v name '%b' "$esc2"
    if ! safe_name "$name"; then BAD=$((BAD + 1)); say "BAD     unsafe name came back from the archive"; continue; fi
    dest="$DEST_ROOT/$name"
    printf '%s\n' "$data" >"$TMP/one.hex"
    make_part "$name" "$dest" "$TMP/one.hex" && commit_part "$name" "$sha2" "$((${#data} / 2))" "$dest"
  done 7<"$TMP/batch.out"
  while IFS='|' read -r hex esc want size <&6; do
    if ! grep -qxF "$hex|$want" "$TMP/seen.txt"; then
      printf -v name '%b' "$esc"
      BAD=$((BAD + 1)); say "BAD     $name: the archive did not return it"
    fi
  done 6<"$TMP/batch.tsv"
  : >"$TMP/batch.tsv"
}

# drain_queue: fetch everything process_row queued ($TMP/queue.tsv), small files in batches
drain_queue() {
  local hex esc want size n=0 sum=0
  : >"$TMP/batch.tsv"
  while IFS='|' read -r hex esc want size <&5; do
    if [ "$size" -gt "$SMALL_MAX" ]; then fetch_big "$hex" "$esc" "$want" "$size"; continue; fi
    if [ "$n" -ge "$BATCH_FILES" ] || [ $((sum + size)) -gt "$BATCH_BYTES" ]; then flush_batch; n=0; sum=0; fi
    printf '%s|%s|%s|%s\n' "$hex" "$esc" "$want" "$size" >>"$TMP/batch.tsv"
    n=$((n + 1)); sum=$((sum + size))
  done 5<"$TMP/queue.tsv"
  flush_batch
}

process_row() { # hexname escaped sha size: decide skip / differs / unsafe / queue
  local hex=$1 esc=$2 want=$3 size=$4 name dest have
  printf -v name '%b' "$esc"
  TOTAL_ROWS=$((TOTAL_ROWS + 1))
  case "$size" in '' | *[!0-9]*) size=0 ;; esac
  TOTAL_BYTES=$((TOTAL_BYTES + size))
  if ! safe_name "$name"; then
    UNSAFE=$((UNSAFE + 1)); printf 'UNSAFE  skipped, name not safe as a path: %q\n' "$name"; return
  fi
  case "$want" in *[!0-9a-f]*) want="" ;; esac
  if [ "${#want}" != 64 ]; then
    BAD=$((BAD + 1)); say "BAD     $name: archive row has no valid sha256"; return
  fi
  dest="$DEST_ROOT/$name"
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    if [ -d "$dest" ]; then BAD=$((BAD + 1)); say "BAD     $name: a folder is in the way"; return; fi
    have=$(file_sha "$dest") || have=""
    if [ -z "$have" ]; then BAD=$((BAD + 1)); say "BAD     $name: exists but cannot be read"; return; fi
    if [ "$have" = "$want" ]; then SKIPPED=$((SKIPPED + 1)); return; fi
    DIFFERS=$((DIFFERS + 1))
    say "DIFFERS $name: Dropbox has sha256 ${have%"${have#????????}"}..., archive has ${want%"${want#????????}"}...; left alone"
    return
  fi
  if [ "$MODE" = check ]; then
    WOULD=$((WOULD + 1)); BYTES=$((BYTES + size))
    if [ "$WOULD" -le 5 ]; then say "  would write $name ($size bytes)"; fi
    return
  fi
  printf '%s|%s|%s|%s\n' "$hex" "$esc" "$want" "$size" >>"$TMP/queue.tsv"
}

summary() {
  if [ "$MODE" = check ]; then
    say "check: $TOTAL_ROWS files in the archive ($(mb "$TOTAL_BYTES") MB); would write $WOULD ($(mb "$BYTES") MB), already there $SKIPPED, differs $DIFFERS, unsafe $UNSAFE, bad $BAD"
    say "destination: $DEST_ROOT"
  else
    note "done: written $WRITTEN, skipped $SKIPPED, differs $DIFFERS, bad $BAD, unsafe $UNSAFE; wrote $(mb "$BYTES") MB of $(mb "$TOTAL_BYTES") MB in $TOTAL_ROWS files, ${SECONDS}s"
  fi
}

# report_status: tell DS1 how this run went (one row in ingest.raw_export_run, migration 105) so the status snapshot on /admin/ops can say
# when the last export ran and how it went. Best effort: a missing table or a lost connection is one line in the log, never a failed export.
# Keeps the newest 200 rows. A run that could not reach DS1 at all (or --check) reports nothing: no row is "never ran" on the page.
report_status() {
  local outcome=ok failed host sql
  [ "$MODE" = export ] || return 0
  [ -n "$HOST" ] || return 0
  failed=$((BAD + DIFFERS + UNSAFE))
  if [ "$failed" -gt 0 ]; then outcome=problems; fi
  host=$(hostname -s 2>/dev/null | tr -cd 'A-Za-z0-9._-' | cut -c1-40)
  sql="insert into ingest.raw_export_run (host, outcome, checked, copied, present, failed, bytes, seconds) values ('${host:-unknown}', '$outcome', $TOTAL_ROWS, $WRITTEN, $SKIPPED, $failed, $BYTES, $SECONDS); delete from ingest.raw_export_run where id <= (select max(id) - 200 from ingest.raw_export_run);"
  if ! dbq "$sql" "$TMP/status.out" "$TMP/status.err" 30; then
    note "could not report this run to DS1 (is migration 105, ingest.raw_export_run, applied?): $(head -n 1 "$TMP/status.err" | cut -c1-100)"
  fi
}

do_export() {
  local hex esc sha size
  if [ "$MODE" != check ]; then mkdir -p "$DEST_ROOT" || die "Cannot create $DEST_ROOT"; fi
  if ! dbq_retry "$LIST_SQL" "$TMP/list.tsv" "$TMP/list.err" 120; then
    die "Could not list the archive on $HOST: $(head -n 1 "$TMP/list.err" | cut -c1-120)"
  fi
  : >"$TMP/queue.tsv"
  while IFS='|' read -r hex esc sha size <&3; do
    [ -n "$esc$sha$size" ] || continue
    process_row "$hex" "$esc" "$sha" "$size"
  done 3<"$TMP/list.tsv"
  if [ "$MODE" != check ]; then drain_queue; fi
  summary
  report_status
  if [ $((DIFFERS + BAD + UNSAFE)) -gt 0 ]; then exit 2; fi
  exit 0
}

# ---- the schedule ------------------------------------------------------------------------------------------------

xml_escape() { local s=$1; s=${s//&/&amp;}; s=${s//</&lt;}; s=${s//>/&gt;}; printf '%s' "$s"; }

install_schedule() {
  local me uid
  me="$(cd "$(dirname "$0")" 2>/dev/null && pwd)/$(basename "$0")"
  [ -f "$me" ] || die "Save the script to a file first (for example ~/bin/spx-raw-export.sh), then run --install-schedule from there."
  mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs" || die "Cannot create the LaunchAgents folder."
  cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$(xml_escape "$me")</string>
    <string>--scheduled</string>
  </array>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$(xml_escape "$LOGFILE")</string>
  <key>StandardErrorPath</key><string>$(xml_escape "$LOGFILE")</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
EOF
  uid=$(id -u)
  launchctl bootout "gui/$uid/$LABEL" >/dev/null 2>&1 || true
  if ! launchctl bootstrap "gui/$uid" "$PLIST" 2>/dev/null; then
    launchctl load -w "$PLIST" || die "Wrote $PLIST but launchctl would not load it."
  fi
  say "Schedule installed: $me runs now and then every hour."
  say "  agent: $PLIST"
  say "  log:   $LOGFILE   (a run with DS1 out of reach skips and logs one line)"
  say "  undo:  $me --remove-schedule"
}

remove_schedule() {
  local uid
  uid=$(id -u)
  launchctl bootout "gui/$uid/$LABEL" >/dev/null 2>&1 || launchctl unload "$PLIST" >/dev/null 2>&1 || true
  if [ -e "$PLIST" ]; then rm -f "$PLIST"; say "Schedule removed ($PLIST deleted, agent unloaded)."
  else say "No schedule was installed ($PLIST does not exist)."; fi
}

# ---- main --------------------------------------------------------------------------------------------------------

while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE=check ;;
    --install-schedule) MODE=install ;;
    --remove-schedule) MODE=remove ;;
    --scheduled) SCHEDULED=1 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; exit 64 ;;
  esac
  shift
done

case "$MODE" in
  install) install_schedule; exit 0 ;;
  remove) remove_schedule; exit 0 ;;
esac

TMP=$(mktemp -d "${TMPDIR:-/tmp}/spx-raw-export.XXXXXX") || die "Cannot make a temporary folder."

if [ "$MODE" = export ]; then
  LOCKDIR="${TMPDIR:-/tmp}/spx-raw-export.lock"
  if ! mkdir "$LOCKDIR" 2>/dev/null; then
    other=$(cat "$LOCKDIR/pid" 2>/dev/null || true)
    if [ -n "$other" ] && kill -0 "$other" 2>/dev/null; then
      LOCKDIR=""
      if [ "$SCHEDULED" = 1 ]; then note "previous export still running, skipping"; exit 0; fi
      die "Another export is already running (pid $other)."
    fi
    rm -rf "$LOCKDIR"
    mkdir "$LOCKDIR" 2>/dev/null || { LOCKDIR=""; die "Cannot take the lock."; }
  fi
  echo $$ >"$LOCKDIR/pid"
fi

find_psql
find_dropbox
pick_sha
get_password
detect_ds1
do_export

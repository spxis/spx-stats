#!/bin/bash
# One nightly backup of DS1: pg_dump -Fc of spx_stats over the network, verified, size-checked, then old dumps pruned.
# This is the ONE piece of code for every place that takes the backup: the Docker job on nas2 (backup/), and the small launchd
# fallback on machine1 (scripts/backup/mac-backup.sh). Details and install steps: backup/README.md.
#
#   ds1-backup.sh            take, verify, rename, prune, log
#   ds1-backup.sh --check    connect, show what a run would do, change nothing (no dump, no prune, no run-log entry)
#
# Connection (environment, names only): PGHOST PGPORT (55440) PGUSER PGDATABASE (spx_stats) PGPASSWORD. The login should be the
# read-only role spx_backup (db/ds1/002_backup_role.sql); the run also forces default_transaction_read_only=on for its session.
# Settings (all optional):
#   BACKUP_DIR            the folder that holds daily/ and weekly/ (default ~/Projects/backups/spx-stats; the Docker job mounts /backups)
#   BACKUP_KEEP_DAILY     newest dumps kept in daily/ (default 14)
#   BACKUP_KEEP_WEEKLY    newest dumps kept in weekly/ (default 8); a dump made on a Sunday is also put in weekly/
#   BACKUP_MIN_PERCENT    a new dump smaller than this percent of the previous one is NOT accepted (default 80)
#   BACKUP_ACCEPT_SMALLER=1   accept one small dump on purpose (the database really did shrink)
#   BACKUP_TIMEOUT        seconds before pg_dump is stopped (default 10800)
#   BACKUP_DATE           the date used in the name (default today in TZ); a test sets it
#   BACKUP_MIN_FREE_MB    free space needed to start when there is no previous dump (default 4096)
#   RUNLOG=0              no run-log entry (a test sets it); the Turso names are in scripts/runlog/README.md
#
# What it promises, in this order:
#   1. writes to a hidden .partial name; the real name appears only by rename after `pg_restore --list` read the whole archive
#   2. a dump much smaller than the previous one is parked as <name>.suspect and nothing is pruned
#   3. old dumps are pruned only after a good new one is in place, and only files named YYYY-MM-DD-ds1-nightly.dump inside daily/
#      and weekly/ (plus this script's own .partial and .suspect files). Nothing else in the folder is ever touched.
#   4. a run-log entry (job ds1-backup) on every run; failure raises the alert backup:ds1, the next success resolves it. If Turso
#      cannot be reached the entry is spooled and the backup is unaffected.
# Exit codes: 0 ok, 1 settings, 2 dump failed, 3 too small (parked), 4 archive failed the read-back, 5 no room, 75 another run is active.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
export PATH="$PATH:/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin:/usr/local/bin"

BACKUP_DIR="${BACKUP_DIR:-$HOME/Projects/backups/spx-stats}"
: "${BACKUP_DIR:?}"
KEEP_DAILY="${BACKUP_KEEP_DAILY:-14}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-8}"
MIN_PERCENT="${BACKUP_MIN_PERCENT:-80}"
DUMP_TIMEOUT="${BACKUP_TIMEOUT:-10800}"
MIN_FREE_MB="${BACKUP_MIN_FREE_MB:-4096}"
DATE="${BACKUP_DATE:-$(date +%F)}"
NAME="$DATE-ds1-nightly.dump"
PATTERN='^[0-9]{4}-[0-9]{2}-[0-9]{2}-ds1-nightly\.dump$'
DAILY="$BACKUP_DIR/daily"
WEEKLY="$BACKUP_DIR/weekly"
JOB="ds1-backup"
ALERT="backup:ds1"
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

log() { echo "$(date '+%Y-%m-%d %H:%M:%S %Z') backup: $*"; }
to() { local s="$1"; shift; if command -v timeout >/dev/null 2>&1; then timeout "$s" "$@"; elif command -v gtimeout >/dev/null 2>&1; then gtimeout "$s" "$@"; else "$@"; fi; }
size_of() { wc -c < "$1" | tr -d ' '; }
mb() { awk -v b="$1" 'BEGIN { printf "%.1f", b / 1048576 }'; }

# one run-log entry; never fails, never waits long. $1 outcome, $2 summary, $3 counts json
notify() {
  [ "$CHECK" = 1 ] && return 0
  [ "${RUNLOG:-1}" = 0 ] && return 0
  local py="$REPO/scripts/runlog/runlog.py"
  [ -f "$py" ] && command -v python3 >/dev/null 2>&1 || return 0
  if [ -n "${BACKUP_ACTOR:-}" ]; then
    to 90 python3 -I "$py" event --job "$JOB" --kind ops --outcome "$1" --summary "$2" --counts-json "$3" --alert-key "$ALERT" --actor "$BACKUP_ACTOR" >/dev/null 2>&1 || true
  else
    to 90 python3 -I "$py" event --job "$JOB" --kind ops --outcome "$1" --summary "$2" --counts-json "$3" --alert-key "$ALERT" >/dev/null 2>&1 || true
  fi
  return 0
}
# a note for whoever looks at the folder (backup-status.sh reads it)
last_run() { # outcome file bytes seconds
  { echo "finished_epoch=$(date +%s)"; echo "finished=$(date '+%Y-%m-%d %H:%M:%S %Z')"; echo "outcome=$1"; echo "file=$2"; echo "bytes=$3"; echo "seconds=$4"; } > "$BACKUP_DIR/last-run.txt.new" 2>/dev/null \
    && mv "$BACKUP_DIR/last-run.txt.new" "$BACKUP_DIR/last-run.txt" 2>/dev/null
  return 0
}
die() { # code summary counts
  log "$2"
  last_run "failed" "$NAME" "0" "$SECONDS"
  notify failed "$2" "${3:-{\}}"
  exit "$1"
}

for v in PGHOST PGUSER PGPASSWORD; do
  [ -n "${!v:-}" ] || { echo "backup: $v is not set (see backup/README.md)" >&2; exit 1; }
done
export PGPORT="${PGPORT:-55440}" PGDATABASE="${PGDATABASE:-spx_stats}" PGCONNECT_TIMEOUT=15
export PGOPTIONS="-c default_transaction_read_only=on ${PGOPTIONS:-}"
for c in pg_dump pg_restore psql; do command -v "$c" >/dev/null 2>&1 || { echo "backup: $c not found (PostgreSQL client 17 or newer)" >&2; exit 1; }; done
mkdir -p "$DAILY" "$WEEKLY" || { echo "backup: cannot create folders under $BACKUP_DIR" >&2; exit 1; }

list_dumps() { ls -1 "$1" 2>/dev/null | grep -E "$PATTERN" | sort -r; }
free_mb() { df -Pk "$BACKUP_DIR" | awk 'NR == 2 { printf "%d", $4 / 1024 }'; }
# day of week for a date, 0 = Sunday (pure arithmetic: BSD and GNU date differ)
dow() { awk -v d="$1" 'BEGIN { split(d, p, "-"); y = p[1] + 0; m = p[2] + 0; n = p[3] + 0; split("0 3 2 5 0 3 5 1 4 6 2 4", t, " "); if (m < 3) y--; print (y + int(y/4) - int(y/100) + int(y/400) + t[m] + n) % 7 }'; }
# prune_dir <dir> <keep>: remove all but the newest <keep> dumps; prints how many were removed
prune_dir() {
  local dir="${1:?}" keep="$2" f n=0 gone=0
  for f in $(list_dumps "$dir"); do
    n=$((n + 1))
    if [ "$n" -gt "$keep" ]; then rm -f "${dir:?}/$f" && gone=$((gone + 1)); fi
  done
  echo "$gone"
}

prev="$(list_dumps "$DAILY" | grep -v "^$NAME\$" | head -n 1)"
prev_bytes=0
[ -n "$prev" ] && prev_bytes="$(size_of "$DAILY/$prev")"

if [ "$CHECK" = 1 ]; then
  log "check only: nothing is written"
  ver="$(psql -X -At -c 'show server_version' 2>&1)" || { log "FAIL: cannot connect: $(echo "$ver" | tail -n 1)"; exit 2; }
  log "connected as $PGUSER to $PGDATABASE, server $ver; pg_dump $(pg_dump --version | awk '{print $3}')"
  log "database size: $(psql -X -At -c "select pg_size_pretty(pg_database_size(current_database()))")"
  log "session read-only: $(psql -X -At -c 'show default_transaction_read_only')"
  if psql -X -q -c "create table public.zz_backup_must_not_exist (i int)" >/dev/null 2>&1; then
    psql -X -q -c "drop table public.zz_backup_must_not_exist" >/dev/null 2>&1
    log "FAIL: this session could write; the login must be read-only"; exit 2
  fi
  log "write attempt refused, as it must be"
  if [ "$(psql -X -At -c "select (rolsuper or rolcreatedb or rolcreaterole)::text from pg_roles where rolname = current_user")" = "true" ]; then
    log "note: this login is a powerful role, not spx_backup (db/ds1/002_backup_role.sql); fine as a stopgap"
  fi
  log "free space under $BACKUP_DIR: $(free_mb) MB; previous dump: ${prev:-none} ($(mb "$prev_bytes") MB); daily: $(list_dumps "$DAILY" | wc -l | tr -d ' '), weekly: $(list_dumps "$WEEKLY" | wc -l | tr -d ' ')"
  exit 0
fi

# one run at a time: a directory is the lock; a lock whose process is gone is taken over
LOCK="$BACKUP_DIR/.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  opid="$(cat "$LOCK/pid" 2>/dev/null || true)"
  if [ -n "$opid" ] && kill -0 "$opid" 2>/dev/null; then
    log "another backup is running (pid $opid); skipping"
    notify skipped "another backup was running" '{}'
    exit 75
  fi
  rm -rf "${LOCK:?}"; mkdir "$LOCK" || exit 75
fi
echo $$ > "$LOCK/pid"
PART="$DAILY/.$NAME.partial"
WPART="$WEEKLY/.$NAME.partial"
trap 'rm -rf "${LOCK:?}"; rm -f "$PART" "$WPART"' EXIT
# only a dead run leaves a partial file: we hold the lock
rm -f "${DAILY:?}"/.*.partial "${WEEKLY:?}"/.*.partial 2>/dev/null

# room: the new dump lands beside the old ones before anything is pruned
need_mb=$MIN_FREE_MB
[ "$prev_bytes" -gt 0 ] && need_mb=$(( prev_bytes / 1048576 * 11 / 10 + 1 ))
have_mb="$(free_mb)"
if [ "${have_mb:-0}" -lt "$need_mb" ]; then
  die 5 "not enough room under $BACKUP_DIR: ${have_mb:-0} MB free, $need_mb MB needed; nothing deleted" "{\"free_mb\":${have_mb:-0},\"need_mb\":$need_mb}"
fi

log "dumping $PGDATABASE from $PGHOST:$PGPORT as $PGUSER to daily/$NAME (previous: ${prev:-none})"
SECONDS=0
err="$BACKUP_DIR/last-error.txt"
if ! to "$DUMP_TIMEOUT" pg_dump -Fc --lock-wait-timeout=120s -f "$PART" 2> "$err"; then
  msg="$(grep -v '^$' "$err" | tail -n 2 | tr '\n' ' ' | cut -c1-300)"
  die 2 "pg_dump failed: ${msg:-no message (timeout or stopped)}; old dumps kept" '{}'
fi
dump_secs=$SECONDS
bytes="$(size_of "$PART")"

# read the whole table of contents back: a truncated or damaged archive fails here
toc_file="$BACKUP_DIR/.toc.txt"
if ! to 600 pg_restore --list "$PART" > "$toc_file" 2> "$err"; then
  rm -f "$toc_file"
  die 4 "pg_restore --list could not read the new dump ($(tail -n 1 "$err" | cut -c1-200)); old dumps kept" "{\"bytes\":$bytes}"
fi
toc="$(grep -c '^[0-9]' "$toc_file")"
tabledata="$(grep -c ' TABLE DATA ' "$toc_file")"
rm -f "$toc_file"
if [ "$bytes" -le 0 ] || [ "$toc" -lt 1 ] || [ "$tabledata" -lt 1 ]; then
  die 4 "the new dump has no tables (entries $toc, table data $tabledata, $bytes bytes); old dumps kept" "{\"bytes\":$bytes}"
fi

# size guard against the previous dump
if [ "$prev_bytes" -gt 0 ] && [ $(( bytes * 100 )) -lt $(( prev_bytes * MIN_PERCENT )) ] && [ "${BACKUP_ACCEPT_SMALLER:-0}" != 1 ]; then
  rm -f "${BACKUP_DIR:?}"/*.suspect
  mv "$PART" "$BACKUP_DIR/$NAME.suspect"
  die 3 "the new dump is $(mb "$bytes") MB, under $MIN_PERCENT percent of the previous $(mb "$prev_bytes") MB ($prev); parked as $NAME.suspect, nothing pruned. If the database really shrank, rerun with BACKUP_ACCEPT_SMALLER=1" "{\"bytes\":$bytes,\"previous_bytes\":$prev_bytes}"
fi

mv "$PART" "$DAILY/$NAME" || die 2 "could not rename the verified dump into place" '{}'
rm -f "${BACKUP_DIR:?}"/*.suspect

# Sunday: the same dump also goes to weekly/ (a hard link when the folders share a disk, else a copy), by temporary name then rename
weekly_new=0
if [ "$(dow "$DATE")" = 0 ] || [ "${BACKUP_FORCE_WEEKLY:-0}" = 1 ]; then
  if { ln "$DAILY/$NAME" "$WPART" 2>/dev/null || cp "$DAILY/$NAME" "$WPART"; } && mv "$WPART" "$WEEKLY/$NAME"; then
    weekly_new=1
  else
    log "warning: could not put the dump in weekly/"
  fi
fi

# prune: only now that a good dump is in place
removed_d="$(prune_dir "$DAILY" "$KEEP_DAILY")"
removed_w="$(prune_dir "$WEEKLY" "$KEEP_WEEKLY")"
kept_d="$(list_dumps "$DAILY" | wc -l | tr -d ' ')"
kept_w="$(list_dumps "$WEEKLY" | wc -l | tr -d ' ')"
total_mb="$(du -sk "$BACKUP_DIR" 2>/dev/null | awk '{printf "%d", $1/1024}')"
summary="$NAME $(mb "$bytes") MB in ${dump_secs}s, archive $toc entries ($tabledata tables); daily $kept_d (removed $removed_d), weekly $kept_w (removed $removed_w$([ "$weekly_new" = 1 ] && echo ", added today")); folder ${total_mb:-?} MB"
log "$summary"
last_run ok "$NAME" "$bytes" "$dump_secs"
notify ok "$summary" "{\"bytes\":$bytes,\"seconds\":$dump_secs,\"toc_entries\":$toc,\"table_data\":$tabledata,\"daily\":$kept_d,\"weekly\":$kept_w,\"removed\":$((removed_d + removed_w))}"
exit 0

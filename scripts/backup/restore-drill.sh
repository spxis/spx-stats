#!/bin/bash
# Restore drill: restore one backup dump into a SCRATCH database and compare the row count of every table with the source (DS1).
# A backup nobody has restored is a hope. Run it once after the first dump, then now and then (docs: backup/README.md, "Restore drill").
#
#   bash scripts/backup/restore-drill.sh <dump file> [--strict] [--tolerance-pct N] [--keep] [--no-source]
#
# Target (a scratch Postgres of your own, 17 or newer, never DS1): DRILL_PGHOST DRILL_PGPORT DRILL_PGUSER DRILL_PGPASSWORD.
#   It creates a database named drill_<stamp>, restores into it (no owners, no grants) and drops it at the end unless --keep.
# Source (read-only is enough): PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD, the same names the backup uses. The script refuses to run
#   when target and source are the same server. --no-source prints the restored counts only.
# Counts are exact count(*) per table and materialised view, on both sides. DS1 keeps changing after the dump, so by default a table may
# differ by up to --tolerance-pct (default 1) percent or 10 rows, whichever is larger; --strict allows no difference (use it on a
# source that is not being written to, or on a test database). A table the source has and the restore lacks, a failed restore, or a table
# outside the tolerance is a FAIL. Exit 0 = pass, 1 = fail, 2 = usage.
set -u
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin:/usr/local/bin:$PATH"
dump=""; strict=0; tol=1; keep=0; nosrc=0
while [ $# -gt 0 ]; do
  case "$1" in
    --strict) strict=1 ;;
    --tolerance-pct) tol="${2:-1}"; shift ;;
    --keep) keep=1 ;;
    --no-source) nosrc=1 ;;
    -*) echo "unknown option: $1" >&2; exit 2 ;;
    *) dump="$1" ;;
  esac
  shift
done
[ -f "$dump" ] || { echo "usage: restore-drill.sh <dump file> [--strict] [--tolerance-pct N] [--keep] [--no-source]" >&2; exit 2; }
for v in DRILL_PGHOST DRILL_PGUSER DRILL_PGPASSWORD; do [ -n "${!v:-}" ] || { echo "restore-drill: $v is not set (a scratch Postgres of your own)" >&2; exit 2; }; done
DRILL_PGPORT="${DRILL_PGPORT:-5432}"
if [ "$nosrc" = 0 ]; then
  for v in PGHOST PGUSER PGPASSWORD; do [ -n "${!v:-}" ] || { echo "restore-drill: $v is not set (the source), or use --no-source" >&2; exit 2; }; done
  SRC_PORT="${PGPORT:-55440}"; SRC_DB="${PGDATABASE:-spx_stats}"
  if [ "$PGHOST" = "$DRILL_PGHOST" ] && [ "$SRC_PORT" = "$DRILL_PGPORT" ]; then echo "restore-drill: the scratch server is the source; refusing" >&2; exit 2; fi
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/spx-drill.XXXXXX")"
DB="drill_$(date +%Y%m%d%H%M%S)_$$"
tgt() { PGPASSWORD="$DRILL_PGPASSWORD" PGCONNECT_TIMEOUT=10 psql -X -q -At -h "$DRILL_PGHOST" -p "$DRILL_PGPORT" -U "$DRILL_PGUSER" "$@"; }
src() { PGPASSWORD="$PGPASSWORD" PGCONNECT_TIMEOUT=15 PGOPTIONS="-c default_transaction_read_only=on" psql -X -q -At -h "$PGHOST" -p "$SRC_PORT" -U "$PGUSER" -d "$SRC_DB" "$@"; }
cleanup() {
  if [ "$keep" = 0 ]; then tgt -d postgres -c "drop database if exists \"$DB\" with (force)" >/dev/null 2>&1; else echo "kept scratch database $DB"; fi
  rm -rf "${WORK:?}"
}
trap cleanup EXIT

COUNTS="select format('%I.%I', n.nspname, c.relname) || E'\t' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'm') and n.nspname not in ('pg_catalog', 'information_schema') and n.nspname !~ '^pg_toast' and n.nspname !~ '^pg_temp'
  order by 1"

echo "restore-drill: dump $(basename "$dump"), $(wc -c < "$dump" | awk '{printf "%.1f", $1/1048576}') MB"
tgt -d postgres -c "create database \"$DB\"" || { echo "FAIL: cannot create the scratch database" >&2; exit 1; }
start=$(date +%s)
PGPASSWORD="$DRILL_PGPASSWORD" pg_restore -h "$DRILL_PGHOST" -p "$DRILL_PGPORT" -U "$DRILL_PGUSER" -d "$DB" --no-owner --no-privileges -j 2 "$dump" 2> "$WORK/restore.err" < /dev/null
if [ $? -ne 0 ]; then
  echo "FAIL: pg_restore reported errors (first lines):"; grep -m 5 -v '^$' "$WORK/restore.err" | cut -c1-200
  exit 1
fi
echo "restored in $(( $(date +%s) - start )) s"
tgt -d "$DB" -F $'\t' -c "$COUNTS" > "$WORK/restored.tsv" || { echo "FAIL: could not count the restored tables" >&2; exit 1; }
n_restored=$(wc -l < "$WORK/restored.tsv" | tr -d ' ')
[ "$n_restored" -gt 0 ] || { echo "FAIL: the restore holds no tables" >&2; exit 1; }
if [ "$nosrc" = 1 ]; then
  awk -F'\t' '{ s += $2 } END { printf "restored %d tables, %d rows (no source to compare)\n", NR, s }' "$WORK/restored.tsv"
  echo "PASS (restore only)"; exit 0
fi
src -c "$COUNTS" > "$WORK/source.tsv" || { echo "FAIL: could not count the source tables" >&2; exit 1; }

awk -F'\t' -v strict="$strict" -v tol="$tol" '
  FNR == NR { r[$1] = $2; next }
  { seen[$1] = 1; s = $2; sumS += s; ns++
    if (!($1 in r)) { printf "FAIL  %-48s missing from the restore (source %d)\n", $1, s; bad++; next }
    d = r[$1] - s; sumR += r[$1]
    if (d == 0) { eq++; next }
    allow = strict ? 0 : (s * tol / 100 > 10 ? s * tol / 100 : 10); ad = d < 0 ? -d : d
    if (ad <= allow) { within++; printf "drift %-48s restored %d, source %d (%+d since the dump)\n", $1, r[$1], s, -d }
    else { bad++; printf "FAIL  %-48s restored %d, source %d (%+d)\n", $1, r[$1], s, d }
  }
  END { for (t in r) if (!(t in seen)) printf "note  %-48s only in the restore (%d rows)\n", t, r[t]
    printf "compared %d tables: %d equal, %d within tolerance, %d failing; source rows %d, restored rows %d\n", ns, eq, within, bad + 0, sumS, sumR
    exit (bad > 0 ? 1 : 0) }' "$WORK/restored.tsv" "$WORK/source.tsv"
rc=$?
if [ "$rc" = 0 ]; then echo "PASS"; else echo "FAIL"; fi
exit "$rc"

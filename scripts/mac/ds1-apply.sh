#!/bin/bash
# Apply ONE SQL file (a db/migrations file or a db/build step) to DS1 in a single transaction, stopping at the first error.
# Usage: bash scripts/mac/ds1-apply.sh <file.sql> [--dry-run] [--force]
#   --dry-run  runs everything inside the transaction, shows the counts, then rolls back
#   --force    allows a file outside db/ and the scratchpad
# Host: $SPX_DS1_HOST, else found like spx-check.sh does (addresses: the private host mapping, scripts/mac/lib/hosts.sh). Port $SPX_DS1_PORT (NAS1_DB_PORT, 55440), user $SPX_DS1_USER (postgres),
# database $SPX_DS1_DB (spx_stats). Password: $PGPASSWORD if set, else keychain item 'spx-stats-db DS1 55440'.
# Prints the file, then row counts before and after for the tables the file mentions. The coordinating session runs it.
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin:/usr/local/bin:$PATH"

file="" dry=0 force=0
for a in "$@"; do
  case "$a" in
    --dry-run) dry=1 ;;
    --force) force=1 ;;
    -*) echo "unknown option: $a" >&2; exit 2 ;;
    *) if [ -n "$file" ]; then echo "one file only" >&2; exit 2; fi; file="$a" ;;
  esac
done
[ -n "$file" ] && [ -f "$file" ] || { echo "usage: ds1-apply.sh <file.sql> [--dry-run] [--force]" >&2; exit 2; }
file="$(cd "$(dirname "$file")" && pwd -P)/$(basename "$file")"

case "$file" in
  "$REPO"/db/*|*/scratchpad/*) ;;
  *) if [ "$force" = 0 ]; then echo "refused: $file is outside db/ and the scratchpad (use --force)" >&2; exit 2; fi ;;
esac
if grep -qiE '^[[:space:]]*rollback[[:space:]]*;' "$file"; then
  echo "refused: the file contains a rollback; it must not manage its own transaction" >&2; exit 2
fi

# shellcheck source=spx-checks.sh
. "$HERE/spx-checks.sh"
if [ -z "${SPX_DS1_HOST:-}" ]; then
  SPX_DS1_HOST="$(ds1_host)" || { echo "DS1 not reachable: $(ds1_missing)" >&2; exit 1; }
fi
if [ -z "${PGPASSWORD:-}" ]; then
  PGPASSWORD="$(security find-generic-password -s 'spx-stats-db DS1 55440' -w 2>/dev/null || true)"
  [ -n "$PGPASSWORD" ] || { echo "no DS1 password: keychain item 'spx-stats-db DS1 55440' is missing (zsh scripts/mac/spx-credentials.sh setup)" >&2; exit 1; }
fi
export PGPASSWORD PGHOST="$SPX_DS1_HOST" PGPORT="$SPX_DS1_PORT" PGUSER="${SPX_DS1_USER:-postgres}" \
  PGDATABASE="${SPX_DS1_DB:-spx_stats}" PGCONNECT_TIMEOUT=10

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# the transaction is ours: a begin/commit inside the file would end it early
sed -E '/^[[:space:]]*(begin|commit)[[:space:]]*;[[:space:]]*$/Id' "$file" > "$work/body.sql"
stripped=$(( $(wc -l < "$file") - $(wc -l < "$work/body.sql") ))

names=$(grep -oiE '\b(core|meta|ref|api|legacy_[a-z0-9_]+)\.[a-z_][a-z0-9_]*' "$file" | tr '[:upper:]' '[:lower:]' | sort -u | head -30 | sed "s/.*/'&'/" | paste -sd, -)
[ -n "$names" ] || names="'none.none'"

counts="select n, (xpath('/row/c/text()', query_to_xml('select count(*) as c from ' || n, false, true, '')))[1]::text::bigint as c
  from unnest(array[$names]) n
  where to_regclass(n) is not null and (select relkind from pg_class where oid = to_regclass(n)) in ('r', 'p', 'm')"
{
  echo '\set ON_ERROR_STOP on'
  echo 'begin;'
  echo "create temp table _before as $counts;"
  echo '\i '"$work/body.sql"
  echo "create temp table _after as $counts;"
  echo "select coalesce(a.n, b.n) as \"table\", coalesce(b.c::text, '(new)') as before, a.c as after, a.c - b.c as change from _after a full join _before b on a.n = b.n order by 1;"
  if [ "$dry" = 1 ]; then echo 'rollback;'; else echo 'commit;'; fi
} > "$work/run.sql"

echo "file:   $file"
echo "target: $PGDATABASE on DS1 ($PGHOST:$PGPORT), one transaction$([ "$dry" = 1 ] && echo ', DRY RUN')"
[ "$stripped" -gt 0 ] && echo "note:   removed $stripped begin/commit line(s) so the file runs inside one transaction"
cd "$REPO"
psql -X -q -v ON_ERROR_STOP=1 -f "$work/run.sql"
if [ "$dry" = 1 ]; then echo "DRY RUN: rolled back, nothing changed"; else echo "COMMITTED"; fi

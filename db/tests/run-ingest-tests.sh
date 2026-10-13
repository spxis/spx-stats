#!/bin/bash
# Run db/tests/ingest_report_results.sql on DS1 inside ONE transaction that ends in ROLLBACK (nothing stays): it applies
# migrations 044 and 046 first, so it works before and after they are installed.
# Usage: bash db/tests/run-ingest-tests.sh            exit 0 when every check passed
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
strip() { sed -E '/^[[:space:]]*(begin|commit)[[:space:]]*;[[:space:]]*$/Id' "$1"; }
{
  echo '\set ON_ERROR_STOP on'
  echo 'begin;'
  echo 'set client_min_messages = warning;'
  strip "$REPO/db/migrations/044_ingest_report_results.sql"
  strip "$REPO/db/migrations/046_ingest_writer_role.sql"
  cat "$HERE/ingest_report_results.sql"
  echo 'rollback;'
} > "$work/run.sql"
if ! out="$("$REPO/scripts/daily/ds1.sh" -X -q -P pager=off -f "$work/run.sql" 2>&1)"; then
  echo "$out"
  echo "RESULT: ERROR (script stopped)"
  exit 2
fi
echo "$out"
echo "$out" | grep -q '^RESULT: ALL [0-9]* CHECKS PASSED'

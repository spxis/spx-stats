#!/bin/bash
# Prove that the daily results survive a rebuild of core (db/tests/ingest_rebuild_proof.sql), on the real data of DS1.
# One transaction that ends in ROLLBACK: nothing stays. Usage: bash db/tests/run-rebuild-proof.sh   (exit 0 when identical)
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
strip() { sed -E '/^[[:space:]]*(begin|commit)[[:space:]]*;[[:space:]]*$/Id' "$1"; }
strip "$REPO/db/build/152_games_from_wikipedia_daily.sql" > "$work/152.sql"
strip "$REPO/db/build/153_replay_daily_observations.sql" > "$work/153.sql"
{ echo 'begin;'; cat "$HERE/ingest_rebuild_proof.sql"; } > "$work/proof.sql"
out="$("$REPO/scripts/daily/ds1.sh" -X -q -P pager=off -v steps_152="$work/152.sql" -v steps_153="$work/153.sql" -f "$work/proof.sql" 2>&1)" || { echo "$out"; echo "RESULT: ERROR"; exit 2; }
echo "$out"
echo "$out" | grep -q '^RESULT: IDENTICAL'

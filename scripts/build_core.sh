#!/usr/bin/env bash
# Rebuild core from the legacy schemas, every step in order (db/build/*.sql).
# Usage: scripts/build_core.sh [psql connection args]; default the local working copy.
set -euo pipefail
D=$(cd "$(dirname "$0")/.." && pwd)
cd "$D"
if [ $# -eq 0 ]; then set -- -h /tmp -p 55432 -U postgres -d spx_stats; fi
PSQL=(psql -v ON_ERROR_STOP=1 -q -At "$@")
for f in "$D"/db/build/[0-9]*.sql; do
  printf '%s ' "$(basename "$f")"
  start=$(date +%s)
  out=$("${PSQL[@]}" -f "$f" 2>&1) || { echo; echo "$out" | grep -E 'ERROR|DETAIL|CONTEXT'; exit 1; }
  echo "$out" | grep -E '\|' | tr '\n' ' ' || true
  echo "($(( $(date +%s) - start ))s)"
done

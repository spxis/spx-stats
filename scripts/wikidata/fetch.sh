#!/usr/bin/env bash
# Run every saved query (queries/<name>.rq) on Wikidata and keep the answers raw
# and dated: <out>/<name>.json. Wikidata allows about one heavy query a minute,
# so this waits between them. Load the answers with load.py.
# Usage: scripts/wikidata/fetch.sh <out dir, e.g. raw/wikidata/YYYY-MM-DD>
set -euo pipefail
D=$(cd "$(dirname "$0")" && pwd)
OUT=${1:?out dir}; mkdir -p "$OUT"
first=1
for q in "$D"/queries/*.rq; do
  [ $first -eq 1 ] || sleep 65; first=0
  name=$(basename "$q" .rq)
  python3 -I "$D/sparql.py" "$q" "$OUT/$name.json"
  echo "$name done"
done
echo "load with: python3 -I $D/load.py $(for q in "$D"/queries/*.rq; do n=$(basename "$q" .rq); printf '%s=%s ' "$n" "$OUT/$n.json"; done)"

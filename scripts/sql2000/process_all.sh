#!/usr/bin/env bash
# Decode and merge every SQL Server 2000 SPX backup listed in
# $SPX_WORK/dl/manifest2000.tsv (tag, archive file), newest first. No SQL
# Server is involved: scripts/sql2000/decode.py reads the .bak itself.
set -uo pipefail
S=${SPX_WORK:?set SPX_WORK}; D=$(cd "$(dirname "$0")" && pwd); R=$(cd "$D/../.." && pwd)
cat "$R/scripts/spx/tablemap.tsv" "$R/scripts/spx/tablemap2000.tsv" > "$S/tablemap_all.tsv"
while IFS=$'\t' read -r tag archive; do
  echo "=== $tag"
  X=$S/sql2000/x_$tag; rm -rf "$X"; mkdir -p "$X"
  unar -q -o "$X" "$archive" >/dev/null 2>&1 || { echo "UNPACK FAILED"; continue; }
  bak=$(find "$X" -iname '*.bak' | head -1)
  [ -n "$bak" ] || { echo "no .bak in archive"; continue; }
  rm -rf "$S/sql2000/raw"
  python3 -I "$D/decode.py" "$bak" --raw "$S/sql2000/raw" --map "$S/tablemap_all.tsv" | awk -F'\t' 'NF>2' | grep -v 'SQL Server counted' || true
  SPX_RAW=$S/sql2000/raw SPX_TABLEMAP=$S/tablemap_all.tsv bash "$R/scripts/spx/load_backup.sh" - "$tag" > "$S/sql2000/$tag.log" 2>&1
  if [ $? -ne 0 ]; then echo "MERGE FAILED, archive kept: see $S/sql2000/$tag.log"; grep -E 'ERROR|CONTEXT' "$S/sql2000/$tag.log"; rm -rf "$X"; continue; fi
  rm -rf "$X" "$archive"
done < "$S/dl/manifest2000.tsv"
echo "=== ALL DONE"

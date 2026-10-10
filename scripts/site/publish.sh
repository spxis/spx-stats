#!/usr/bin/env bash
# Build the browsing site (site/ + a fresh data export) and push it to the
# gh-pages branch, which GitHub Pages serves. Usage: scripts/site/publish.sh
set -euo pipefail
R=$(cd "$(dirname "$0")/../.." && pwd)
B=$(mktemp -d)
python3 -I "$R/scripts/site/export.py" "$B/data"
cp "$R"/site/* "$B/"
touch "$B/.nojekyll"
cd "$B"
git init -q -b gh-pages
git -c user.name="$(git -C "$R" config user.name)" -c user.email="$(git -C "$R" config user.email)" add -A
git -c user.name="$(git -C "$R" config user.name)" -c user.email="$(git -C "$R" config user.email)" commit -q -m "site: $(git -C "$R" rev-parse --short HEAD) with data of $(date -u +%Y-%m-%d)"
git push -q -f "$(git -C "$R" remote get-url origin)" gh-pages
echo "pushed gh-pages ($(du -sh "$B" | cut -f1))"
rm -rf "$B"

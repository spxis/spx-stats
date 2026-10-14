#!/bin/sh
# Start of the always-on preview site container: wait for the PostgREST, build the pages once per image (the result is kept in the
# `next` volume, so a plain restart skips it), then serve them. Reads only SPX_REST_URL (http://pgrst:3000/, accepted by
# web/src/lib/api/config.ts because SPX_PREVIEW=1 is set).
set -u
cd /app/web || exit 1

echo "waiting for the PostgREST at $SPX_REST_URL"
n=0
until node -e "fetch(process.env.SPX_REST_URL + 'games?league=eq.nhl&year=eq.2010&select=game_id&limit=1', { headers: { 'Accept-Profile': 'api' } }).then((r) => process.exit(r.status === 200 ? 0 : 1), () => process.exit(1))"; do
  n=$((n + 1))
  [ "$n" -lt 100 ] || { echo "the PostgREST never answered; exiting so the container restarts"; sleep 30; exit 1; }
  sleep 3
done

if [ "$(cat .next/PREVIEW_SHA 2>/dev/null || true)" != "$SPX_PREVIEW_SHA" ]; then
  echo "building the pages for $SPX_PREVIEW_SHA from DS1"
  find .next -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
  if ! ./node_modules/.bin/next build; then
    echo "the build failed; waiting 10 minutes before the container restarts so DS1 is not hit in a loop"
    sleep 600
    exit 1
  fi
  printf '%s' "$SPX_PREVIEW_SHA" > .next/PREVIEW_SHA
fi

exec ./node_modules/.bin/next start -H 0.0.0.0 -p 3000

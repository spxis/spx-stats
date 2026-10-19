# The SportsLogos.Net logo files the site serves itself (/team-logos/sl/..., migration 108), written from DS1 into a build tree, shared by
# deploy-prebuilt.sh and ds1-preview.sh. Source it; never run it.
#
#   hosted_logos_export <web dir>   runs scripts/logos/export_hosted.py against DS1 (read only) so <web dir>/public/team-logos/sl/ holds every
#                                   file a core.franchise_brand row points at, each checked against its sha256; calls die() when the
#                                   password, DS1 or psql is missing, when a referenced file is missing from DS1's archive, or when its bytes
#                                   do not match. A DS1 with no hosted logos writes nothing and succeeds.
#   hosted_logos_render <web dir> <rest url>
#                                   runs scripts/logos/render_site.py (after hosted_logos_export) so <web dir>/public/team-logos/ holds the site's own small
#                                   WebP copies of every logo the API names, and their manifest (docs/logos-serving.md). It never stops a build: with no Pillow,
#                                   no API or a failed run it warns, removes any manifest and the logos keep their hot links, as before. <rest url> is a
#                                   read-only PostgREST of the api schema (deploy-prebuilt.sh's $LOCAL, the preview's). Python: SPX_LOGO_PYTHON, else
#                                   ~/.cache/spx-stats/logo-venv/bin/python, else python3 (each must have Pillow with WebP). No request to Wikimedia when the
#                                   source cache (~/Projects/backups/spx-stats/logo-library/render-src) already holds the file.
#
# The caller defines say() and die() (die must exit). The DS1 password comes from SPX_DS1_DB_PASSWORD or the keychain item
# 'spx-stats-db DS1 55440' and goes to psql through the environment of that one command, never on a command line and never printed.
# Settings for tests: SPX_DS1_HOST, SPX_DS1_PORT, SPX_DS1_DB_NAME, SPX_DS1_DB_USER, SPX_PSQL (a stand-in psql).

_HL_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
type ds1_host >/dev/null 2>&1 || . "$_HL_HERE/../spx-checks.sh"

hosted_logos_export() {
  local web="$1" host pw psql
  [ -d "$web" ] || die "hosted logos: no web directory $web"
  host="${SPX_DS1_HOST:-}"
  [ -n "$host" ] || host="$(ds1_host)" || die "DS1 $(ds1_missing)"
  pw="${SPX_DS1_DB_PASSWORD:-}"
  [ -n "$pw" ] || pw="$(kc_get 'spx-stats-db DS1 55440')"
  [ -n "$pw" ] || die "no DS1 password: the keychain item 'spx-stats-db DS1 55440' is missing here (zsh scripts/mac/spx-credentials.sh parity)"
  psql="${SPX_PSQL:-}"
  [ -n "$psql" ] || psql="$(PATH="$PATH:/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin" command -v psql)" || die "psql is not installed (brew install libpq)"
  say "hosted logos: writing the SportsLogos.Net files from DS1 into $web/public/team-logos/sl"
  PGHOST="$host" PGPORT="${SPX_DS1_PORT:-55440}" PGUSER="${SPX_DS1_DB_USER:-postgres}" PGDATABASE="${SPX_DS1_DB_NAME:-spx_stats}" \
    PGPASSWORD="$pw" PGOPTIONS="-c default_transaction_read_only=on" PGCONNECT_TIMEOUT=15 PSQL="$psql" \
    python3 -I "$_HL_HERE/../../logos/export_hosted.py" "$web" || die "hosted logos: the export stopped (see above); nothing was built or deployed"
  unset pw
}

hosted_logos_render() {
  local web="$1" rest="$2" py="" c
  [ -d "$web" ] || { say "logo copies: no web directory $web (skipped)"; return 0; }
  for c in "${SPX_LOGO_PYTHON:-}" "$HOME/.cache/spx-stats/logo-venv/bin/python" python3; do
    [ -n "$c" ] || continue
    "$c" -c 'from PIL import features, Image; raise SystemExit(0 if features.check("webp") else 1)' >/dev/null 2>&1 && { py="$c"; break; }
  done
  rm -f "$web/public/team-logos/manifest.json"
  if [ -z "$py" ]; then
    say "warning: no Python with Pillow and WebP, so the logos keep their hot links. Fix: python3 -m venv ~/.cache/spx-stats/logo-venv && ~/.cache/spx-stats/logo-venv/bin/pip install pillow"
    return 0
  fi
  say "logo copies: rendering small WebP logos into $web/public/team-logos"
  "$py" -I "$_HL_HERE/../../logos/render_site.py" --web "$web" --rest "$rest" || {
    rm -f "$web/public/team-logos/manifest.json"
    say "warning: the logo render stopped (see above); the logos keep their hot links"
  }
  return 0
}

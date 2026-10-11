#!/bin/zsh
# One-time credential setup on John's Mac. Contains no values.
#   spx-credentials.sh dropbox     OAuth flow -> keychain + NAME=value lines on the clipboard
#   spx-credentials.sh tailscale   save a Tailscale auth key -> keychain + clipboard
#   spx-credentials.sh setup       new Mac: DS1 password and board key from Dropbox -> keychain, then test.
#                                  Needs SPX_DS1_HOST, SPX_DS1_PASSWORD_FILE and SPX_BOARD_KEY_FILE; the private
#                                  START-HERE file has the full command.
# Secrets are read with hidden prompts, saved to the login keychain and never printed.
# The clipboard gets ready-to-paste NAME=value lines for the "spx-stats env" note.
set -eu

kc_save() { security add-generic-password -U -a "$USER" -s "$1" -w "$2" >/dev/null; }

case "${1:-}" in
dropbox)
  echo "Dropbox app first (console): https://www.dropbox.com/developers/apps/create"
  echo "  Scoped access > Full Dropbox > any name. Permissions tab: tick files.content.write,"
  echo "  files.content.read, files.metadata.read, press Submit. Settings tab has the key and secret."
  printf 'App key: ';    read -r key
  printf 'App secret (hidden): '; read -rs secret; echo
  open "https://www.dropbox.com/oauth2/authorize?client_id=${key}&response_type=code&token_access_type=offline"
  printf 'Click Allow in the browser, then paste the access code here: '; read -r code
  resp=$(printf 'user = "%s:%s"\n' "$key" "$secret" | curl -sS -K - https://api.dropbox.com/oauth2/token \
    -d code="$code" -d grant_type=authorization_code)
  refresh=$(printf '%s' "$resp" | plutil -extract refresh_token raw -o - - 2>/dev/null) || {
    echo "No refresh token came back (wrong code, or the code was used already). Run again."; exit 1; }
  kc_save "spx-stats dropbox app key" "$key"
  kc_save "spx-stats dropbox app secret" "$secret"
  kc_save "spx-stats dropbox refresh token" "$refresh"
  printf 'DROPBOX_APP_KEY=%s\nDROPBOX_APP_SECRET=%s\nDROPBOX_REFRESH_TOKEN=%s\n' "$key" "$secret" "$refresh" | pbcopy
  echo "Saved to the keychain. The three NAME=value lines are on the clipboard: paste them into your note."
  ;;
tailscale)
  echo "Make the key at https://login.tailscale.com/admin/settings/keys > Generate auth key:"
  echo "  Reusable ON, Ephemeral ON, Expiry 90 days (the maximum), Tags: none (or one you own)."
  printf 'Auth key (hidden): '; read -rs tskey; echo
  case "$tskey" in tskey-*) ;; *) echo "That does not look like a Tailscale auth key (tskey-...)."; exit 1;; esac
  kc_save "spx-stats tailscale authkey" "$tskey"
  printf 'TS_AUTHKEY=%s\n' "$tskey" | pbcopy
  echo "Saved to the keychain. TS_AUTHKEY=... is on the clipboard: paste it into your note."
  ;;
setup)
  : "${SPX_DS1_HOST:?use the command in the private START-HERE file}" "${SPX_DS1_PASSWORD_FILE:?}" "${SPX_BOARD_KEY_FILE:?}"
  for f in "$SPX_DS1_PASSWORD_FILE" "$SPX_BOARD_KEY_FILE"; do
    [ -f "$f" ] || { echo "Not found: $f (is Dropbox installed and synced?)"; exit 1; }
  done
  path+=(/opt/homebrew/opt/libpq/bin)
  board="https://api.sumilabu.com/api/v1/projects/spx-stats/tickets"
  kc_get() { security find-generic-password -s "$1" -w 2>/dev/null || true; }
  board_ok() { [ -n "$1" ] && [ "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $1" "$board")" = 200 ]; }
  ds1_ok() { [ -n "$1" ] && PGPASSWORD="$1" PGCONNECT_TIMEOUT=8 psql -h "$SPX_DS1_HOST" -p 55440 -U postgres -d spx_stats -Atc 'select 1' >/dev/null 2>&1; }

  if ! command -v psql >/dev/null; then echo "DS1: FAIL, no psql (run: brew install libpq)"
  elif ! nc -z -G 5 "$SPX_DS1_HOST" 55440 2>/dev/null; then echo "DS1: FAIL, not reachable (turn Tailscale on)"
  elif ds1_ok "$(kc_get "spx-stats-db DS1 55440")"; then echo "DS1: ok (keychain)"
  else
    pw=$(tr -d '\r\n' < "$SPX_DS1_PASSWORD_FILE" 2>/dev/null || true)
    if ds1_ok "$pw"; then kc_save "spx-stats-db DS1 55440" "$pw"; echo "DS1: ok (saved from Dropbox)"
    else echo "DS1: FAIL, the password in SPX_DS1_PASSWORD_FILE was refused"; fi
  fi

  if board_ok "$(kc_get "sumilabu board spx-stats")"; then echo "board: ok (keychain)"
  else
    saved=0
    for k in ${(f)"$(grep -oE '[A-Za-z0-9_-]{32,}' "$SPX_BOARD_KEY_FILE" 2>/dev/null | sort -u)"}; do
      if board_ok "$k"; then kc_save "sumilabu board spx-stats" "$k"; saved=1; break; fi
    done
    [ $saved = 1 ] && echo "board: ok (saved from Dropbox)" || echo "board: FAIL, no key in SPX_BOARD_KEY_FILE was accepted"
  fi

  node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)' 2>/dev/null \
    && echo "node: ok" || echo "node: FAIL, need 22.18 or newer"
  command -v pnpm >/dev/null && echo "pnpm: ok" || echo "pnpm: FAIL (run: npm i -g pnpm)"
  gh auth status >/dev/null 2>&1 && echo "gh: ok" || echo "gh: FAIL (run: unset GH_TOKEN; gh auth login)"
  ;;
*)
  echo "usage: spx-credentials.sh dropbox | tailscale | setup" >&2; exit 2;;
esac

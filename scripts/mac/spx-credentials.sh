#!/bin/zsh
# One-time credential setup on John's Mac. Contains no values.
#   spx-credentials.sh dropbox     OAuth flow -> keychain + NAME=value lines on the clipboard
#   spx-credentials.sh tailscale   save a Tailscale auth key -> keychain + clipboard
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
*)
  echo "usage: spx-credentials.sh dropbox | tailscale" >&2; exit 2;;
esac

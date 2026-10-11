#!/bin/zsh
# Copy the plain text of an Apple Note to the clipboard (macOS). Prints nothing.
#   spx-note-copy.sh ["note name"]      default note name: "spx-stats env"
# Reads the note through osascript and strips the HTML. Locked (password-protected)
# notes cannot be read this way; keep the note unlocked. The first run asks
# macOS for permission for Terminal to control Notes.
set -eu
name="${1:-spx-stats env}"
html=$(osascript - "$name" <<'OSA' 2>/dev/null
on run argv
  tell application "Notes" to return body of first note whose name is (item 1 of argv)
end run
OSA
) || { echo "Could not read a note called \"$name\" (missing, locked, or Notes access not allowed)." >&2; exit 1; }
printf '%s' "$html" | /usr/bin/perl -0pe '
  s{<br\s*/?>}{\n}gi; s{</(div|p|h[1-6]|li)>}{\n}gi; s{<[^>]+>}{}g;
  s/&nbsp;/ /g; s/&lt;/</g; s/&gt;/>/g; s/&quot;/"/g; s/&#39;/\x27/g; s/&amp;/&/g;
  s/\n{3,}/\n\n/g; s/^\s+|\s+$//g;
' | pbcopy

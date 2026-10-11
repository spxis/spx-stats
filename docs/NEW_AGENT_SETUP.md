# Bringing up a new cloud agent

No values in this file. Keep one note in Apple Notes called `spx-stats env` (unlocked) holding the lines below,
with a one-line comment above each.

## The environment variables

Paste these into the cloud environment's settings.

| Name | What it is |
|---|---|
| `SUMILABU_BOARD_URL` | `https://api.sumilabu.com`, the ticket board. |
| `SUMILABU_BOARD_TOKEN` | spx-stats' board key (keychain service `sumilabu board spx-stats`). |
| `SPX_DS1_DB_PASSWORD` | Password of the `postgres` role on DS1's `spx-stats-db` (keychain service `spx-stats-db DS1 55440`). |
| `DROPBOX_APP_KEY` | Key of the Dropbox app used by `scripts/dropbox_put.py`. |
| `DROPBOX_APP_SECRET` | Secret of that app. |
| `DROPBOX_REFRESH_TOKEN` | Long-lived token from the OAuth flow; `dropbox_put.py` trades it for 4-hour access tokens. |
| `TS_AUTHKEY` | Reusable, ephemeral Tailscale auth key, so a new session can join the tailnet and reach DS1. |

Copy a value on the Mac without printing it: `security find-generic-password -s "<service>" -w | pbcopy`.
Copy the whole note: `scripts/mac/spx-note-copy.sh` (note "spx-stats env"; pass another name as the argument).
It reads the note through osascript and strips the HTML, so a locked note cannot be read this way.

## 1. Dropbox credentials (one browser visit, then one command)

1. Create the app: https://www.dropbox.com/developers/apps/create. Choose Scoped access, Full Dropbox, any name.
2. Permissions tab: tick `files.content.write`, `files.content.read`, `files.metadata.read`, press Submit.
3. In Terminal, in the repo checkout:

       zsh scripts/mac/spx-credentials.sh dropbox

   It asks for the app key and secret (from the app's Settings tab), opens the Allow page (`token_access_type=offline`),
   asks for the access code, then saves the keychain services `spx-stats dropbox app key`, `... app secret`,
   `... refresh token`, and puts the three `NAME=value` lines on the clipboard for the note. It prints no secret.

Your Dropbox root is your home namespace, so plain paths work. Only if the root ever becomes a team namespace, also
set `DROPBOX_ROOT_NAMESPACE`.

## 2. Tailscale auth key (one browser visit, then one command)

1. https://login.tailscale.com/admin/settings/keys, Generate auth key: Reusable on, Ephemeral on, Expiry 90 days
   (the maximum, so repeat every quarter), no tags unless you own one.
2. In Terminal:

       zsh scripts/mac/spx-credentials.sh tailscale

   It reads the key (hidden), saves keychain service `spx-stats tailscale authkey` and puts `TS_AUTHKEY=...` on the
   clipboard for the note.

## 3. Cloud startup

`.claude/settings.json` runs `scripts/cloud/session-start.sh` on session start (cloud sessions only, asynchronous).
It exits at once when `spx_stats` already has data. Otherwise it installs Postgres 17, initialises it (only if the
data directory is missing) and starts it as `postgres`, brings Tailscale up in userspace mode with `TS_AUTHKEY`,
forwards DS1 through `scripts/cloud/fwd.py` (`tailscale nc`), creates `spx_stats` and restores DS1's dump into it.
It never drops or overwrites a database. A database that exists but is empty is left alone with a message.
Dry run, changing nothing: `DRY_RUN=1 bash scripts/cloud/session-start.sh`.

DS1's copy can be older than the last cloud session: check the newest handover note for what it lacks.

## 4. Checklist: new agent

1. Open the `spx-stats env` note; if a key is missing, run the matching command above.
2. Paste the lines into the cloud environment's settings and start the session.
3. In the session: `echo ${DROPBOX_APP_KEY:+ok}` and `psql -h /tmp -p 55432 -U postgres -d spx_stats -c 'select 1'`.
4. Raw downloads: `python3 scripts/dropbox_put.py <file> <source>`; the backlog: `python3 scripts/dropbox_put.py --from-archive`.

# Bringing up a new cloud agent

No values in this file. The commands to run once the agent is up are in [AGENT_START_HERE.md](AGENT_START_HERE.md).

**What to tell a brand-new agent:** "The repo is https://github.com/spxis/spx-stats. Read AGENTS.md and
docs/AGENT_START_HERE.md first, then do <the task>."

## The Apple Notes note: copy this template

Keep one unlocked note called `spx-stats env` (a locked note cannot be read by `scripts/mac/spx-note-copy.sh`).
Paste the template below into it and fill in each `<value>` with the command beside it. `scripts/mac/spx-note-copy.sh`
copies the whole note to the clipboard, ready to paste into the cloud environment's settings.

    ## (1) Cloud environment settings. Set ONCE per environment: every new session in it inherits them.
    ##     Paste again only if you create a brand-new environment.
    # REQUIRED. The ticket board. Fixed value.
    SUMILABU_BOARD_URL=https://api.sumilabu.com
    # REQUIRED for tickets. spx-stats' board key.  Fetch: security find-generic-password -s "sumilabu board spx-stats" -w | pbcopy
    SUMILABU_BOARD_TOKEN=<value>
    # REQUIRED for the database to come up. DS1 Postgres password.  Fetch: security find-generic-password -s "spx-stats-db DS1 55440" -w | pbcopy
    SPX_DS1_DB_PASSWORD=<value>
    # REQUIRED for the database to come up. Tailscale auth key, expires every 90 days.  Regenerate: zsh scripts/mac/spx-credentials.sh tailscale
    #   (saves keychain "spx-stats tailscale authkey"; fetch: security find-generic-password -s "spx-stats tailscale authkey" -w | pbcopy)
    TS_AUTHKEY=<value>
    # OPTIONAL (needed to archive raw files to Dropbox with scripts/dropbox_put.py). Three lines, made once.
    #   Create: zsh scripts/mac/spx-credentials.sh dropbox  (puts all three on the clipboard)
    #   Fetch one: security find-generic-password -s "spx-stats dropbox app key" -w | pbcopy   (also "... app secret", "... refresh token")
    DROPBOX_APP_KEY=<value>
    DROPBOX_APP_SECRET=<value>
    DROPBOX_REFRESH_TOKEN=<value>
    # OPTIONAL. Only for bulk production loads (scripts/supabase/load.py, scripts/players/prod_load.py). Supabase account access token.
    #   Create: Supabase dashboard > Account > Access Tokens. Not in the keychain yet; save it there after making it.
    SUPABASE_ACCESS_TOKEN=<value>

    ## (2) Vercel only (project "Sumilabu", not the cloud environment). Set when a project's board key changes; agents never see it.
    # Write-only: saving REPLACES the whole map, so rebuild it with every project's key, then redeploy Sumilabu.
    # Rebuild script (copies the full JSON to the clipboard, prints no token): see Dropbox /Backups/spx-stats/notes/board-key-and-lessons.md
    BOARD_TOKENS_JSON=<value built by that script>

    ## (3) Tell the agent in chat. Nothing secret.
    # Repo: https://github.com/spxis/spx-stats . Read AGENTS.md and docs/AGENT_START_HERE.md.
    # Production Supabase project ref: njpvfrceahkvnrduerkk . Vercel project: spx-stats (prj_MfgGl5vzVccEhmtSyvgze6hhgXJg).
    # Anything about the task itself.

Copy a keychain value without printing it: `security find-generic-password -s "<service>" -w | pbcopy`.

The Mac export script `scripts/mac/spx-raw-export.sh` (raw files to Dropbox) has not landed in the repository yet; until
it does, `python3 scripts/dropbox_put.py --from-archive` is the way, and needs the `DROPBOX_*` lines above.

## First-time setup of the two credentials that need a browser

**Dropbox** (one browser visit, then one command)

1. Create the app: https://www.dropbox.com/developers/apps/create. Choose Scoped access, Full Dropbox, any name.
2. Permissions tab: tick `files.content.write`, `files.content.read`, `files.metadata.read`, press Submit.
3. In Terminal, in the repo checkout: `zsh scripts/mac/spx-credentials.sh dropbox`. It asks for the app key and secret
   (from the app's Settings tab), opens the Allow page (`token_access_type=offline`), asks for the access code, saves
   the three keychain services and puts the three `NAME=value` lines on the clipboard. It prints no secret.

Your Dropbox root is your home namespace, so plain paths work. Only if the root ever becomes a team namespace, also
set `DROPBOX_ROOT_NAMESPACE`.

**Tailscale** (one browser visit, then one command)

1. https://login.tailscale.com/admin/settings/keys, Generate auth key: Reusable on, Ephemeral on, Expiry 90 days (the
   maximum, so repeat every quarter), no tags unless you own one.
2. In Terminal: `zsh scripts/mac/spx-credentials.sh tailscale`. It reads the key (hidden), saves keychain service
   `spx-stats tailscale authkey` and puts `TS_AUTHKEY=...` on the clipboard.

## Cloud startup

`.claude/settings.json` runs `scripts/cloud/session-start.sh` on session start (cloud sessions only, asynchronous).
It exits at once when `spx_stats` already has data. Otherwise it installs Postgres 17, initialises it (only if the data
directory is missing) and starts it as `postgres`, brings Tailscale up in userspace mode with `TS_AUTHKEY`, forwards
DS1 through `scripts/cloud/fwd.py` (`tailscale nc`), creates `spx_stats` and restores DS1's dump into it. It never drops
or overwrites a database. A database that exists but is empty is left alone with a message. Preview, changing nothing:
`DRY_RUN=1 bash scripts/cloud/session-start.sh`. The real run is untested.

DS1's copy is refreshed by hand and can be older than the last cloud session, so a fresh container can lack recent
legacy data: check the newest private handover note.

## Checklist: new agent

1. Open the `spx-stats env` note; if a value is missing, run the matching command above.
2. Paste the lines into the cloud environment's settings and start the session.
3. In the session: `echo ${SUMILABU_BOARD_TOKEN:+ok}`, `pg_isready -h /tmp -p 55432`, and
   `psql -h /tmp -p 55432 -U postgres -d spx_stats -c 'select 1'`; then `cd web && pnpm task`.
4. Raw downloads: `python3 scripts/dropbox_put.py <file> <source>`; the backlog: `python3 scripts/dropbox_put.py --from-archive`.

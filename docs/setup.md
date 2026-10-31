# Setting up a machine or a cloud session

Moved word for word from [AGENTS.md](../AGENTS.md) on 2026-10-30, so that file stays short enough to load in every session. Read this when you set up a Mac or cloud environment, or when a `[spx-check]` line or a credential is missing. Sections 4 and 12 of AGENTS.md keep the session-start steps and the secrets rule.

## Connecting a machine (from AGENTS.md section 4)

**New machine or instance: connect everything first.** Do this once per Mac or cloud environment, before any
ticket work. Each row says what breaks without it. Exact commands with private values are in the private file.

| Connect | How | Without it |
|---|---|---|
| claude.ai connectors: Dropbox, Vercel, Supabase, GitHub | claude.ai, Settings, Connectors: connect each one (a browser click each). They then appear in every Claude session on that account, cloud or Mac. | no private file over MCP, no MCP deploys, no production reads |
| Turso CLI (Mac, optional) | `turso auth login` (install: `brew install tursodatabase/tap/turso`) | nothing breaks; the runner and the site use the HTTP API with `TURSO_*` |
| Vercel CLI (Mac) | `vercel login` (tested 2026-10-11; `vercel whoami` prints `spxis`) | no deploys when the Vercel connector is missing |
| GitHub CLI (Mac) | `unset GH_TOKEN; gh auth login` (a stale `GH_TOKEN` in the shell breaks `gh`) | no Sumilabu redeploys, no `gh run watch` |
| Private host mapping (Mac) | `zsh scripts/mac/spx-credentials.sh hosts [--from <private START-HERE file>]` writes `~/.config/spx-stats/hosts.env` (mode 600, outside the repository): the addresses, host names and NAS login behind machine1, machine2 and nas1. Every script reads it through `scripts/mac/lib/hosts.sh`; `setup` runs it first. `hosts --check` lists which names are set, never a value | every DS1, ssh and keychain-parity line says `MISSING` |
| Tailscale (Mac) | the app, signed in, on (machine2: stays on). Needed only off the home network: on the home LAN (machine1) leave it off | no DS1 when away from home |
| Keychain: DS1 password, board key (Mac) | the setup block in the private file (`spx-credentials.sh setup`, which then runs `machine`) | no DS1, no `pnpm task` |
| DS1 Postgres (Mac) | on the home LAN, or with Tailscale on elsewhere, plus the keychain password: `bash scripts/mac/spx-check.sh` prints `DS1 Postgres: ok (home LAN ...)` or `ok (VPN)` | no access to the source of truth |
| `ds1` hosts name + ssh to DS1 and the other Mac (Mac) | `zsh scripts/mac/spx-credentials.sh machine` (`--check` first; `--link-macs` once to link the two Macs). It adds `ds1` to `/etc/hosts` (home LAN address on a Mac that is always at home, VPN address on a Mac with the VPN always on), makes a passphrase-less key `~/.ssh/id_ed25519_ds1`, adds `Host ds1` to `~/.ssh/config` (home LAN first, Tailscale otherwise) and authorizes the key once. `bash scripts/mac/spx-check.sh` prints `ssh ds1: ok (...)` | no `ssh ds1`, no editing the NAS jobs' env files |
| Keychain parity (both Macs) | both Macs hold the same required items (`spx-stats-db DS1 55440`, `sumilabu board spx-stats`, `spx-stats SUPABASE_ACCESS_TOKEN`). `zsh scripts/mac/spx-credentials.sh parity` lists present/missing by name; `copy-from <other-mac-alias>` pulls what this Mac lacks from the other, no value shown | `spx-check.sh` prints `keychain: MISSING`; no production count compare |
| Docker (machine2, optional) | Docker Desktop running; then the working-copy block in item 8 of [data-work.md](data-work.md) | no local working copy |
| Production Supabase, read-only | nothing to set up: the public URL and key the site uses; `spx-check.sh` and the cloud hook both test it | no way to compare counts against production |
| Cloud environment variables | the `spx-stats env` note ([section 12](../AGENTS.md#12-secrets-and-the-environment)) | no tickets, no DS1 restore |
| Permission rules | Nothing to do: the deploy rules (`vercel deploy`, `link`, `ls`, `whoami`) are in the committed `.claude/settings.json`. The only per-machine step is `vercel login` (or the Vercel connector) | an agent deploy is refused; credential reads are still refused and John runs those blocks himself |

Then check: `cd web && pnpm task` lists tickets, `vercel whoami` prints `spxis`, and the private file's DS1 `psql`
line answers.

**Rebuilding a wiped Mac:** the ordered checklist, one command per step, is in [scripts/mac/README.md](../scripts/mac/README.md).

**Environment.** A cloud session should have these variable names set. Check with `echo ${NAME:+set}`, which never
prints the value. If one is missing, say which and carry on with what does not need it. Full list: [section 12](../AGENTS.md#12-secrets-and-the-environment).

| Name | Used for | Needed by |
|---|---|---|
| `SUMILABU_BOARD_URL`, `SUMILABU_BOARD_TOKEN` | the ticket board | `pnpm task` |
| `SPX_DS1_DB_PASSWORD`, `TS_AUTHKEY`, `NAS1_VPN_HOST` | reaching DS1 over the VPN (cloud only: a Mac reads its addresses from the private host mapping instead); `NAS1_VPN_HOST` is DS1's VPN address, private, so it is not in this repository | the session-start hook |
| `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN` | archive uploads | `scripts/dropbox_put.py` |
| `SUPABASE_ACCESS_TOKEN` | data releases and production reads | `scripts/release/release.py`, `scripts/sync/compare.py` |

**MCP servers** a cloud session normally has: Supabase (project `njpvfrceahkvnrduerkk`), Vercel (project
`prj_MfgGl5vzVccEhmtSyvgze6hhgXJg`), Dropbox, GitHub. Tested read-only: Supabase `execute_sql` and `list_migrations`,
Vercel `get_project` and `list_deployments`, Dropbox `fetch`, `list_folder` and `search`. Vercel `list_teams` returns
nothing; pass the team id directly ([deploying.md](deploying.md)).

**Cloud working copy.** The cloud session's own Postgres 17 holds much data but is temporary, not the truth: socket
`/tmp`, port 55432, database `spx_stats`, data dir `/home/user/spxwork/pg17` (owned by the `postgres` user). Check it:

    pg_isready -h /tmp -p 55432
    psql -h /tmp -p 55432 -U postgres -d spx_stats -Atc "select count(*) from core.game"   # 377384 on 2026-10-11

**Only the coordinating session starts Postgres.** Worktree-isolated agents can't run `su` or `runuser`. If `psql` can't
connect, report it; don't try to start it. The coordinator starts it with:

    su postgres -c "/usr/lib/postgresql/17/bin/pg_ctl -D /home/user/spxwork/pg17 -l /tmp/pg17.log -o '-p 55432 -k /tmp -c listen_addresses=127.0.0.1' start -w"

**Session-start hook** (`.claude/settings.json` runs `scripts/cloud/session-start.sh`; cloud sessions only, in the
background). It installs and starts Postgres 17, joins Tailscale in userspace mode with `TS_AUTHKEY`, forwards DS1
through `scripts/cloud/fwd.py`, and restores DS1's dump into a new `spx_stats`. It does nothing when `spx_stats`
already has rows, and never drops or overwrites a database. A database that exists but is empty is left alone with a
message. With no `TS_AUTHKEY` it stops after starting Postgres, leaving no `spx_stats`. Preview, changing nothing:
`DRY_RUN=1 bash scripts/cloud/session-start.sh` (tested). The real run is **untested**. The restored copy is only as
current as DS1, and the container is not permanent: push new data to DS1 before the session ends
(item 8 of [data-work.md](data-work.md)).

**On one of John's Macs** (new or existing; no cloud container). One command sets it up:
`zsh scripts/mac/spx-credentials.sh setup` with the variables the private file gives (tested on machine2,
keychain path; the Dropbox path is **untested** end to end). It first creates the private host mapping (`hosts`, from `SPX_HOSTS_SOURCE`, a file holding its NAME=value lines, or by asking). It copies the DS1 password and the board key from his
synced Dropbox into the keychain and prints one ok/FAIL line each for DS1, board, node, pnpm and gh. After that
`pnpm task` reads the board key from the keychain by itself, and DS1 answers with `psql` on the home LAN or over the VPN (the scripts try both).
machine2 reaches DS1 over the home LAN or the VPN and runs Docker; machine1 is reached over ssh.
Agents may not read the Dropbox key files or another Mac's keychain (the permission check refuses it): give John
the command from the private file instead.

## Secrets and the environment (from AGENTS.md section 12)

Template for the note (replace each `<value>`):

    ## (1) Cloud environment settings. Set ONCE per environment; every new session in it inherits them.
    SUMILABU_BOARD_URL=https://api.sumilabu.com       # required, fixed value
    SUMILABU_BOARD_TOKEN=<value>                      # required for tickets: the spx-stats board key
    SPX_DS1_DB_PASSWORD=<value>                       # required for the working copy to come up: DS1 Postgres password
    TS_AUTHKEY=<value>                                # required for the working copy to come up; expires every 90 days
    NAS1_VPN_HOST=<value>                             # required for the working copy to come up: DS1's address over the VPN (private; the private file has it)
    DROPBOX_APP_KEY=<value>                           # optional: archive uploads (scripts/dropbox_put.py)
    DROPBOX_APP_SECRET=<value>
    DROPBOX_REFRESH_TOKEN=<value>
    SUPABASE_ACCESS_TOKEN=<value>                     # optional: bulk production loads only

    ## (2) Vercel only (project "Sumilabu", not the cloud environment). Agents never see it.
    BOARD_TOKENS_JSON=<value>                         # write-only: saving REPLACES the whole map; rebuild, then redeploy

    ## (2b) Vercel project "spx-stats" (the site) and the runner's release-runner.env on the NAS; not the cloud environment.
    TURSO_DATABASE_URL=<value>                        # the Turso database (section 8, "Turso")
    TURSO_AUTH_TOKEN=<value>                          # a read-only token is enough for the site; the runner needs one that can write
    TURSO_RUNLOG_TOKEN=<value>                        # a token that can write: the run log (NAS jobs, runner) and, on Vercel, dismissing alerts

    ## (3) Tell the agent in chat (not secret)
    Repo https://github.com/spxis/spx-stats . "Read AGENTS.md, then Dropbox /Backups/spx-stats/START-HERE.md."
    Production Supabase project ref: njpvfrceahkvnrduerkk . Vercel project: spx-stats (prj_MfgGl5vzVccEhmtSyvgze6hhgXJg).

**Two credentials need a browser the first time**, then one command each on the Mac, in the repo checkout. Neither
prints a secret; both put the `NAME=value` lines on the clipboard:

- **Dropbox.** Create a Scoped-access, Full Dropbox app at https://www.dropbox.com/developers/apps/create. On its
  Permissions tab tick `files.content.write`, `files.content.read` and `files.metadata.read`, and Submit. Then
  `zsh scripts/mac/spx-credentials.sh dropbox` asks for the app key and secret, opens the Allow page
  (`token_access_type=offline`), asks for the access code and saves three keychain services. John's Dropbox root is his
  home namespace, so plain paths work; only if it ever becomes a team namespace, also set `DROPBOX_ROOT_NAMESPACE`.
- **Tailscale.** At https://login.tailscale.com/admin/settings/keys generate a key with Reusable on, Ephemeral on,
  Expiry 90 days (the maximum, so repeat every quarter), no tags. Then `zsh scripts/mac/spx-credentials.sh tailscale`.

**Checklist for a new cloud agent:** open the `spx-stats env` note and fill any missing value; paste the lines into the
cloud environment's settings and start the session; then in the session run `echo ${SUMILABU_BOARD_TOKEN:+ok}`,
`pg_isready -h /tmp -p 55432` (the cloud working copy), `psql -h /tmp -p 55432 -U postgres -d spx_stats -c 'select 1'`, and `cd web && pnpm task`.
Raw downloads: `python3 scripts/dropbox_put.py <file> <source>`; the backlog:
`python3 scripts/dropbox_put.py --from-archive`. On John's Mac,
`~/bin/spx-raw-export.sh` (`scripts/mac/spx-raw-export.sh`; `--check` first, `--install-schedule` for an hourly run) copies
every `legacy_files.raw_archive` row from DS1 into `~/Library/CloudStorage/Dropbox/Backups/spx-stats/raw/<name>`: it finds
DS1 on the home network or Tailscale, skips files already there with the same sha256, never overwrites a different one,
and reports problems. Its stub tests are `scripts/mac/test/spx-raw-export-test.sh` (run them after any change to it).

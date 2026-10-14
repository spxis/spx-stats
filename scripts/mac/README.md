# Setting up a Mac for spx-stats

Names only here, never a value. Private values (file locations, the full `setup` command) are in the private
`START-HERE.md` in Dropbox. John has two Macs and both must be able to do the same things:

| Mac | Network | `ds1` name in `/etc/hosts` | Name for the other Mac in ssh |
|---|---|---|---|
| Mac Studio (`MacStudioM1`) | home LAN, Tailscale off | the home LAN address | `laptop` |
| MacBook (`MacBookProM5Max`) | Tailscale always on | the Tailscale address | `macstudio` |

The addresses are in `spx-checks.sh`. Either Mac still reaches DS1 by the other route too: the scripts try the `ds1` name,
the home LAN addresses and Tailscale, and the ssh config tries the home LAN first and Tailscale otherwise.

## The scripts

| Command (run from the repo root) | What it does |
|---|---|
| `bash scripts/mac/spx-check.sh` | One `ok` or `MISSING: <the one fix>` line per connection, including `ssh ds1` and the required keychain items. Read-only. |
| `bash scripts/mac/deploy-prebuilt.sh [--check-only]` | Builds the site against DS1 through a local PostgREST in Docker (port 3190) and deploys it prebuilt, so a build no longer reads production; refuses when DS1 and production serve different data. Needs Docker, `vercel login` and the DS1 keychain item. `--check-only` only starts PostgREST and compares. See AGENTS.md section 7. |
| `bash scripts/mac/ds1-preview.sh [--port N] [--start] [--detach]` / `--stop` | Runs the site from this checkout on the first free port from 3101, reading DS1 through a read-only PostgREST in Docker (3120 and up) instead of production; Ctrl-C stops both. `--start` builds and serves a production build, `--detach` leaves it running and `--stop` ends it. See "Preview with DS1 data" below. |
| `bash scripts/mac/ds1-preview.sh --install [--nightly]` / `--update` / `--status` / `--uninstall` | The always-on version: Docker Compose project `spx-ds1-preview`, site on http://localhost:3150 and PostgREST on 127.0.0.1:3180, restarting with Docker. |
| `zsh scripts/mac/spx-credentials.sh setup` | New Mac: DS1 password and board key from Dropbox into the keychain, tool checks, then `machine`. |
| `zsh scripts/mac/spx-credentials.sh machine [--check] [--route lan\|tailscale] [--link-macs]` | The per-Mac connections, each step idempotent (`ok` when already done, nothing changed): (1) `ds1` in `/etc/hosts` (route picked by whether Tailscale is running, or `--route`; needs sudo, flushes the DNS cache, checks the port), (2) a passphrase-less key `~/.ssh/id_ed25519_ds1`, a `Host ds1` block in `~/.ssh/config` (old config saved first to `~/Projects/backups/mac-setup/<date>-ssh-config-<mac>`), and the key authorized on DS1 once, (3) key login to the other Mac. An existing `Host ds1` or `Host laptop`/`macstudio` block is left alone and only tested. `--check` prints what it would do. |
| `zsh scripts/mac/spx-credentials.sh parity [alias]` | Table of each keychain item (required, optional) present or missing here and on the other Mac. Names only. |
| `zsh scripts/mac/spx-credentials.sh copy-from <laptop\|macstudio> [item...]` | Pull items this Mac lacks (default: the required ones) from the other Mac. |
| `zsh scripts/mac/spx-credentials.sh copy-to <laptop\|macstudio> [item...]` | Push items the other Mac lacks to it. |
| `zsh scripts/mac/spx-credentials.sh dropbox` / `tailscale` | Optional: Dropbox OAuth and Tailscale auth key into the keychain. Do them on both Macs or neither. |

**Keychain items every Mac must hold:** `spx-stats-db DS1 55440`, `sumilabu board spx-stats`,
`spx-stats SUPABASE_ACCESS_TOKEN`. **Optional (both Macs or neither):** `spx-stats dropbox app key`,
`spx-stats dropbox app secret`, `spx-stats dropbox refresh token`, `spx-stats tailscale authkey`.

How `copy-from` / `copy-to` keep a value private: it travels over ssh stdin, so it is never in a command line, a log or the
screen, and the other end writes it with `security add-generic-password`. A non-tty ssh cannot write a locked keychain
("User interaction is not allowed"), so the first try is silent, and only if it fails you are asked once for the other
Mac's login password (hidden), which unlocks the login keychain for that write. Afterwards the script checks the item is
there by name.

Why a dedicated key per Mac: DS1 refused a passphrase-protected main key (nobody can type the passphrase for a scripted
login), so each Mac gets its own passphrase-less `id_ed25519_ds1`. `--link-macs` does the same for Mac-to-Mac ssh. It is
opt-in because it authorizes a passphrase-less key on the other Mac.

## Preview with DS1 data

`ds1-preview.sh` shows the site with DS1's data and sends nothing to production (Supabase or spxn.com): the site's every data read goes through
`web/src/lib/api/config.ts`, which accepts `SPX_REST_URL` only for a loopback address (or, with `SPX_PREVIEW=1`, the compose service `pgrst`). The
PostgREST is the one `deploy-prebuilt.sh` uses (`lib/ds1-pgrst.sh` and `lib/ds1-pgrst.env`: pinned image, read-only session, schema `api`, role `anon`).

**On demand.** `bash scripts/mac/ds1-preview.sh` starts the PostgREST (first free port from 3120), runs `next dev --webpack` from this checkout on the first free
port from 3101, prints the address and stops both on Ctrl-C. `--port` and `--pgrst-port` choose ports (3100-3199 only), `--start` runs `next build` and
`next start` instead (a production-like check; the build reads DS1 only), `--detach` leaves both running (state and log in `~/Library/Caches/spx-stats/`)
and `--stop` ends them. Notes: `--webpack` because Turbopack's dev server answers 500 on this site's Google fonts; Next allows one dev server per checkout.

**Always on** (this Mac Studio): `bash scripts/mac/ds1-preview.sh --install` builds an image from a clean `git archive` of `origin/main`, starts the Compose
project `spx-ds1-preview` (`scripts/mac/ds1-preview/`) and prints http://localhost:3150. Both containers restart with Docker (`restart: unless-stopped`; turn on
"Start Docker Desktop when you sign in" so it survives a reboot) and publish only on 127.0.0.1: site 3150, PostgREST 3180. The first start builds the pages from DS1
inside the container (minutes; the `next` volume keeps them across restarts). Pages are rebuilt from DS1 at most every 5 minutes (`SPX_REVALIDATE=300`, honoured only
with `SPX_PREVIEW=1`; production stays at 86400).
- The DS1 password goes from the keychain into `~/Library/Application Support/spx-stats/ds1-preview.env` (permissions 600, directory 700), outside the repository; Compose reads it with `env_file`. It is never printed or put on a command line.
- `--update`: `git fetch`, and when `origin/main` moved (or with `--force`) rebuild the image and recreate the site; the site is down while its pages rebuild. `--status` shows containers, image commit, launchd agent and one local request. `--uninstall` removes containers, volume, image, agent and the env file.
- `--install --nightly` also adds `~/Library/LaunchAgents/com.spxstats.ds1-preview.plist`, which runs `--update` at 04:30. **Opt-in**; it is local and costs nothing. Run `--install` from `~/Projects/spx-stats`, not from a worktree, so the agent's script path stays valid. Docker must be running at 04:30.

**Moving it to DS1 later** (a separate ticket; nothing is built for it yet). The Compose file has no Mac-only paths: the env file path (`SPX_PREVIEW_ENV_FILE`), the bind address
(`SPX_PREVIEW_BIND`), the ports and the PostgREST image are variables, both images build for amd64 and arm64, and it sets only `mem_limit` (the Synology kernel rejects `cpus`). What would change:
the script's Mac parts (keychain, launchd, `lsof`, `security`) become a small wrapper that writes the env file with `PGRST_DB_URI` pointing at the Postgres container on the
same host, runs `/usr/local/bin/docker compose -p spx-ds1-preview -f docker-compose.yml up -d --build` with `SPX_PREVIEW_BIND` set to the NAS address, and a DSM Task Scheduler entry replaces launchd.

## Rebuild a wiped Mac

Back up first if you can: `~/.claude/` (Claude Code memory in `projects/`, `settings.json`, `CLAUDE.md`) goes to
`~/Projects/backups/`. SSH keys are not worth backing up: `machine` makes new ones (remove the old public keys from
`~/.ssh/authorized_keys` on DS1 and on the other Mac when convenient).

One command per step, in this order. Anything that asks for a password says so.

1. `xcode-select --install`
2. Homebrew: the install command on https://brew.sh
3. `brew install git gh node pnpm libpq vercel-cli` (Node must be 22.18 or newer). Put `/opt/homebrew/opt/libpq/bin` on the PATH for a hand-run `psql`.
4. Install and sign in to the Dropbox app and wait for it to sync; MacBook also Tailscale (signed in, on) and Docker Desktop. Mac Studio: Tailscale off.
5. System Settings, General, Sharing: Remote Login on (so the other Mac can ssh in).
6. `unset GH_TOKEN; gh auth login`
7. `vercel login` (account `spxis`)
8. `mkdir -p ~/Projects && gh repo clone spxis/spx-stats ~/Projects/spx-stats && cd ~/Projects/spx-stats`
9. `zsh scripts/mac/spx-credentials.sh setup` with the variables and Dropbox file locations from the private file. It saves the DS1 password and board key to the keychain, then runs `machine` (asks this Mac's password for sudo, then the DSM password of the `spxis` account once to authorize the ssh key).
10. `zsh scripts/mac/spx-credentials.sh machine --link-macs` (asks the other Mac's login password once; skip until the other Mac is on and has Remote Login). Run `git pull` in the other Mac's checkout only if you want to run these commands there.
11. `zsh scripts/mac/spx-credentials.sh copy-from laptop` on the Mac Studio, or `... copy-from macstudio` on the MacBook: brings `spx-stats SUPABASE_ACCESS_TOKEN` (and any other required item still missing). Asks the other Mac's login password only if its keychain is locked for ssh.
12. `zsh scripts/mac/spx-credentials.sh parity` then `bash scripts/mac/spx-check.sh`: every line `ok` (Turso and Tailscale lines may say optional/off).
13. `cd web && pnpm install --frozen-lockfile && pnpm task` lists the board.

Nothing else is needed for the NAS jobs (the daily scores job and the release runner run on DS1 by themselves); editing their
env files only needs `ssh ds1`, see `daily/README.md`.

# Setting up a Mac for spx-stats

Names only here, never a value. Private values (file locations, the full `setup` command, the host mapping) are in the
private `START-HERE.md` in Dropbox. This repository is public, so machines are named by **role**:

| Role | What it is |
|---|---|
| **machine1** | the main desktop Mac: on the home LAN all day, VPN off |
| **machine2** | the laptop Mac: VPN always on |
| **nas1** | the always-on NAS that hosts the source database. Code, docs and keychain item names call it **DS1**; that name is a stable code, not a model name |
| **nas2** | a second NAS with no spx database: nothing here talks to it |

Both Macs must be able to do the same things:

| Mac | Network | `ds1` name in `/etc/hosts` | Name for the other Mac in ssh |
|---|---|---|---|
| machine1 | home LAN, VPN off | the home LAN address | `MACHINE2_SSH_ALIAS` (default `machine2`) |
| machine2 | VPN always on | the VPN address | `MACHINE1_SSH_ALIAS` (default `machine1`) |

## The private host mapping

Which Mac is which, and every address, host name, login and folder, is NOT in this repository. It is one file per Mac,
`~/.config/spx-stats/hosts.env` (directory 700, file 600, never committed; `.gitignore` and `scripts/check_private_hosts.sh` guard it),
read by every script through `scripts/mac/lib/hosts.sh`. A variable already set in the environment wins over the file, which is how the
cloud session gets `NAS1_VPN_HOST` and how the tests swap in stand-ins.

| Name | Meaning |
|---|---|
| `NAS1_LAN_HOSTS` | addresses or names tried on the home network, in order (space separated) |
| `NAS1_LAN_PRIMARY` | the one LAN address the `ds1` hosts name and the ssh config use |
| `NAS1_VPN_HOST` | nas1's address over the VPN |
| `NAS1_SSH_ALIAS` | the hosts-file and ssh name for nas1; default `ds1`, which Macs set up earlier already use |
| `NAS1_SSH_USER` | the login on nas1 for ssh |
| `NAS1_DB_PORT` | the database port on nas1 (default 55440, which the keychain item names also carry) |
| `NAS1_DOCKER_DIR` | the folder on nas1 that holds the job folders (`spx-daily-scores`, `spx-release-runner`, `spx-harvest`) |
| `NAS1_DOCKER_BIN` | the docker command on nas1 (default `docker`; a NAS may need a full path) |
| `NAS2_LAN_HOST` | optional: nas2's address. No script uses it; the repository guard refuses it in a committed file |
| `MACHINE1_LOCALNAME`, `MACHINE2_LOCALNAME` | each Mac's LocalHostName: how a script knows which Mac it runs on |
| `MACHINE1_HOST`, `MACHINE2_HOST` | each Mac's network name for ssh from the other one |
| `MACHINE1_SSH_ALIAS`, `MACHINE2_SSH_ALIAS` | the ssh alias the other Mac uses (defaults `machine1`, `machine2`; a Mac linked earlier may already use other aliases, set them here and nothing changes) |
| `MACHINE_SSH_USER` | the macOS login used for ssh between the two Macs |
| `HOSTS_GUARD_WORDS` | optional extra words `scripts/check_private_hosts.sh` must never find in a committed file |

Create or check it: `zsh scripts/mac/spx-credentials.sh hosts [--from <file>]` (the private START-HERE file, with the block pasted in a
code fence, works as `--from`; on a terminal it asks for what is missing; `--check` prints which names are set, never a value). With
the file absent every script says `MISSING: the private host mapping ... does not exist; run: zsh scripts/mac/spx-credentials.sh hosts`
and the cloud hook says which `NAS1_*` name to set in the environment.

Either Mac still reaches DS1 by the other route too: the scripts try the `ds1` name, the home LAN addresses and the VPN, and the ssh
config tries the home LAN first and the VPN otherwise.

**Keychain item names** (`spx-stats-db DS1 55440` and the rest) are labels, not secrets, and they are kept: renaming them would orphan
the values already on both Macs and break every agent that reads them by name. They carry the DB port and the DS1 code and nothing else.

## The scripts

| Command (run from the repo root) | What it does |
|---|---|
| `bash scripts/mac/spx-check.sh` | One `ok` or `MISSING: <the one fix>` line per connection, including `ssh ds1`, the required keychain items and the host mapping. Read-only. |
| `bash scripts/check_private_hosts.sh` | Fails when a committed file holds a private-range address (10.x, 172.16-31.x, 192.168.x, 100.64-127.x) or a machine, NAS or platform name from the old docs. Run it before every push. |
| `bash scripts/mac/deploy-prebuilt.sh [--check-only]` | Builds the site against DS1 through a local PostgREST in Docker (port 7790) and deploys it prebuilt, so a build no longer reads production; refuses when DS1 and production serve different data. Needs Docker, `vercel login` and the DS1 keychain item. `--check-only` only starts PostgREST and compares. See AGENTS.md section 7. |
| `bash scripts/mac/ds1-preview.sh [--port N] [--start] [--detach]` / `--stop` | Runs the site from this checkout on the first free port from 7702, reading DS1 through a read-only PostgREST in Docker (7730 and up) instead of production; Ctrl-C stops both. `--start` builds and serves a production build, `--detach` leaves it running and `--stop` ends it. See "Preview with DS1 data" below. |
| `bash scripts/mac/ds1-preview.sh --install [--nightly]` / `--update` / `--status` / `--uninstall` | The always-on version: Docker Compose project `spx-ds1-preview`, site on http://localhost:7700 and PostgREST on 127.0.0.1:7750, restarting with Docker. |
| `zsh scripts/mac/spx-credentials.sh hosts [--check] [--from <file>]` | Writes (or checks) the private host mapping above, mode 600. Idempotent; an existing different file is saved first under `~/Projects/backups/mac-setup/`. |
| `zsh scripts/mac/spx-credentials.sh setup` | New Mac: the host mapping (from `SPX_HOSTS_SOURCE`, or asks), DS1 password and board key from Dropbox into the keychain, tool checks, then `machine`. |
| `zsh scripts/mac/spx-credentials.sh machine [--check] [--route lan\|tailscale] [--link-macs]` | The per-Mac connections, each step idempotent (`ok` when already done, nothing changed): (1) `ds1` in `/etc/hosts` (route picked by whether the VPN is running, or `--route`; needs sudo, flushes the DNS cache, checks the port), (2) a passphrase-less key `~/.ssh/id_ed25519_ds1`, a `Host ds1` block in `~/.ssh/config` (old config saved first to `~/Projects/backups/mac-setup/<date>-ssh-config-<mac>`), and the key authorized on DS1 once, (3) key login to the other Mac. An existing `Host ds1` block, or one for the other Mac, is left alone and only tested. `--check` prints what it would do. |
| `zsh scripts/mac/spx-credentials.sh parity [alias]` | Table of each keychain item (required, optional) present or missing here and on the other Mac. Names only. |
| `zsh scripts/mac/spx-credentials.sh copy-from <other-mac-alias> [item...]` | Pull items this Mac lacks (default: the required ones) from the other Mac. |
| `zsh scripts/mac/spx-credentials.sh copy-to <other-mac-alias> [item...]` | Push items the other Mac lacks to it. |
| `bash scripts/mac/check-live-auth.sh [--new <deployment url>]` | The post-deploy sign-in check: one request to spxn.com/api/auth/providers (must list google) and one to spxn.com/ (must carry the sign-in control); on failure prints the `vercel promote <previous>` rollback command and exits 1. `deploy-prebuilt.sh` runs it before pruning; run it by hand after any other deploy. Tests: `bash scripts/mac/test/check-live-auth-test.sh`. |
| `zsh scripts/mac/spx-credentials.sh auth` | Paste the Google OAuth client id and secret (hidden) and the admin email(s) once: keychain items `spx-stats AUTH_GOOGLE_ID`, `spx-stats AUTH_GOOGLE_SECRET`, `spx-stats ADMIN_EMAILS`, which `ds1-preview.sh --install/--update` puts in the preview's 600 auth env file. Optional. |
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

**On demand.** `bash scripts/mac/ds1-preview.sh` starts the PostgREST (first free port from 7730), runs `next dev --webpack` from this checkout on the first free
port from 7702, prints the address and stops both on Ctrl-C. `--port` and `--pgrst-port` choose ports (7700-7799 only), `--start` runs `next build` and
`next start` instead (a production-like check; the build reads DS1 only), `--detach` leaves both running (state and log in `~/Library/Caches/spx-stats/`)
and `--stop` ends them. Notes: `--webpack` because Turbopack's dev server answers 500 on this site's Google fonts; Next allows one dev server per checkout.

**Always on** (machine1): `bash scripts/mac/ds1-preview.sh --install` builds an image from a clean `git archive` of `origin/main`, starts the Compose
project `spx-ds1-preview` (`scripts/mac/ds1-preview/`) and prints http://localhost:7700. Both containers restart with Docker (`restart: unless-stopped`; turn on
"Start Docker Desktop when you sign in" so it survives a reboot) and publish only on 127.0.0.1: site 7700, PostgREST 7750. The first start builds the pages from DS1
inside the container (minutes; the `next` volume keeps them across restarts). Pages are rebuilt from DS1 at most every 5 minutes (`SPX_REVALIDATE=300`, honoured only
with `SPX_PREVIEW=1`; production stays at 86400).
- Sign-in: `ds1-preview-auth.env` (600, same directory, read only by the site container) holds an `AUTH_SECRET` made once, `NEXTAUTH_URL`/`AUTH_URL=http://localhost:7700` and, when the three keychain items of `spx-credentials.sh auth` exist, the Google client and `ADMIN_EMAILS`: real Google sign-in on http://localhost:7700 (the OAuth client allows that address only). Without them the site offers "Sign in (this Mac)" (loopback only, `SPX_PREVIEW=1` only; AGENTS.md section 6). `--update` also moves an install from the old ports 3150/3180 by stopping the compose project `spx-ds1-preview`.
- The DS1 password goes from the keychain into `~/Library/Application Support/spx-stats/ds1-preview.env` (permissions 600, directory 700), outside the repository; Compose reads it with `env_file`. It is never printed or put on a command line.
- `--update`: `git fetch`, and when `origin/main` moved (or with `--force`) rebuild the image and recreate the site; the site is down while its pages rebuild. `--status` shows containers, image commit, launchd agent and one local request. `--uninstall` removes containers, volume, image, agent and the env file.
- `--install --nightly` also adds `~/Library/LaunchAgents/com.spxstats.ds1-preview.plist`, which runs `--update` at 04:30. **Opt-in**; it is local and costs nothing. Run `--install` from `~/Projects/spx-stats`, not from a worktree, so the agent's script path stays valid. Docker must be running at 04:30.

**Moving it to DS1 later** (a separate ticket; nothing is built for it yet). The Compose file has no Mac-only paths: the env file path (`SPX_PREVIEW_ENV_FILE`), the bind address
(`SPX_PREVIEW_BIND`), the ports and the PostgREST image are variables, both images build for amd64 and arm64, and it sets only `mem_limit` (the NAS kernel rejects `cpus`). What would change:
the script's Mac parts (keychain, launchd, `lsof`, `security`) become a small wrapper that writes the env file with `PGRST_DB_URI` pointing at the Postgres container on the
same host, runs `"$NAS1_DOCKER_BIN" compose -p spx-ds1-preview -f docker-compose.yml up -d --build` with `SPX_PREVIEW_BIND` set to the NAS address, and the NAS's task scheduler replaces launchd.

## Rebuild a wiped Mac

Back up first if you can: `~/.claude/` (Claude Code memory in `projects/`, `settings.json`, `CLAUDE.md`) goes to
`~/Projects/backups/`. SSH keys are not worth backing up: `machine` makes new ones (remove the old public keys from
`~/.ssh/authorized_keys` on DS1 and on the other Mac when convenient).

One command per step, in this order. Anything that asks for a password says so.

1. `xcode-select --install`
2. Homebrew: the install command on https://brew.sh
3. `brew install git gh node pnpm libpq vercel-cli` (Node must be 22.18 or newer). Put `/opt/homebrew/opt/libpq/bin` on the PATH for a hand-run `psql`.
4. Install and sign in to the Dropbox app and wait for it to sync; machine2 also Tailscale (signed in, on) and Docker Desktop. machine1: Tailscale off.
5. System Settings, General, Sharing: Remote Login on (so the other Mac can ssh in).
6. `unset GH_TOKEN; gh auth login`
7. `vercel login` (account `spxis`)
8. `mkdir -p ~/Projects && gh repo clone spxis/spx-stats ~/Projects/spx-stats && cd ~/Projects/spx-stats`
9. `zsh scripts/mac/spx-credentials.sh setup` with the variables and Dropbox file locations from the private file (and `SPX_HOSTS_SOURCE`, the file holding the host mapping lines). It writes the private host mapping, saves the DS1 password and board key to the keychain, then runs `machine` (asks this Mac's password for sudo, then the NAS password of the ssh login once to authorize the ssh key).
10. `zsh scripts/mac/spx-credentials.sh machine --link-macs` (asks the other Mac's login password once; skip until the other Mac is on and has Remote Login). Run `git pull` in the other Mac's checkout only if you want to run these commands there.
11. `zsh scripts/mac/spx-credentials.sh copy-from <other-mac-alias>` (the alias is `MACHINE2_SSH_ALIAS` on machine1, `MACHINE1_SSH_ALIAS` on machine2): brings `spx-stats SUPABASE_ACCESS_TOKEN` (and any other required item still missing). Asks the other Mac's login password only if its keychain is locked for ssh.
12. `zsh scripts/mac/spx-credentials.sh parity` then `bash scripts/mac/spx-check.sh`: every line `ok` (Turso and Tailscale lines may say optional/off), including `host mapping: ok`.
13. `cd web && pnpm install --frozen-lockfile && pnpm task` lists the board.

Nothing else is needed for the NAS jobs (the daily scores job and the release runner run on nas1 by themselves); editing their
env files only needs `ssh ds1` (the `NAS1_SSH_ALIAS`), see `daily/README.md`.

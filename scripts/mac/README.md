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

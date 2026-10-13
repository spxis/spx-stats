# spx-stats: agents start here

The historical record of the NHL, NBA, MLB, NFL and CFL, browsable at https://spxn.com
("SPXN · SPX Stats Network"). The owner is John Morris. Read this whole file before working.

This is one of exactly two places that hold agent instructions:

1. **This file** (public): rules and commands. It has variable names only, never values.
2. **Dropbox `/Backups/spx-stats/START-HERE.md`** (private): where things live, how to fetch each credential, current
   status, the ticket ids, open work, lessons. Read it right after this file with the Dropbox MCP `fetch`.

> **Looking for the ticket board or the work queue?** It is **not** in this repository and **not** on GitHub
> (this repo keeps its Issues and Projects empty on purpose). The board is on **Sumilabu**; see it in one
> command, run from `web/`: `cd web && pnpm task`. Everything about it is in [section 5](#5-tickets).
> Do **not** conclude "there is no board" because you found no ticket files and an empty GitHub issues
> page — read section 5 first.

Status words: **tested** = an agent ran it on 2026-10-11 and saw it work. **untested** = written down, never run end to
end. **manual** = a person or the coordinating session has to do it.

## Contents

1. [Rules in one breath](#1-rules-in-one-breath)
2. [Talking to John](#2-talking-to-john)
3. [What the project is](#3-what-the-project-is)
4. [Cold start](#4-cold-start)
5. [Tickets](#5-tickets)
6. [Doing the work](#6-doing-the-work)
7. [Deploying](#7-deploying)
8. [Data work](#8-data-work)
9. [The website](#9-the-website)
10. [Git](#10-git)
11. [Safety](#11-safety)
12. [Secrets and the environment](#12-secrets-and-the-environment)

## 1. Rules in one breath

- **Who does the work.** The coordinating session only starts Sonnet agents and relays between them and John; it does
  no feature work. Sonnet agents do all the work John asks for, each in its own worktree.
- Work in your own git worktree. Never touch another agent's files.
- Commit as John Morris <john@spxis.com>, Conventional Commits, subject 50 characters or less, no AI attribution,
  add files by name, never `git add -A`.
- The repository is public: no dumps, member data, secrets, private notes or internal reviews.
- File a ticket before starting work. Never write to production without reading [section 8](#8-data-work).
- **DS1 is the permanent source of truth for data; cloud and Mac Postgres are temporary working copies.** Every
  download goes to DS1 (archive row plus `legacy_<source>` load) and to Dropbox before anything reaches production,
  and a cloud session pushes its new data to DS1 before its container is discarded.
- **DS1 has two routes from a Mac: the home LAN and Tailscale.** Try both before saying DS1 is unreachable:
  `bash scripts/mac/spx-check.sh` does (addresses in `scripts/mac/spx-checks.sh`). Never ask John to turn Tailscale on
  at the Mac Studio: it is on the home LAN and DS1 answers there. DS1 is DiskStation1; DiskStation15 (DS15, 10.0.0.115)
  is another NAS, not the database. John adds a `ds1` hosts-file name on each Mac (Mac Studio: home LAN, MacBook:
  Tailscale); the scripts try it first. The cloud container is not on the home LAN, so it uses Tailscale only.
- **First step of every session:** read the hook's `[spx-check]` lines and check your connector tools
  ([section 4](#4-cold-start)); report anything MISSING.
- Short answers. When you need something from John, start with `NEED FROM YOU:` and a copy-paste block.

## 2. Talking to John

John reads on his phone with little attention to spare, and the phone cannot change permission settings.

- **Short bullets, no background paragraphs** unless he asks.
- **When you need something from him, start with `NEED FROM YOU:`, then give a copy-paste block**: one fenced code
  block for Terminal, not a list of steps. At most 3 bullets if a block does not fit. One self-contained block per ask.
  It does the work, prints a short result he can paste back, and waits and checks by itself (for example
  `gh run watch …; curl …`) so he does not have to come back.
- **Say first when you are waiting on him**, plainly, with the one thing he needs to do. If you are blocked (a
  permission refusal, a missing key), that is the first line.
- **Work out the command before asking for a step.** Before telling John to click through a website or log in to a
  machine, check, in order: can an agent or MCP tool (Vercel, Supabase, Dropbox, GitHub) do it; is the value already on
  his Mac (keychain, `.env` files) or in the private file. Then give him ONE command that fetches or builds it without
  printing a secret. Only then ask for a UI step, and say exactly where to click.
- **One command, never a multi-step routine, and no web dashboards.** John hates being sent into Supabase, Vercel,
  DSM or any other web console, and hates "copy this, then open that, then paste" sequences. If one Terminal command
  can do the whole job through a CLI or API, give that single command. Examples:
  - **Production SQL or a migration:** the Supabase Management API with the token from the keychain (`curl -X POST
    https://api.supabase.com/v1/projects/<ref>/database/query`, body built from the file).
  - **A secret onto the NAS:** `security … -w | ssh ds1 '…'`.
  - **A redeploy:** the Vercel CLI.

  Make it wait, check and print a short result by itself. A dashboard step is a last resort, and then you must say
  why no command can do it.
- Never ask him to paste a secret into chat. No wildcard or guessed paths: look every name up first. Test scripts
  before handing them over and say what is untested.
- He is at his Mac Studio (Terminal) most of the time with Tailscale off, because it breaks his Dropbox sync. Do not
  make him turn it on there: DS1 is still reachable from it over the home LAN. His MacBook runs with Tailscale on and Dropbox still syncs; there DS1 is reached directly.
- He wants features published as they are finished, and work done by Sonnet agents.
- When a command works, add it to the private file so the next session does not ask again.
- **Check before you tell.** Before saying something is pending, waiting on John, not done or broken, check the live state
  (the board, `meta.data_release`, production or DS1, git). Other sessions and John act in parallel, so your picture goes stale.
- **Don't repeat.** Say a status or an ask once; after that only report what changed.

## 3. What the project is

- **Base:** the SPX (SportsInteractive.com) archive, 1997–2013. Where SPX holds a value, SPX's value wins.
  A second source that agrees confirms it (`meta.verification`); one that disagrees is logged
  (`meta.data_issue`) and SPX is kept.
- **Gaps** are filled from allowed open sources, growing outward from SPX's seasons:
  - Retrosheet: credit notice required.
  - Lahman.
  - nflverse: CC BY 4.0.
  - NHL API: credited "NHL".
  - Wikipedia: CC BY-SA 4.0, `meta.source` code `wikipedia`.
  - Wikidata: CC0.
  - Wikimedia Commons: logos, licence per file.
- **Never** use Sports Reference (hockey-, basketball-, baseball-, pro-football-reference) or ESPN. Check a source's
  terms before using it; if they forbid automated collection, don't.
- **Provenance** goes in `source_id`, `source_key` and `external_id`, never in free-text notes.
- **Never collect** member data (accounts, wagers, forums, surveys) or sensitive personal data: ethnicity,
  religion, health, sex or gender, family, politics.
- Holes are fine. Don't guess values; log them.

## 4. Cold start

**Session start: do this first, every session.**

1. Read the `[spx-check]` lines the SessionStart hook printed (Mac: `bash scripts/mac/spx-check.sh` re-runs them;
   cloud: the hook ends with the same kind of lines). Each is `ok` or `MISSING: <the one fix>`.
   A `DS1 Postgres: MISSING` line means neither the home LAN nor Tailscale answered; an `ok (home LAN ...)` line with
   `Tailscale: off` is healthy, so do not report Tailscale as a problem.
2. Check your own tool list for the four claude.ai connectors (a script cannot see them): tools named like
   `mcp__*Supabase*`, `*Vercel*`, `*Dropbox*`, `*GitHub*` (use ToolSearch if tools are deferred). The claude.ai
   "GitHub Integration" connector gives Claude Code no `mcp__*GitHub*` tools: GitHub is fine when the hook prints
   `gh login: ok`, so do not report GitHub MISSING in that case. For a missing one the
   fix is "claude.ai > Settings > Connectors > <name> > Connect". Without Supabase: no production migrations or loads.
   Without Vercel: deploy with the CLI block in [section 7](#7-deploying). Turso is not needed today.
3. Report everything MISSING to John as `NEED FROM YOU:` with the one fix, then carry on with what works.

Turso: planned second database (Supabase is production now). Today database `spx-stats` holds one supplementary
`health` table, not used by the code or the site; its URL is private. Connect the Turso connector (or `turso auth login`)
when Turso work starts; not required today. `spx-check.sh` reports the optional `turso` CLI as info.
Neon: not used by this project; don't ask John to connect it.

**New machine or instance: connect everything first.** Do this once per Mac or cloud environment, before any
ticket work. Each row says what breaks without it. Exact commands with private values are in the private file.

| Connect | How | Without it |
|---|---|---|
| claude.ai connectors: Dropbox, Vercel, Supabase, GitHub | claude.ai, Settings, Connectors: connect each one (a browser click each). They then appear in every Claude session on that account, cloud or Mac. | no private file over MCP, no MCP deploys, no production reads |
| Turso CLI (Mac, optional, later) | `turso auth login` (install: `brew install tursodatabase/tap/turso`) | nothing breaks today |
| Vercel CLI (Mac) | `vercel login` (tested 2026-10-11; `vercel whoami` prints `spxis`) | no deploys when the Vercel connector is missing |
| GitHub CLI (Mac) | `unset GH_TOKEN; gh auth login` (a stale `GH_TOKEN` in the shell breaks `gh`) | no Sumilabu redeploys, no `gh run watch` |
| Tailscale (Mac) | the app, signed in, on (MacBook: stays on). Needed only off the home network: on the home LAN (Mac Studio) leave it off | no DS1 when away from home |
| Keychain: DS1 password, board key (Mac) | the setup block in the private file (`spx-credentials.sh setup`, which then runs `machine`) | no DS1, no `pnpm task` |
| DS1 Postgres (Mac) | on the home LAN, or with Tailscale on elsewhere, plus the keychain password: `bash scripts/mac/spx-check.sh` prints `DS1 Postgres: ok (home LAN ...)` or `ok (Tailscale)` | no access to the source of truth |
| `ds1` hosts name + ssh to DS1 and the other Mac (Mac) | `zsh scripts/mac/spx-credentials.sh machine` (`--check` first; `--link-macs` once to link the two Macs). It adds `ds1` to `/etc/hosts` (home LAN address on a Mac that is always at home, Tailscale address on a Mac with Tailscale always on), makes a passphrase-less key `~/.ssh/id_ed25519_ds1`, adds `Host ds1` to `~/.ssh/config` (home LAN first, Tailscale otherwise) and authorizes the key once. `bash scripts/mac/spx-check.sh` prints `ssh ds1: ok (...)` | no `ssh ds1`, no editing the NAS jobs' env files |
| Keychain parity (both Macs) | both Macs hold the same required items (`spx-stats-db DS1 55440`, `sumilabu board spx-stats`, `spx-stats SUPABASE_ACCESS_TOKEN`). `zsh scripts/mac/spx-credentials.sh parity` lists present/missing by name; `copy-from <laptop or macstudio>` pulls what this Mac lacks from the other, no value shown | `spx-check.sh` prints `keychain: MISSING`; no production count compare |
| Docker (MacBook, optional) | Docker Desktop running; then the working-copy block in [section 8](#8-data-work) | no local working copy |
| Production Supabase, read-only | nothing to set up: the public URL and key the site uses; `spx-check.sh` and the cloud hook both test it | no way to compare counts against production |
| Cloud environment variables | the `spx-stats env` note ([section 12](#12-secrets-and-the-environment)) | no tickets, no DS1 restore |
| Permission rules | Nothing to do: the deploy rules (`vercel deploy`, `link`, `ls`, `whoami`) are in the committed `.claude/settings.json`. The only per-machine step is `vercel login` (or the Vercel connector) | an agent deploy is refused; credential reads are still refused and John runs those blocks himself |

Then check: `cd web && pnpm task` lists tickets, `vercel whoami` prints `spxis`, and the private file's DS1 `psql`
line answers.

**Rebuilding a wiped Mac:** the ordered checklist, one command per step, is in [scripts/mac/README.md](scripts/mac/README.md).

**Environment.** A cloud session should have these variable names set. Check with `echo ${NAME:+set}`, which never
prints the value. If one is missing, say which and carry on with what does not need it. Full list: [section 12](#12-secrets-and-the-environment).

| Name | Used for | Needed by |
|---|---|---|
| `SUMILABU_BOARD_URL`, `SUMILABU_BOARD_TOKEN` | the ticket board | `pnpm task` |
| `SPX_DS1_DB_PASSWORD`, `TS_AUTHKEY` | reaching DS1 over Tailscale (cloud only: a Mac uses the home LAN or Tailscale itself) | the session-start hook |
| `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN` | archive uploads | `scripts/dropbox_put.py` |
| `SUPABASE_ACCESS_TOKEN` | data releases and production reads | `scripts/release/release.py`, `scripts/sync/compare.py` |

**MCP servers** a cloud session normally has: Supabase (project `njpvfrceahkvnrduerkk`), Vercel (project
`prj_MfgGl5vzVccEhmtSyvgze6hhgXJg`), Dropbox, GitHub. Tested read-only: Supabase `execute_sql` and `list_migrations`,
Vercel `get_project` and `list_deployments`, Dropbox `fetch`, `list_folder` and `search`. Vercel `list_teams` returns
nothing; pass the team id directly ([section 7](#7-deploying)).

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
([section 8](#8-data-work), item 8).

**On one of John's Macs** (new or existing; no cloud container). One command sets it up:
`zsh scripts/mac/spx-credentials.sh setup` with the variables the private file gives (tested on the MacBook,
keychain path; the Dropbox path is **untested** end to end). It copies the DS1 password and the board key from his
synced Dropbox into the keychain and prints one ok/FAIL line each for DS1, board, node, pnpm and gh. After that
`pnpm task` reads the board key from the keychain by itself, and DS1 answers with `psql` on the home LAN or over Tailscale (the scripts try both).
The MacBook reaches DS1 over the home LAN or Tailscale and runs Docker; the Mac Studio is reached over ssh.
Agents may not read the Dropbox key files or another Mac's keychain (the permission check refuses it): give John
the command from the private file instead.

**Is it alive?** Four checks, seconds each:

    pg_isready -h /tmp -p 55432                                      # cloud working copy (MacBook: the Docker container)
    cd web && pnpm task                                              # board list (section 5)
    curl -s -o /dev/null -w "%{http_code}\n" https://spxn.com/       # 200
    # Supabase MCP execute_sql, project njpvfrceahkvnrduerkk: select count(*) from core.game

## 5. Tickets

The queue is the spx-stats board on Sumilabu (`api.sumilabu.com`, project key `spx-stats`), the same board UmaKuma and
Itsutsu use. Run from `web/`. It needs Node 22.18 or newer (it runs the `.ts` file directly) and **no** `pnpm install`
(tested). `SUMILABU_BOARD_URL` and `SUMILABU_BOARD_TOKEN` come from the environment and are never written to a file, a
log or a commit.

**Where the board is — and is not.** It lives only on Sumilabu under project key `spx-stats`, reached through
`pnpm task` (or the raw JSON read below). It is **not** a file in this repository and **not** a GitHub Issue or
Project: this repository keeps its Issues and Projects empty on purpose, so an empty issues page is **not**
"no board". To read the unfinished rows without the CLI, make the same request `pnpm task` makes:

    curl -s -H "authorization: Bearer $SUMILABU_BOARD_TOKEN" -H "accept: application/json" \
         "$SUMILABU_BOARD_URL/api/v1/projects/spx-stats/tickets?unfinished=1"

The token comes from the environment, or on a Mac from the keychain item `sumilabu board spx-stats`
(`security find-generic-password -s "sumilabu board spx-stats" -w`); never print it, log it or write it
anywhere. A `200` with a `tickets` array means the board is healthy.

    pnpm task                                                   # list: waiting, in progress, stale holds
    pnpm task add "<title>" --detail "<what and why>" --by "<who>" [--bug|--chore]
    pnpm task claim <id> "<who>"                                # the whole cuid, never a prefix
    pnpm task release <id> --by "<who>"
    pnpm task done <id> --by "<who>" --version "<short commit sha>" [--entry "<deployment id or note>"]
    pnpm task drop <id> --by "<who>"     /     pnpm task reopen <id> --by "<who>"
    pnpm task grade <id> --priority high|normal|low|none --effort small|medium|large|none

- Order: file it, claim it, build it, deploy it, then `done`. File **before** starting work.
- A title is 8 to 120 characters, detail up to 4000, and every write names an actor (`--by`, or the name after `claim`).
- A hold lasts six hours and a live hold is not taken over; a lapsed one shows as "stale hold" and `claim` takes it.
- `done` is the only way to finish a ticket. If you stop, `release` it.
- `/tickets` on the site is a read-only view of the board. It answers 404 unless `TICKETS_PAGE=1`, which must never be
  set in production (the board has no read-only key and tickets may hold internal notes).

**The board works** (checked 2026-10-11: the `spx-stats` key returns 200 from John's Mac and from the cloud
environment). The first eight tickets are filed; list them with `pnpm task`. A ticket's kind defaults to feature; the
CLI has no `--kind` option, only `--bug` and `--chore`.

If `pnpm task` says "Sumilabu refused the board key" (401), do not retry in a loop. The cause is usually Sumilabu not
redeployed after `BOARD_TOKENS_JSON` changed: that variable is write-only, saving replaces the whole map, and a
prebuilt Vercel deployment ignores new env vars. Sumilabu deploys through GitHub Actions (workflow
`vercel-deploy.yml`), so John re-runs it; the command and the map rebuild script are in the private file. Tell the
coordinating session, put the ticket in a new create-only Dropbox file
`/Backups/spx-stats/tickets-pending-<date>-<letter>.md`, and carry on.

## 6. Doing the work

    git worktree add ../<name> -b work/<name> origin/main     # or use your harness's worktree
    cd web && pnpm install --frozen-lockfile                  # about 10 seconds (tested)
    pnpm dev                                                  # http://localhost:3100, no .env needed

This project owns local ports **3100-3199** (John's port table): dev on 3100, worktrees and test servers 3101 and up
(check `lsof -iTCP:<port> -sTCP:LISTEN` first). Never 3000-3099 or another project's block; give every server and
headless-browser base URL an explicit port.

No `.env` is needed: the defaults point at the live Supabase project's public read-only key.

**Checks before every push**, in `web/`, in this order (all tested green, about two minutes in total):

    pnpm lint
    pnpm exec next typegen        # first on a fresh checkout
    pnpm exec tsc --noEmit
    pnpm build

On a fresh checkout `tsc` fails with "Cannot find name 'PageProps'" until `next typegen` (or a build or dev run) has
generated the route types. That is not a bug in your change.

**Release.** A release is a commit on `main` that is deployed. What you pass to `pnpm task done --version` is the short
commit sha. The site version is `version` in `web/package.json` (semantic versioning, starting from 0.47.0); the site
footer shows it with the short commit sha. There is no changelog file.

- **Major:** a breaking change to the site or its data contract.
- **Minor:** each feature a reader sees, including a new league or a new source of data shown on the site.
- **Patch:** fixes and data-only corrections.
- Tooling, docs and ops work (board, Dropbox, Mac setup, agent instructions): patch, or no bump when the site is unchanged.

**Commit and push.** Keep each change small, one feature to a commit.

    git add <files by name>
    git -c user.name="John Morris" -c user.email="john@spxis.com" commit -m "feat(area): what it does"   # subject <= 50
    git fetch origin && git rebase origin/main     # then recheck: lint, typegen, tsc, build if main moved
    git push origin HEAD:main                      # fast-forward only; never force

A push to `main` deploys nothing.

## 7. Deploying

The agent that finished and pushed a feature deploys it. The coordinating session deploys only when asked. Deploy only
a commit that is on `origin/main` and passed the checks above; a deployment carries everything on `main`, not just
your commit.

**Deploy** with the Vercel MCP `create_deployment` (the way earlier production deployments were made):

    teamId: team_3B0yHsuwmVZw2RDT0ar7k07l      (slug spxis-projects-0d6306b4)
    requestBody:
      name: "spx-stats"
      project: "prj_MfgGl5vzVccEhmtSyvgze6hhgXJg"
      target: "production"
      gitSource: { type: "github", org: "spxis", repo: "spx-stats", ref: "main", sha: "<full commit sha>" }

**Without the Vercel connector** (on a Mac with `vercel login` done), deploy a clean copy of the commit, never the
working checkout (worktrees and other agents' files would be uploaded). It waits until the deployment is ready:

    D=$(mktemp -d) && git archive <sha> | tar -x -C "$D" && cd "$D" && \
    vercel link --yes --project spx-stats --scope spxis-projects-0d6306b4 >/dev/null && \
    vercel deploy --prod --yes --scope spxis-projects-0d6306b4; cd ~ && rm -rf "$D"

Tested 2026-10-11 (about a minute; it prints nothing until the build is done). `vercel link` writes a short-lived
token to `.env.local` in that temporary copy; Vercel does not upload it and the last step deletes the copy.

The agent that pushed the feature deploys it itself: the connector if present, otherwise the CLI block above, run from
the temporary copy as shown (or with `--cwd` pointing at it), never from the working checkout. The allow rules are in
`.claude/settings.json`. If a deploy is still refused, report the exact block to the coordinating session (John runs
it). Never edit permission settings yourself.

Add `forceNew: "1"` if Vercel reuses an earlier deployment of the same commit. The project is `nextjs`, root
directory `web`, Node 22.x. The call itself is **untested** (past deployments and the project settings were read and
match). If the permission check refuses it, stop and report the exact call to the coordinating session.

**Confirm READY.** The build takes a minute or two. Do not poll in a loop; look a few times:

    get_deployment   idOrUrl: <dpl_… id from the create result>   -> readyState READY (ERROR: read the build log)
    list_deployments projectId: prj_MfgGl5vzVccEhmtSyvgze6hhgXJg, target: production, limit: 3
                     -> newest entry is READY and meta.githubCommitSha is your commit

**Then check once**, on the real domain (the `*.vercel.app` URLs sit behind Vercel login):

    curl -s -o /dev/null -w "%{http_code}\n" https://spxn.com/
    curl -s -o /dev/null -w "%{http_code}\n" https://spxn.com/<the page you changed>

Look at the page itself for anything fetched from the database (a "Couldn't load" message means the fetch failed).
Then `pnpm task done <id> --by "<who>" --version "<short sha>"`.

**Roll back.** Find the last good deployment (`list_deployments` with `rollbackCandidate: true`, state READY), then
`request_rollback` with `projectId: prj_MfgGl5vzVccEhmtSyvgze6hhgXJg`, `deploymentId: <that dpl_ id>`,
`teamId: team_3B0yHsuwmVZw2RDT0ar7k07l`, `description: "<why>"`. This reverts the site only, never the database.
Then fix forward on `main`, redeploy, and tell John.

## 8. Data work

The short, plain-language version of this section is [`docs/data-flow.md`](docs/data-flow.md).

**Where data lives.**

- **DS1** (Postgres in Docker on John's Synology NAS, reached on the home LAN or over Tailscale; the LAN and Tailscale addresses are in `scripts/mac/spx-checks.sh`) is the
  permanent **source of truth**: all `legacy_*` schemas, `legacy_files.raw_archive`, `core`, `meta`, `ref`, `api`.
- **Dropbox** `/Backups/spx-stats/raw/<source>/<year or date>/` holds a hard copy of every raw download.
- **Production** is Supabase project `njpvfrceahkvnrduerkk`: a published subset (schemas meta, ref, core and api only;
  no `legacy_*`), changed only by approved data releases (item 5). It is on a 500 MB plan and held 347 MB on 2026-10-11. Read it any time
  with the Supabase MCP `execute_sql` (tested).
- Any other Postgres (the cloud session's port 55432, the MacBook Docker container in item 8) is a temporary
  **working copy**. Its work counts only once it is on DS1.
- Order: download, archive row and `legacy_<source>` load on DS1, Dropbox copy, `core` build, counts checked on DS1,
  then a data release to production.
- **Ongoing scores** (the season in progress, all five leagues) come from English Wikipedia's club-season articles, with nflverse
  as the NFL's second check: `scripts/daily/run.py --apply` writes them to DS1 only (see `scripts/daily/README.md`). The NHL API
  and MLB statsapi are not used for new scores.
- **Venue names and facts** (every name a home venue carried with its years, plus capacity, opened, owner, surface, roof, address) come
  from Wikidata (CC0) and the "Former names" of English Wikipedia infoboxes (CC BY-SA). Refresh once a year (February) or after a
  rename: the command list is in `scripts/wikidata_venues/README.md`; production gets `core.brand_venue_name` and
  `core.brand_venue_info` through a data release (item 5), after migration 052 is on production.
- **The rule: DS1 first, then production.** Production is a copy of DS1 and never holds a row DS1 lacks. The nightly
  drift check (item 5) compares them by primary key and row hash; `scripts/sync/compare.py` (see `scripts/sync/README.md`)
  is the same comparison by hand. Rows found only in production are removed only by a release John approved.

**For agents:** never write production by hand. Write data to your own local copy and hand the coordinating session the DS1
steps (SQL files under `db/`). The coordinating session applies them with `bash scripts/mac/ds1-apply.sh <file> [--dry-run]`
(only files under `db/`), then prepares a data release that John approves at `/admin/data`. A schema migration still needs
applying to production (item 4) before the release that fills it. DS1 has the nologin roles `anon` and `authenticated`, so
migrations with grants apply unchanged.

**Schemas:** `legacy_*` raw, one per source; `core` the curated history; `meta` sources, verification, data issues;
`ref` sports, leagues, countries; `api` read-only views served by PostgREST (`api.refresh()` refreshes the
materialised ones, including `api.player_index`, the players list; `db/build/190_player_index.sql` refreshes it after a
core rebuild; the release runner runs `select api.refresh();` after each release).

1. **Archive first.** Every raw download goes into DS1's `legacy_files.raw_archive` (name, saved_on, sha256, data bytea)
   before it is loaded, and a hard copy goes to Dropbox, both before anything is loaded to production. The Mac export
   script (`scripts/mac/spx-raw-export.sh`, section 12) copies DS1's archive rows into the local Dropbox folder;
   `scripts/dropbox_put.py` uploads directly:
   `python3 scripts/dropbox_put.py <file> <source> [<date>]` writes `/Backups/spx-stats/raw/<source>/<date>/<file>`
   (any size, binary included, create only, never overwrites, hash verified). `--from-archive` uploads archived rows
   Dropbox does not hold yet (`--dry-run` lists them; `--min-bytes 0` includes small ones). It needs the three
   `DROPBOX_*` variables (**untested**); if they are missing, say so and keep going, because the archive row is still
   the record. The Dropbox MCP is not an alternative for data: it takes inline text only (no binary, no big files; a
   truncated upload has happened), and an agent write through it needs John's own confirmation in chat, not a relayed
   one.
2. **Load season by season** (or award by award), so the database shows progress as it goes, into a `legacy_<source>`
   schema with a script under `scripts/<source>/`. Raw is kept as it came.
3. **Build `core`** from raw with rerunnable steps in `db/build/NNN_*.sql`, matched by stable keys.
   - `scripts/build_core.sh` runs them all. Step 100 recreates franchises and team seasons, so every enrichment must
     be a build step, never a one-off update.
   - Unfinished steps go in `db/build/pending/`, which the build ignores.
   - Never run `build_core.sh` while another agent is loading.
4. **Migrations** (a new table or column): write `db/migrations/NNN_name.sql`, apply it to the working copy, then to
   DS1 (item 8), then to production with the Supabase MCP `apply_migration` (`project_id` above, `name` in snake_case, `query` the file),
   **before** any load. `list_migrations` shows what production has. Numbers 030 and 031 are each used by two files:
   apply by file name and check `list_migrations` first. Take the next free number after `git fetch && git rebase origin/main`;
   `scripts/check_migration_numbers.sh` must pass before push (it allows only the 030 and 031 duplicates).
5. **Production changes only through data releases.** DS1 is the only place data is written; a release makes production
   match DS1 for the tables you name. Never load, update or delete production by hand.
   - **Prepare:** `python3 -I scripts/release/release.py prepare --title "<what>" --tables core.game,core.team_season [--ticket ..]
     [--replace]` (needs DS1 and `SUPABASE_ACCESS_TOKEN`). It runs `db/checks/*.sql` on DS1, compares the tables by key and
     writes a pending numbered release (for example `2026.10.12-1`) with a preview: rows to add, change and remove,
     size change, blockers. Fix every blocker first. A table shrinking by more than 5 percent needs `--replace`.
   - **Approve:** John approves or rejects at `/admin/data` on his phone. Nothing else can approve.
   - **Apply:** the runner on the NAS (`runner/README.md`) runs approved releases within a minute: it re-checks, snapshots
     the rows it will change (gzip TSV on the NAS and schema `backup_release_<id>` on DS1, never in production), applies
     all tables in one transaction, verifies production equals DS1 and marks the release done or failed (production is
     then unchanged if the apply itself failed). Once an apply has committed, `api.refresh()` always runs, even when verification
     fails and the snapshot is restored; the result records `refresh`. `release.py rollback --release <number>` prepares an undo that John approves the same way.
   - A schema change (new table or column) is a `ds1_step` release (`prepare --kind ds1_step --file db/migrations/NNN.sql`,
     committed and pushed first), then the same migration on production (item 4) before the release that fills it.
   - A nightly drift check compares every table, shows the result at `/admin/data` and proposes a fix release when
     production differs from DS1; it never approves anything.
   - Emergency only, with John's OK in chat: fix DS1 first, then make the hand fix through the Supabase MCP
     `execute_sql`, then run the drift check (`release.py drift`) and confirm it is clean. Never `truncate`, never
     `load.py --replace`, never a full load.
   - `scripts/sync/compare.py` is still the read-only comparison (and what the release code reuses).
   - **Daily scores** (`scripts/daily`, later live scores) are reported to DS1, never written to `core.game` directly: they call
     `ingest.report_results(jsonb)` (migrations 044 and 046; login role `ingest_writer` can execute that one function and nothing
     else; the game state machine and "final is terminal" live in it). History, rebuilds and new seasons stay bulk. A Docker job on the
     NAS (`daily/README.md`) runs `run.py --apply` once a day at 10:00 ET and leaves a heartbeat row in `ingest.daily_run` (DS1 only).
     The function is not installed on production: production gets those results like any other data, in a release. The job's hook
     (`scripts/daily/release_hook.py`, off unless `DAILY_PREPARE_RELEASE=1`) prepares that release (the auto lane when only scores tables changed and `DAILY_RELEASE_KIND=daily_scores`, else a normal release "(needs review)"); otherwise the nightly drift check
     proposes it.
   - **Automatic approval (daily scores only):** the daily job prepares with
     `python3 -I scripts/release/release.py --by daily-job prepare --kind daily_scores [--title ".."]` (tables default to
     `core.game,meta.verification,meta.data_issue`). The runner approves it as `auto:daily-scores`, 10 minutes after it was
     prepared, only if games change just in status, score and overtime/shootout fields, only on games not final in production,
     no inserts or deletes, at most 500 games, verification/data issue rows are new rows about those games (the one exception: an existing `wikipedia_daily` game issue
     about a changed game may change only `resolution` and `resolved_at`), and all checks pass;
     it re-checks the policy before applying. Anything else stays pending for John, with the reasons at `/admin/data`. John can
     Hold a release, or "Hold all auto-approvals" (migration 047); the runner also sets that switch itself when an automatic
     release fails or the drift check finds rows an automatic release wrote changed. Never approve a release yourself.
   - **Requests from `/admin/data`** (migration 053, `scripts/release/README.md`): an admin's "Request scores update" (Settings) or
     "Check now" (Drift) writes one row in `meta.score_update_request`; the runner's once-a-minute run does the work. A scores request
     runs `scripts/daily/run.py --apply` on DS1 under the shared lock (`scripts/release/daily_lock.py`) and approves the release it
     prepares as `request:<admin>` only if the auto-approval policy passes and Hold is off. Never write to that table by hand.
6. **After every release:** the runner verifies, refreshes `api` (`api.refresh()`), re-compares that release's tables into
   `meta.sync_status` and makes one POST to the site's `/api/revalidate` (`REVALIDATE_URL`, `REVALIDATE_SECRET`) so the changed pages
   refresh now; look at one affected page on spxn.com.
7. **Season notes** (why a season was short, cancelled games, anything a reader should know) live in `core.season_note`,
   read by the site from `api.season_note`. To add or edit one: edit `db/seed/season_note.csv` (one row; `franchise_key`
   empty for the whole league, else `<source code>:<source key>`; EN required, FR and JA when known; `source` is a
   `meta.source` code, `source_url` the page), run `scripts/build_core.sh` or just `psql -f db/build/183_season_notes.sql`
   from the repo root, then publish `core.season_note` to production with a data release (item 5). Check one page on
   spxn.com (pages cache for an hour). Migration `033` creates the table.
8. **DS1 and working copies.** DS1 is permanent; cloud and Mac copies are temporary. Work done on a working copy
   (the cloud agent holds a lot of it) is pushed to DS1 before the production load and before the copy is discarded.
   Migrations and `db/build` steps are rerunnable SQL. Never apply anything over an existing DS1 database without
   asking John. The DS1 commands below are all **untested**.
   - **Cloud to DS1** (the sync direction stays): a cloud session pushes its new data to DS1 before its container is
     discarded. With Tailscale up and the `scripts/cloud/fwd.py` forwarder running (the session-start hook shows the
     paths), dump the changed schemas or tables and restore them into a **new** database on DS1 (or apply the
     rerunnable steps in a transaction, below); check counts, and ask John before replacing anything. The cloud
     container cannot be reached from outside, so this is always a push from the cloud.
   - **Apply to DS1** (from a session that reaches it: the cloud forwarder, or John's Mac): the coordinating session
     uses `bash scripts/mac/ds1-apply.sh <file.sql> [--dry-run]` (one file, one transaction, stops at the first error,
     prints row counts before and after; it reads `SPX_DS1_HOST` or finds DS1, and the password from the keychain).
     By hand, one step or migration
     in a single transaction, `psql -h <DS1 host> -p 55440 -U postgres -d spx_stats -1 -v ON_ERROR_STOP=1 -f <file>`.
     A full `build_core.sh` or a big load goes into a NEW database on DS1 (restore a dump of `spx_stats` into
     `spx_stats_new`, run there); compare counts, then ask John before swapping names. If your session cannot reach
     DS1, report the exact command as `NEED FROM YOU:`.
   - **Compare counts** for each table you touched (`select count(*) from core.game`, and so on): working copy, DS1,
     then production with the Supabase MCP `execute_sql`.
   - **MacBook working copy** (Docker, **untested**: the restore is in progress and not yet confirmed done):

         docker run -d --name spx-stats-local --restart unless-stopped -e POSTGRES_HOST_AUTH_METHOD=trust \
           -e POSTGRES_DB=spx_stats -p 127.0.0.1:55432:5432 -v spx-stats-pgdata:/var/lib/postgresql/data postgres:17-alpine

     `btree_gist` is included. Restore from DS1 with the dump piped from inside the container; the password comes
     from the keychain item `spx-stats-db DS1 55440` and is never printed. Agents may not read the keychain, so John
     runs this (the DS1 host is in the private file):

         docker exec -e PGPASSWORD="$(security find-generic-password -s 'spx-stats-db DS1 55440' -w)" spx-stats-local \
           pg_dump -h <DS1 host> -p 55440 -U postgres -d spx_stats -Fc | \
           docker exec -i spx-stats-local pg_restore -U postgres -d spx_stats --no-owner

     Connect with `psql -h 127.0.0.1 -p 55432 -U postgres -d spx_stats`. To refresh, apply any unsynced work to DS1
     first, then remove the container and the `spx-stats-pgdata` volume and run both blocks again.

Ask John before deleting or overwriting data. Production changes only through approved data releases; anything else needs John's OK.

## 9. The website

- **`web/`** is the site: Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Zod 4, d3, pnpm.
  - Read `web/node_modules/next/dist/docs/` before writing Next.js code: this version differs from older ones.
  - Data comes from PostgREST (`Accept-Profile: api`) through server fetches with `next: { revalidate: 3600 }`,
    validated with Zod. A failed fetch shows an inline "Couldn't load" message.
- **`site/`** is the retired plain-JS site; don't add to it.
- **Languages:** EN, FR and JA through `web/src/lib/i18n` (`say('key')`, `currentSpeaker()` / `useSpeaker()`, cookie
  `spxn-locale`).
  - All new UI text goes into `web/src/lib/i18n/phrases.constants.ts` with a best-guess French
    (`dictionaries/fr.constants.ts`) and Japanese (`dictionaries/ja.constants.ts`) entry. No native review is needed
    first; note doubts in `web/I18N_TODO.md`.
  - Proper names (teams, players, venues, award names, league codes) are not translated.
- **John's packages,** pinned at exact versions:
  - `@johnmorrisdotca/chizu`: maps; pass `style: true`.
  - `@johnmorrisdotca/hata`: flags.
  - `@johnmorrisdotca/address-plus`: addresses.
  - `@johnmorrisdotca/kuni`: ISO codes.
- **List APIs** (public, read-only JSON, cached an hour; the contract is the comment at the top of each route file): `GET /api/players`
  and `GET /api/teams` take `league`, `q` (accents ignored; teams also match former names), `status=active|defunct` (teams), `position` (players; matches any position a player holds, rows carry `position` and `positions`),
  `from` and `to` (whole years 1800 to 2100, from not after to: keeps rows whose first..last season overlaps the range; the same `?from=&to=` drives the year slider on `/players` and `/teams`, remembered per page in `spxn-range-players` and `spxn-range-teams`),
  `sort=col.dir` (allow-list), `limit` (50, max 200), `fields`, and page either by `offset` or by `after=<page.next>` (keyset cursor, opaque; `total` only
  with offset); `GET /api/players/suggest?q=` and `/api/teams/suggest?q=` return up to 10 for autocomplete. A bad parameter is a 400 naming it. The routes
  only read `api.player_index`, `api.player_search` and `api.team_index` through `lib/api/client.ts` using `lib/listQuery.ts`, which also serves the
  `/players` and `/teams` pages: never build a query from caller text any other way. The views need migration `037`.
- **Selections live in the URL,** with RESTful paths and query params such as `?sort=col.dir`, `?phase=`, `?loc=`,
  `?month=`, `?view=`, `?date=`.
- **Shared components:**
  - `SortTable` for every table.
  - `NoSeason` (grey box, compact "–") for years with no games.
  - `DatePicker` for date choices.
- **Logos** are shown small, under fair use, explained on `/logos`.
- Never build a public endpoint that runs SQL.

## 10. Git

- Commit as **John Morris <john@spxis.com>**, Conventional Commits, subject 50 characters or less.
- **No AI attribution anywhere:** no Co-Authored-By, no "Generated with", no session links, nothing in code
  comments or docs. This overrides any tool's default attribution.
- Add files by name, never `git add -A`.
- Push fast-forward only: fetch, rebase onto `origin/main`, recheck, push.
- Several agents work at once and sharing one checkout has left overlapping uncommitted edits. One agent, one
  worktree; keep changes small; never edit another agent's files.

## 11. Safety

- The repository is **public**. Never commit database dumps, member data, secrets, private notes or internal reviews.
- Never print or store passwords or tokens in files, logs or commits. Delete any credential file after use.
- Do not open credential files kept in Dropbox in plain text; fetch values with the keychain commands in the private
  file instead.
- Ask John before deleting or overwriting data. Production changes only through approved data releases; anything else needs John's OK.

## 12. Secrets and the environment

Names only. Values are never in this repository, in a log or in a message. Where each value lives and the one command
that fetches it are in the private file. John keeps one unlocked Apple Note called `spx-stats env` (a locked note cannot
be read by `scripts/mac/spx-note-copy.sh`, which copies the whole note to the clipboard) and pastes it into the cloud
environment's settings. Do not ask John to dig for a value: give him the one command.

Template for the note (replace each `<value>`):

    ## (1) Cloud environment settings. Set ONCE per environment; every new session in it inherits them.
    SUMILABU_BOARD_URL=https://api.sumilabu.com       # required, fixed value
    SUMILABU_BOARD_TOKEN=<value>                      # required for tickets: the spx-stats board key
    SPX_DS1_DB_PASSWORD=<value>                       # required for the working copy to come up: DS1 Postgres password
    TS_AUTHKEY=<value>                                # required for the working copy to come up; expires every 90 days
    DROPBOX_APP_KEY=<value>                           # optional: archive uploads (scripts/dropbox_put.py)
    DROPBOX_APP_SECRET=<value>
    DROPBOX_REFRESH_TOKEN=<value>
    SUPABASE_ACCESS_TOKEN=<value>                     # optional: bulk production loads only

    ## (2) Vercel only (project "Sumilabu", not the cloud environment). Agents never see it.
    BOARD_TOKENS_JSON=<value>                         # write-only: saving REPLACES the whole map; rebuild, then redeploy

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

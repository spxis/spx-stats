# spx-stats: agents start here

The historical record of the NHL, NBA, MLB, NFL and CFL, browsable at https://spxn.com
("SPXN · SPX Stats Network"). The owner is John Morris. Read this whole file before working.

This is one of exactly two places that hold agent instructions:

1. **This file** (public): rules and commands. It has variable names only, never values.
2. **Dropbox `/Backups/spx-stats/START-HERE.md`** (private): where things live, how to fetch each credential, current
   status, the ticket ids, open work, lessons. Read it right after this file with the Dropbox MCP `fetch`.

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
- File a ticket before starting work. Archive raw data before loading it. Never write to production without
  reading [section 8](#8-data-work).
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
- Never ask him to paste a secret into chat. No wildcard or guessed paths: look every name up first. Test scripts
  before handing them over and say what is untested.
- He is at his Mac Studio (Terminal) most of the time with Tailscale off, because it breaks his Dropbox sync. Do not
  make him turn it on there. His MacBook runs with Tailscale on and Dropbox still syncs; there DS1 is reached directly.
- He wants features published as they are finished, and work done by Sonnet agents.
- When a command works, add it to the private file so the next session does not ask again.

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

**Environment.** A cloud session should have these variable names set. Check with `echo ${NAME:+set}`, which never
prints the value. If one is missing, say which and carry on with what does not need it. Full list: [section 12](#12-secrets-and-the-environment).

| Name | Used for | Needed by |
|---|---|---|
| `SUMILABU_BOARD_URL`, `SUMILABU_BOARD_TOKEN` | the ticket board | `pnpm task` |
| `SPX_DS1_DB_PASSWORD`, `TS_AUTHKEY` | reaching DS1 over Tailscale | the session-start hook |
| `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN` | archive uploads | `scripts/dropbox_put.py` |
| `SUPABASE_ACCESS_TOKEN` | bulk production loads | `scripts/supabase/load.py`, `scripts/players/prod_load.py` |

**MCP servers** a cloud session normally has: Supabase (project `njpvfrceahkvnrduerkk`), Vercel (project
`prj_MfgGl5vzVccEhmtSyvgze6hhgXJg`), Dropbox, GitHub. Tested read-only: Supabase `execute_sql` and `list_migrations`,
Vercel `get_project` and `list_deployments`, Dropbox `fetch`, `list_folder` and `search`. Vercel `list_teams` returns
nothing; pass the team id directly ([section 7](#7-deploying)).

**Local database.** Postgres 17, socket `/tmp`, port 55432, database `spx_stats`, data dir
`/home/user/spxwork/pg17` (owned by the `postgres` user). Check it:

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
`DRY_RUN=1 bash scripts/cloud/session-start.sh` (tested). The real run is **untested**. DS1's copy is refreshed by hand
and can be a day or more behind the last cloud database, so a fresh container can lack recent legacy data: the private
file says how far behind.

**On one of John's Macs** (new or existing; no cloud container, no local database). One command sets it up:
`zsh scripts/mac/spx-credentials.sh setup` with the three variables the private file gives (tested on the MacBook,
keychain path; the Dropbox path is **untested** end to end). It copies the DS1 password and the board key from his
synced Dropbox into the keychain and prints one ok/FAIL line each for DS1, board, node, pnpm and gh. After that
`pnpm task` reads the board key from the keychain by itself, and DS1 answers with `psql` while Tailscale is on.
Agents may not read the Dropbox key files or another Mac's keychain (the permission check refuses it): give John
the command from the private file instead.

**Is it alive?** Four checks, seconds each:

    pg_isready -h /tmp -p 55432
    cd web && pnpm task                                              # board list (section 5)
    curl -s -o /dev/null -w "%{http_code}\n" https://spxn.com/       # 200
    # Supabase MCP execute_sql, project njpvfrceahkvnrduerkk: select count(*) from core.game

## 5. Tickets

The queue is the spx-stats board on Sumilabu (`api.sumilabu.com`, project key `spx-stats`), the same board UmaKuma and
Itsutsu use. Run from `web/`. It needs Node 22.18 or newer (it runs the `.ts` file directly) and **no** `pnpm install`
(tested). `SUMILABU_BOARD_URL` and `SUMILABU_BOARD_TOKEN` come from the environment and are never written to a file, a
log or a commit.

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
    pnpm dev                                                  # http://localhost:3000, no .env needed

No `.env` is needed: the defaults point at the live Supabase project's public read-only key.

**Checks before every push**, in `web/`, in this order (all tested green, about two minutes in total):

    pnpm lint
    pnpm exec next typegen        # first on a fresh checkout
    pnpm exec tsc --noEmit
    pnpm build

On a fresh checkout `tsc` fails with "Cannot find name 'PageProps'" until `next typegen` (or a build or dev run) has
generated the route types. That is not a bug in your change.

**Release.** There is **no version, changelog or timeline file**. A release is a commit on `main` that is deployed;
nothing to stamp. What you pass to `pnpm task done --version` is the short commit sha.

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

**Production is Supabase project `njpvfrceahkvnrduerkk`** (schemas meta, ref, core and api only; `legacy_*` stays local
and on DS1). It is on a 500 MB plan and held 347 MB on 2026-10-11. Read it any time with the Supabase MCP `execute_sql`
(tested). The local database is the full truth.

**Schemas:** `legacy_*` raw, one per source; `core` the curated history; `meta` sources, verification, data issues;
`ref` sports, leagues, countries; `api` read-only views served by PostgREST (`api.refresh()` refreshes the
materialised ones).

1. **Archive first.** Every raw download goes into `legacy_files.raw_archive` (name, saved_on, sha256, data bytea)
   before it is loaded, and right after that to Dropbox:
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
4. **Migrations** (a new table or column): write `db/migrations/NNN_name.sql`, apply it to the local database, then to
   production with the Supabase MCP `apply_migration` (`project_id` above, `name` in snake_case, `query` the file),
   **before** any load. `list_migrations` shows what production has. Numbers 030 and 031 are each used by two files:
   apply by file name and check `list_migrations` first.
5. **Production loads are insert-only**: `insert … on conflict do nothing`, never `truncate`, never `load.py --replace`.
   - The pattern is `scripts/players/prod_load.py` (reads local rows, sends batches through the Management API,
     resets identity sequences, has `--dry-run`). It needs `SUPABASE_ACCESS_TOKEN`, which agents don't normally have,
     so a production load is usually run by the coordinating session or John.
   - `scripts/supabase/load.py` refuses before writing if production lacks a table or column the local database has;
     never bypass that. A full `--replace` load once failed halfway and left the site empty (it empties each table, and
     by cascade its children, before refilling), so load only the tables you changed (`load_table`).
   - The auto-mode permission check often refuses production loads from agents even after John approves in chat,
     because agents don't see his messages. If refused, stop and report the exact command; the coordinating session
     runs it once John approves. Small fixes can go through the Supabase MCP `execute_sql`.
   - Never run a full load while agents are changing the local schema.
6. **After every load:** `select api.refresh();`, compare counts local against production for what you loaded, and
   look at one affected page on spxn.com.
7. **DS1** (John's Synology NAS, on Tailscale; addresses in the private file) keeps a full copy including `legacy_*`.
   **Refreshing it is manual and not scripted** (**untested**), and the session-start hook restores a fresh container
   from it. Direction is cloud to DS1 only: connections into the cloud container do not work, and the Mac cannot pull
   from it. With Tailscale up and the `scripts/cloud/fwd.py` forwarder running (the session-start hook shows the paths),
   dump the local database and restore it into a **new** database on DS1, never over the old one; check counts, and ask
   John before replacing anything.

Ask John before deleting or overwriting data, and before any write to production that is not a routine load.

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
- Ask John before deleting or overwriting data, and before any write to production that is not a routine load.

## 12. Secrets and the environment

Names only. Values are never in this repository, in a log or in a message. Where each value lives and the one command
that fetches it are in the private file. John keeps one unlocked Apple Note called `spx-stats env` (a locked note cannot
be read by `scripts/mac/spx-note-copy.sh`, which copies the whole note to the clipboard) and pastes it into the cloud
environment's settings. Do not ask John to dig for a value: give him the one command.

Template for the note (replace each `<value>`):

    ## (1) Cloud environment settings. Set ONCE per environment; every new session in it inherits them.
    SUMILABU_BOARD_URL=https://api.sumilabu.com       # required, fixed value
    SUMILABU_BOARD_TOKEN=<value>                      # required for tickets: the spx-stats board key
    SPX_DS1_DB_PASSWORD=<value>                       # required for the database to come up: DS1 Postgres password
    TS_AUTHKEY=<value>                                # required for the database to come up; expires every 90 days
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
`pg_isready -h /tmp -p 55432`, `psql -h /tmp -p 55432 -U postgres -d spx_stats -c 'select 1'`, and `cd web && pnpm task`.
Raw downloads: `python3 scripts/dropbox_put.py <file> <source>`; the backlog:
`python3 scripts/dropbox_put.py --from-archive`. On John's Mac,
`~/bin/spx-raw-export.sh` (`scripts/mac/spx-raw-export.sh`; `--check` first, `--install-schedule` for an hourly run) copies
every `legacy_files.raw_archive` row from DS1 into `~/Library/CloudStorage/Dropbox/Backups/spx-stats/raw/<name>`: it finds
DS1 on the home network or Tailscale, skips files already there with the same sha256, never overwrites a different one,
and reports problems. Its stub tests are `scripts/mac/test/spx-raw-export-test.sh` (run them after any change to it).

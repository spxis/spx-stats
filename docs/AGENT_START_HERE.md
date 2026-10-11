# Agent start here

The cold-start checklist for a new agent. Rules live in [AGENTS.md](../AGENTS.md) (read it first, all of it); this file
is the commands. Credential setup for a new cloud environment is in [NEW_AGENT_SETUP.md](NEW_AGENT_SETUP.md). There are
no secret values anywhere in the repository: only variable names.

Status words used below: **tested** means an agent ran it on 2026-10-11 and saw it work; **untested** means it is
written down but nobody has run it end to end; **manual** means a person or the coordinating session has to do it.

## 0. Rules in one breath

- Work in your own git worktree. Commit as John Morris <john@spxis.com>, Conventional Commits, subject 50
  characters or less, no AI attribution of any kind, add files by name, never `git add -A`.
- The repository is public: no dumps, member data, secrets, private notes or internal reviews.
- Never write to production without reading section 5. Never touch another agent's files.
- Talking to John: short bullets, no background. When you need something from him, the message leads with
  `NEED FROM YOU:` and has at most 3 bullets, each one action or one copy-paste command. Work out the command
  yourself before asking him for any step. See "Talking to John" in AGENTS.md.

## 1. Start

**Environment.** A cloud session should have these variable names set (check with `echo ${NAME:+set}`, which never
prints the value). The full list, with where each value comes from, is in NEW_AGENT_SETUP.md.

| Name | Used for | Needed by |
|---|---|---|
| `SUMILABU_BOARD_URL`, `SUMILABU_BOARD_TOKEN` | the ticket board | `pnpm task` |
| `SPX_DS1_DB_PASSWORD`, `TS_AUTHKEY` | reaching DS1 over Tailscale | the session-start hook |
| `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN` | archive uploads | `scripts/dropbox_put.py` |
| `SUPABASE_ACCESS_TOKEN` | bulk production loads | `scripts/supabase/load.py`, `scripts/players/prod_load.py` |

If one is missing, say which and carry on with what does not need it.

**MCP servers** a cloud session normally has: Supabase (project `njpvfrceahkvnrduerkk`), Vercel (project
`prj_MfgGl5vzVccEhmtSyvgze6hhgXJg`), Dropbox, GitHub. Tested read-only on 2026-10-11: Supabase `execute_sql`
and `list_migrations`, Vercel `get_project` and `list_deployments`, Dropbox `fetch` and `list_folder`.
Vercel `list_teams` returns nothing; pass the team id directly (section 4).

**Database.** The local working copy is Postgres 17 on socket `/tmp`, port 55432, database `spx_stats`. Check it:

    pg_isready -h /tmp -p 55432
    psql -h /tmp -p 55432 -U postgres -d spx_stats -Atc "select count(*) from core.game"   # 377384 on 2026-10-11

If it is down, **report it; do not start it** (worktree agents cannot run `su`; only the coordinating session starts
Postgres, with the command in AGENTS.md). On 2026-10-11 it was down inside a worktree agent's container.

**Session-start hook** (`.claude/settings.json` runs `scripts/cloud/session-start.sh`, cloud sessions only, in the
background). It installs and starts Postgres 17, joins Tailscale in userspace mode using `TS_AUTHKEY`, forwards DS1
through `scripts/cloud/fwd.py`, and restores DS1's dump into a new `spx_stats`. It does nothing when `spx_stats` already
has rows, and never drops or overwrites a database. Preview it, changing nothing: `DRY_RUN=1 bash scripts/cloud/session-start.sh`
(tested: the dry run prints the plan). The real run is **untested**. Two things to know: a fresh container gets
DS1's copy, which can be a day or more behind the last cloud database (see the newest private handover); and with no
`TS_AUTHKEY` it stops after starting Postgres, leaving no `spx_stats`.

**Is it alive?** Run all four; each takes seconds.

    pg_isready -h /tmp -p 55432
    cd web && pnpm task                      # board list (section 2)
    curl -s -o /dev/null -w "%{http_code}\n" https://spxn.com/        # 200
    # Supabase MCP execute_sql, project njpvfrceahkvnrduerkk: select count(*) from core.game

## 2. Tickets

The queue is the spx-stats board on Sumilabu (`api.sumilabu.com`, project key `spx-stats`). Run from `web/`. It needs
Node 22.18 or newer (it runs the `.ts` file directly) and **no** `pnpm install` (tested).

    pnpm task                                                   # list: waiting, in progress, stale holds
    pnpm task add "<title>" --detail "<what and why>" --by "<who>" [--bug|--chore]
    pnpm task claim <id> "<who>"                                # the whole cuid, never a prefix
    pnpm task release <id> --by "<who>"
    pnpm task done <id> --by "<who>" --version "<short commit sha>" [--entry "<deployment id or note>"]
    pnpm task drop <id> --by "<who>"     /     pnpm task reopen <id> --by "<who>"
    pnpm task grade <id> --priority high|normal|low|none --effort small|medium|large|none

What the board expects: a title of 8 to 120 characters, detail up to 4000, a named actor on every write (`--by`, or
the name after `claim`). A hold lasts six hours and a live hold cannot be taken over; a lapsed one is shown as "stale
hold" and `claim` takes it. `done` is the only way to finish a ticket, and it records the version you pass. Order:
file it, claim it, build it, deploy it, then `done`.

**State of the board key (last checked 2026-10-11):** the variables were set, and the board answered `401
unauthorized` to the key for `spx-stats` (and to a request with no key). The cause is not known; the likeliest is that
Sumilabu's `BOARD_TOKENS_JSON` was saved but not redeployed, or holds a different value. The client code against the
real board is therefore **untested**. If `pnpm task` says "Sumilabu refused the board key", do not retry in a loop:
write the ticket down in a new Dropbox file `/Backups/spx-stats/tickets-pending-<date>-<letter>.md` (create only, never
overwrite; see section 5 for Dropbox write rules), tell the coordinating session, and carry on with the work.

**Pending tickets** waiting for a working key are in Dropbox, `/Backups/spx-stats/tickets-pending-2026-10-11.md` and
`...-b.md` (seven in all). Read them with the Dropbox MCP `fetch` and file each with `pnpm task add`. The private
handover has the commands ready.

`/tickets` on the site is a read-only view of the board and answers 404 unless `TICKETS_PAGE=1`, which must never be
set in production.

## 3. Doing the work

    git worktree add ../<name> -b work/<name> origin/main     # or use your harness's worktree
    cd web && pnpm install --frozen-lockfile                  # about 10 seconds (tested)
    pnpm dev                                                  # http://localhost:3000, no .env needed

Read `web/node_modules/next/dist/docs/` before writing Next.js code; this Next differs from older versions.
No `.env` is needed: the defaults point at the live Supabase project's public read-only key.

**Checks before every push**, in `web/`, in this order (all tested green on 2026-10-11, about two minutes in total):

    pnpm lint
    pnpm exec next typegen        # first, on a fresh checkout; see below
    pnpm exec tsc --noEmit
    pnpm build

On a fresh checkout `tsc` fails with "Cannot find name 'PageProps'" until `next typegen` (or a build or dev run) has
generated the route types. That is not a bug in your change.

**Translations.** All new UI text goes into `web/src/lib/i18n/phrases.constants.ts` with a best-guess French
(`dictionaries/fr.constants.ts`) and Japanese (`dictionaries/ja.constants.ts`) entry. Doubts go in `web/I18N_TODO.md`.
Proper names are not translated.

**Release.** This repository has **no version number, no changelog and no timeline file**. A release is a commit on
`main` that is then deployed (section 4). Nothing to stamp. What you pass to `pnpm task done --version` is the short
commit sha.

**Commit and push.**

    git add <files by name>
    git -c user.name="John Morris" -c user.email="john@spxis.com" commit -m "feat(area): what it does"   # subject <= 50
    git fetch origin && git rebase origin/main     # then recheck: lint, typegen, tsc, build if main moved
    git push origin HEAD:main                      # fast-forward only; never force

A push to `main` deploys nothing. Keep each change small and one feature to a commit.

## 4. Deploying

The agent that finished and pushed a feature deploys it (John wants features published as they are finished). The
coordinating session deploys only when it has been asked to. Deploy only a commit that is on `origin/main` and that
passed the checks above; a deployment carries everything on `main`, not just your commit.

**Deploy** (Vercel MCP `create_deployment`; this is how earlier production deployments were made):

    teamId: team_3B0yHsuwmVZw2RDT0ar7k07l      (slug spxis-projects-0d6306b4)
    requestBody:
      name: "spx-stats"
      project: "prj_MfgGl5vzVccEhmtSyvgze6hhgXJg"
      target: "production"
      gitSource: { type: "github", org: "spxis", repo: "spx-stats", ref: "main", sha: "<full commit sha>" }

Add `forceNew: "1"` if Vercel reuses an earlier deployment of the same commit. The project is `nextjs`, root
directory `web`, Node 22.x. The call is **untested by the audit that wrote this** (it only read existing
deployments and the project settings, which matched). If the
permission check refuses it, stop and report the exact call to the coordinating session.

**Confirm it is READY.** The build takes a minute or two. Do not poll in a loop; look a few times:

    get_deployment  idOrUrl: <dpl_… id from the create result>   -> readyState READY (ERROR means read the build log)
    list_deployments projectId: prj_MfgGl5vzVccEhmtSyvgze6hhgXJg, target: production, limit: 3
                    -> newest entry is READY and meta.githubCommitSha is your commit

**After it is READY**, check a few pages once each, on the real domain. The `*.vercel.app` deployment URLs sit behind
Vercel login, so use spxn.com:

    curl -s -o /dev/null -w "%{http_code}\n" https://spxn.com/
    curl -s -o /dev/null -w "%{http_code}\n" https://spxn.com/<the page you changed>

Look at the page itself for anything fetched from the database (a "Couldn't load" message means the fetch failed).
Then `pnpm task done <id> --by "<who>" --version "<short sha>"`.

**Roll back.** Find the last good deployment (`list_deployments` with `rollbackCandidate: true`, state READY), then
Vercel MCP `request_rollback` with `projectId: prj_MfgGl5vzVccEhmtSyvgze6hhgXJg`, `deploymentId: <that dpl_ id>`,
`teamId: team_3B0yHsuwmVZw2RDT0ar7k07l`, `description: "<why>"`. This reverts the site only, never the database.
Then fix forward on `main` and redeploy. Tell John.

## 5. Data changes

**Production is Supabase project `njpvfrceahkvnrduerkk`** (schemas meta, ref, core and api only; `legacy_*` stays
local and on DS1). It is on a 500 MB plan and held 347 MB on 2026-10-11. Read it any time with the Supabase MCP
`execute_sql` (tested). The local database is the full truth.

1. **Archive the raw download first.** Insert it into `legacy_files.raw_archive` (name, saved_on, sha256, data
   bytea), then upload it to Dropbox: `python3 scripts/dropbox_put.py <file> <source> [<date>]`, which writes
   `/Backups/spx-stats/raw/<source>/<date>/<file>`, create only, hash-checked, any size. It needs the three `DROPBOX_*`
   variables (**untested**: it was not run end to end, and they were not set in the session that audited this).
   `python3 scripts/dropbox_put.py --from-archive --dry-run` lists archive rows Dropbox lacks. If the variables are
   missing, say so; the archive row is still the record, and the file waits for `--from-archive` later. The Dropbox
   MCP is not a substitute: it takes inline text only (no binary, no big files), and agent writes through it need John's own
   confirmation in chat.
2. **Load into a `legacy_<source>` schema, season by season**, with a script under `scripts/<source>/`.
3. **Build `core`** with a rerunnable step in `db/build/NNN_*.sql`; `scripts/build_core.sh` runs them all, and
   step 100 recreates franchises and team seasons, so every enrichment is a build step, never a one-off update. Never
   run it while another agent is loading.
4. **Migrations** (a new table or column): write `db/migrations/NNN_name.sql`, apply it to the local database, then
   to production with the Supabase MCP `apply_migration` (`project_id` above, `name` in snake_case, `query` the file).
   Do this **before** any load. `list_migrations` shows what production has. (Two numbers, 030 and 031, are each used
   by two files; apply by file name and check `list_migrations` first.)
5. **Production loads are insert-only**: `insert … on conflict do nothing`, never `truncate`, never `load.py
   --replace`. The pattern is `scripts/players/prod_load.py` (reads local rows, sends them in batches through the
   Management API, resets identity sequences, has a `--dry-run`). It needs `SUPABASE_ACCESS_TOKEN`, which agents do
   not normally have, so a production load is usually run by the coordinating session or John. The permission check
   often refuses agent loads even after John approves in chat. If refused, stop and report the exact command.
   Small fixes can go through the Supabase MCP `execute_sql`. Only load the tables you changed. `scripts/supabase/load.py`
   refuses before writing if production lacks a table or column the local database has; never bypass that.
6. **After every load:** `select api.refresh();` (Supabase MCP `execute_sql`), then compare counts local against
   production for what you loaded, and look at one affected page on spxn.com.
7. **DS1 sync is manual and not scripted.** DS1 (Tailscale 100.87.30.7, Postgres container `spx-stats-db`, port
   55440) holds a copy including `legacy_*`; refresh it after big loads. Push from the cloud container to DS1,
   never the other way: connections into the container do not work. With Tailscale up and
   `python3 scripts/cloud/fwd.py 15440 100.87.30.7 55440 &` running (it needs the tailscale paths used in
   the session-start hook), dump the local database and restore it into a **new** database on DS1 (not over the old
   one), check counts, and ask John before replacing anything. **Untested.** The Mac cannot pull from the container
   either, so the Mac's raw-file export to Dropbox cannot reach DS1 or the container without a Tailscale or
   firewall change by John.

Never collect member data (accounts, wagers, forums, surveys) or sensitive personal data. Don't guess values; log
holes. Ask John before deleting or overwriting data.

## 6. Secrets

Names only. Values are never in this repository, in a log or in a message.

| Name | Where John keeps it | How to fetch it on the Mac (copies, prints nothing) |
|---|---|---|
| `SUMILABU_BOARD_TOKEN` | keychain `sumilabu board spx-stats` | `security find-generic-password -s "sumilabu board spx-stats" -w \| pbcopy` |
| `SPX_DS1_DB_PASSWORD` | keychain `spx-stats-db DS1 55440` | `security find-generic-password -s "spx-stats-db DS1 55440" -w \| pbcopy` |
| `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN` | keychain `spx-stats dropbox app key`, `... app secret`, `... refresh token` | `zsh scripts/mac/spx-credentials.sh dropbox` (first time), then `security find-generic-password -s "<service>" -w \| pbcopy` |
| `TS_AUTHKEY` | keychain `spx-stats tailscale authkey` (expires every 90 days) | `zsh scripts/mac/spx-credentials.sh tailscale` |
| `SUPABASE_ACCESS_TOKEN` | not saved in the keychain yet; made in the Supabase dashboard, Account, Access Tokens | n/a |

All of them are collected in an unlocked Apple Note called `spx-stats env`; copy the whole note with
`scripts/mac/spx-note-copy.sh`. They are pasted into the cloud environment's settings. Do not ask John to dig for a
value: give him the one command. The private notes in Dropbox `/Backups/spx-stats/notes/` hold the details that do
not belong in a public repository; read the newest `HANDOVER-*.md` there too.

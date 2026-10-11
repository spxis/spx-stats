# spx-stats: rules for agents

The historical record of the NHL, NBA, MLB, NFL and CFL, browsable at https://spxn.com
("SPXN · SPX Stats Network"). The owner is John Morris. Read this whole file before working.

## Who does the work

- The coordinating session only starts Sonnet agents and relays between them and John. It does no feature work.
- Sonnet agents do all the work John asks for, each in its own worktree.

## What the project is

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

## Data rules

1. **Archive first.** Every raw download goes into `legacy_files.raw_archive` (name, saved_on, sha256, data
   bytea) before it is loaded. Files of 100 KB or less also go to Dropbox
   `/Backups/spx-stats/raw/<source>/<date>/`, create only, never overwrite. Bigger files reach Dropbox through
   John's Mac. An agent's Dropbox write needs John's own confirmation in chat; a relayed one doesn't count.
2. **Load season by season** (or award by award), so the database shows progress as it goes.
3. **Raw is kept as it came** in a `legacy_<source>` schema. `core` is built from it by rerunnable steps in
   `db/build/NNN_*.sql`, matched by stable keys.
   - `scripts/build_core.sh` runs them all. Step 100 recreates franchises and team seasons, so every enrichment must
     be a build step, never a one-off update.
   - Unfinished steps go in `db/build/pending/`, which the build ignores.
   - Never run `build_core.sh` while another agent is loading.
4. **Never collect** member data (accounts, wagers, forums, surveys) or sensitive personal data: ethnicity,
   religion, health, sex or gender, family, politics.
5. Holes are fine. Don't guess values; log them.

## The database

- **Local working copy:** Postgres 17, socket `/tmp`, port 55432, database `spx_stats`.
  - Data dir `/home/user/spxwork/pg17`, owned by the `postgres` user.
  - After a container restart, start it with:
    `su postgres -c "/usr/lib/postgresql/17/bin/pg_ctl -D /home/user/spxwork/pg17 -l /tmp/pg17.log -o '-p 55432 -k /tmp -c listen_addresses=127.0.0.1' start -w"`
  - **Only the coordinating session starts Postgres.** Worktree-isolated agents can't run `su` or `runuser`. If
    `psql` can't connect, report it; don't try to start it. Connect with `psql -h /tmp -p 55432 -U postgres spx_stats`.
- **Schemas:**
  - `legacy_*`: raw, one per source.
  - `core`: the curated history.
  - `meta`: sources, verification, data issues.
  - `ref`: sports, leagues, countries.
  - `api`: read-only views served by PostgREST. `api.refresh()` refreshes the materialised ones.
- **Migrations** are `db/migrations/NNN_*.sql`, applied by hand, in order, to local and then to production.
- **Production** is Supabase (meta, ref, core and api only; `legacy_*` stays local and on DS1).
  - Load with `scripts/supabase/load.py`.
  - It refuses to write if production lacks a table or column the local database has. Apply the migration first;
    never bypass the check.
  - Prefer loading only the tables you changed (`load_table`). A full `--replace` load empties each table, and by
    cascade its children, before refilling it, so the site is blank while it runs.
  - Run `select api.refresh();` after loading.
  - **Write production loads as insert-only scripts** (`on conflict do nothing`, no truncate). The auto-mode
    permission check often refuses production loads from agents even after John approves in chat, because agents
    don't see his messages. If one is refused, stop and report the exact command; the coordinating session runs it
    once John approves.
  - **Schema changes** go through the Supabase MCP `apply_migration`.
- **DS1** (John's Synology NAS, over Tailscale) keeps a full copy of everything, including `legacy_*`. Refresh it
  after big loads.

## The website

- **`web/`** is the site: Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Zod 4, d3, pnpm.
  - Read `web/node_modules/next/dist/docs/` before writing Next.js code: this version differs from older ones.
  - Data comes from PostgREST (`Accept-Profile: api`) through server fetches with `next: { revalidate: 3600 }`,
    validated with Zod.
- **`site/`** is the retired plain-JS site; don't add to it.
- **Languages:** EN, FR and JA through `web/src/lib/i18n` (`say('key')`, `currentSpeaker()` / `useSpeaker()`, cookie
  `spxn-locale`).
  - All new UI text goes into the phrase catalogue, with a best-guess FR and JA translation. No native review is needed
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
- **Checks before every push,** in `web/`: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.
- **Deploying:** a push to `main` does not deploy. Deploy production through Vercel (project `spx-stats`, root
  `web`, from GitHub `spxis/spx-stats` `main`), then check a few pages once each.

## Git

- Commit as **John Morris <john@spxis.com>**, Conventional Commits, subject 50 characters or less.
- **No AI attribution anywhere:** no Co-Authored-By, no "Generated with", no session links, nothing in code
  comments or docs.
- Add files by name, never `git add -A`.
- Push fast-forward only: fetch, rebase onto `origin/main`, recheck, push.
- Several agents work at once. Work in your own worktree, keep changes small, and never edit another agent's
  files.

## Safety

- The repository is **public**. Never commit database dumps, member data, secrets, private notes or internal
  reviews.
- Never print or store passwords or tokens in files, logs or commits. Delete any credential file after use.
- Ask John before deleting or overwriting data, and before any write to production that is not a routine load.
- Never build a public endpoint that runs SQL.

## Talking to John

- Keep it short.
- When you are waiting on him, say so first, plainly, with the one thing he needs to do.
- He reads on his phone, which can't change permission settings.
- He wants features published as they are finished, and work done by Sonnet agents.
- **Work out the command before asking him for a step.** Before telling John to click through a website or log in to a
  machine, check whether an agent or MCP tool can do it, and whether the value is already on his Mac (keychain, .env
  files) or in the private notes. Then give him ONE copy-paste command that fetches or builds it without printing any
  secret. Only then ask for a UI step, and say exactly where to click.
- Record any command that worked in the private notes in Dropbox `/Backups/spx-stats/notes/` (`credentials-how-to.md`
  and `board-key-and-lessons.md`) so the next session doesn't ask again.

## Tickets

The queue is the spx-stats board on Sumilabu (`api.sumilabu.com`), the same
board UmaKuma and Itsutsu use, under project key `spx-stats`. Drive it with
`pnpm task` from `web/` (`pnpm task add|claim|release|done|drop|reopen|grade`).
`SUMILABU_BOARD_URL` and `SUMILABU_BOARD_TOKEN` come from the environment and
are never written to a file, a log or a commit.

The spx-stats key was created on 2026-10-11: it is a `BOARD_TOKENS_JSON` entry named `spx-stats`, and the cloud
environment has `SUMILABU_BOARD_URL` and `SUMILABU_BOARD_TOKEN` (not yet tested against the real board). Sumilabu's
`BOARD_TOKENS_JSON` is write-only, so saving a new value replaces the whole map: rebuild it with every existing key
in it, never just the new one. The fetch and rebuild commands are in the private notes (Dropbox
`/Backups/spx-stats/notes/board-key-and-lessons.md`). If `pnpm task` is refused, write the ticket down for the pending
list at Dropbox `/Backups/spx-stats/tickets-pending-2026-10-11.md` and tell the coordinating session (the Dropbox
rule above applies to the write).

- File a ticket before starting work: `pnpm task add "<title>" --detail "<what and why>" --by "<who>"`.
- Claim it with the whole id the board prints, never a prefix: `pnpm task claim <id> "<who>"`. A hold lasts six hours; a live hold is not taken over.
- Mark it done once it is shipped: `pnpm task done <id> --by "<who>" --version "<deploy or commit>"`.
- If you stop, release it: `pnpm task release <id> --by "<who>"`.

`/tickets` on the site is a read-only view of the board. It answers 404 unless
`TICKETS_PAGE=1` is set, which it must never be in production (the board has
no read-only key and tickets may hold internal notes).

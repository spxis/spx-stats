# spx-stats: rules for agents

The historical record of the NHL, NBA, MLB, NFL and CFL, browsable at https://spxn.com
("SPXN · SPX Stats Network"). The owner is John Morris. Read this whole file before working.

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
   John's Mac.
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

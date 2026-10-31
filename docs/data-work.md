# Data work: Turso, materialized views, the numbered steps

Moved word for word from [AGENTS.md](../AGENTS.md) on 2026-10-30, so that file stays short enough to load in every session. Read this before you write a migration, a `db/build` step, a loader or an `api` view, and before anything to do with a data release. AGENTS.md section 8 keeps where data lives, who may write it and a short form of each rule. A comment elsewhere that cites "AGENTS.md section 8, item 5" means item 5 here. The steps for each source and league are in [data-sources.md](data-sources.md).

**Turso (second release target).** Production is on the 500 MB plan, so six admin and bulky objects live in Turso instead: `api.person_admin`,
`meta.verification`, `meta.data_issue`, `core.external_id`, `core.batted_ball_player`, `core.batted_ball_player_hand`, `core.betting_line`, plus three small derived tables
(`api_totals`, `api_quality`, `api_provenance`) that replace what production's matviews computed from them. The list is `TABLES` in
`scripts/release/turso.py`; `release.py` publishes those tables to Turso (preview, checks, snapshot, batches, exact read-back, rollback,
drift: [`scripts/release/README.md`](../scripts/release/README.md), "Turso as a second target") and never to production. One release goes to
one place, so `prepare` refuses a mix; the runner (NAS) needs `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` and a rebuild at the commit that
has `turso.py`. Create the Turso tables with `release.py turso-schema --apply` (from DS1's catalog; idempotent). The site reads them through
`web/src/lib/turso` (server side, cached like the api views, tags `turso:<table>`; "Couldn't load" when Turso is down; without
`TURSO_DATABASE_URL` it falls back to the api views, which is how a local preview of DS1 runs). `api.games.checked` and
`api.soccer_matches.checked` are filled in from `meta_verification` by `lib/turso/checked.ts`. Removing the old copies from production is
`db/migrations/131_drop_turso_tables_production.sql` (production only, after its checklist).

**The run log and the admin alerts** live in Turso too (tables `run_log`, `run_log_item`, `alert`; [`scripts/runlog/README.md`](../scripts/runlog/README.md)). Every
automated job and every deploy, release step, approval and `ds1-apply` writes one entry through `scripts/runlog/runlog.py` (a write that fails never fails the job;
`RUNLOG=0` in a test), `/admin/runs` shows the timeline and a "did it run today" view (an expected job that did not run is MISSED), and the banner on every admin
page lists the open alerts until an admin dismisses them. A job that fails calls `alert_raise`, its next success `alert_resolve`; stale scores are found by the site
itself. Names only: `TURSO_RUNLOG_TOKEN` (a token that can write) on the NAS jobs, the runner and, to dismiss alerts, the site.

**Materialized views never block reads** (migration 097; on 2026-10-13 a rebuild of `api.player_index` locked its reads for about 4 minutes,
and production's anon role times out at 8 s). A plain `refresh materialized view`, and a `drop` + `create` in place, both hold an ACCESS
EXCLUSIVE lock for the whole rebuild. So:
- **Every `api` materialized view has a unique index on its natural key** (`db/checks/081_matview_unique_index.sql` returns one row per view
  without one; baseline 0). Create the unique index in the same migration that creates the view.
- **Refresh only with `refresh materialized view concurrently`**, or through `api.refresh()`, which does exactly that for every `api` view
  (found from the catalog, so a new view needs no edit), one at a time, dependencies first then smallest first. A failed view is a WARNING and
  does not stop the rest; `select api.refresh_all()` returns the per-view jsonb (mode, ms, ok or failed). A statement_timeout set inside a
  function is not applied (tested), so to limit each view call `api.refresh_one('api.<name>')` per view under its own `set statement_timeout`.
  A `concurrently` refresh takes 1 to 4 times a plain one and writes only the rows that changed; that is the price of open reads.
- **Changing a view's definition: build beside it, then swap.** Never `drop materialized view` + `create materialized view` in place.
  1. `create materialized view api.<name>_new as <new query>;` then `create unique index <name>_new_key on api.<name>_new (<key>);` and the
     other indexes, all named `<name>_new_*`; `analyze api.<name>_new;`. This can be slow: it locks only `<name>_new`. Do it in its own file or
     transaction, and not while a release is running.
  2. In a second, short transaction: `select api.swap_matview('<name>', '<name>_new');`. It renames, drops the old copy, renames the
     `_new_` indexes, copies the comment and grants select to `anon` and `authenticated`. It takes its locks for milliseconds, gives up after
     5 s (`lock_timeout`) instead of queueing behind a refresh, and refuses if a view is built from the old one (drop and recreate those after).
  3. Apply to DS1 first, then production, like any migration. Add the migration number to the view's comment. `api.refresh()` needs no change.
- A step in `db/build` that refreshes a view uses `concurrently` (190, 191, 192, 194 do).
- **Packed views hang on the views they read.** The packs the site reads first on a visit (`api.team_brand_pack`, `franchise_name_pack`, `season_summary_pack`,
  `logo_fit_pack`, `team_home_city`, `city_stay`, `city_stay_pack`, `venue_pack`, `standing_league_pack`, `award_league_pack`, `alignment_pack`, `player_league_pack`,
  `team_abbr_pack`; migrations 168 and 176 to 187) are materialized views built from api views (`team_brand`, `franchise_names`, `team_season_name_run`, `season_summary`,
  `logo_fit`, `team_season_city`, `team_season_index`, `venue_place`, `venue_info`, `venue_name`, `standing_index`, `awards`, `alignment`, `player_multi_league`,
  `person_season_teams`, `team_abbr`). Postgres refuses `drop view`, `drop materialized view` and a `create or replace view` that changes the columns of anything a
  materialized view reads, so a rebuild of one of those views by drop and create now fails with "other objects depend on it". Do this instead:
  1. List what depends on it: `select distinct c.relname from pg_depend d join pg_rewrite r on r.oid = d.objid join pg_class c on c.oid = r.ev_class
     join pg_class s on s.oid = d.refobjid where s.relnamespace = 'api'::regnamespace and s.relname = '<view>' and c.oid <> s.oid;` (and again for each pack it lists).
  2. A view whose columns stay as they are (same names and types in the same order, new ones only at the end) is changed with `create or replace view`; nothing else is needed.
     A materialized view is changed by the build-beside-and-swap above (`api.swap_matview` refuses while a view is built from the old one, so do 3 first).
  3. A change that cannot be done in place: in one transaction `drop materialized view` for each pack of step 1 (a pack is derived and holds nothing the view does not), change the
     view, then create the packs again from their migration files, in the order of their dependencies, with their unique index, `analyze` and grant. While a pack is missing the
     site falls back on the whole-table reads it made before (each reader treats a 404 so), which are correct and heavier, so there is no outage; every other statement of the file must still
     finish in about 40 s, so a pack on a big view is built beside (`<name>_new`) in its own file, then swapped. Never `drop ... cascade` on an api view: it drops the packs without saying so.
  4. A new pack goes in `UNIQUE_KEYS` (`web/src/lib/api/pagedOrder.ts`) with its unique index, gets a decoder test in `scripts/sharedReads.test.ts` that rebuilds the view's rows
     exactly, and is read with the 404 fallback. `api.refresh()` finds it from the catalog and rebuilds it after the views it reads.
- A plain `create unique index` on a view takes a SHARE lock (it blocks a refresh, not reads), which is fine for small views in a migration
  file; `create index concurrently` cannot run in the transaction `ds1-apply.sh` and the Supabase query API wrap a file in.

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
   DS1 (item 8), then to production with the Supabase MCP `apply_migration` (`project_id` from AGENTS.md section 8, `name` in snake_case, `query` the file),
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
     prepared, only if games change just in status, score, overtime/shootout and the scheduled start, only on games not final in production,
     no inserts or deletes, at most 500 games, verification/data issue rows are new rows about those games (the one exception: an existing `wikipedia_daily` game issue
     about a changed game may change only `resolution` and `resolved_at`), and all checks pass;
     it re-checks the policy before applying. Anything else stays pending for John, with the reasons at `/admin/data`. John can
     Hold a release, or "Hold all auto-approvals" (migration 047); the runner also sets that switch itself when an automatic
     release fails or the drift check finds rows an automatic release wrote changed. Never approve a release yourself.
   - **Requests from `/admin/data`** (migration 053, `scripts/release/README.md`): an admin's "Request scores update" (Settings) or
     "Check now" (Drift) writes one row in `meta.score_update_request`; the runner's once-a-minute run does the work. A scores request
     runs `scripts/daily/run.py --apply` on DS1 under the shared lock (`scripts/release/daily_lock.py`) and approves the release it
     prepares as `request:<admin>` only if the auto-approval policy passes and Hold is off. Never write to that table by hand.
     The same table carries an admin's **Refresh** of the unofficial live scores (migration 156; buttons on every scoreboard and the scope/sources choices of
     the same dialog): `scope` game, day, league, main5 or all, plus the ticked `sources` (only green or grey sources with a score parser; a confirm-only or
     forbidden one is greyed out in the dialog and refused by the site and again by the runner). `kind live` runs `run.py --live-only` on the runner
     (DS1 read-only, Turso only, shared limiter, no release); a scoped `scores` request runs it first and then the usual job. One run log entry per click, with who pressed it.
   - **`/admin/ops`** (migrations 104 on production, 105 on DS1; `runner/README.md`, "Ops snapshot and controls"): the DS1 side on one admin page. Vercel
     cannot reach DS1, so `scripts/release/ops.py` (runner container, `OPS_SNAPSHOT=0` switches it off) pushes one small status snapshot to
     `meta.ops_status` every 15 minutes (only when it changed, else hourly; ring of 96) and the page reads the latest through `api.ops_dashboard`.
     Buttons write `meta.ops_request` rows (Snapshot now, Pause or Resume harvester via the DS1 flag `ingest.harvest_state` key `ops_pause`) that the
     runner acts on within a minute; "Check drift now" is the drift request above. `spx-raw-export.sh` reports each run to `ingest.raw_export_run`.
     Never write `meta.ops_*` by hand. Tests: `scripts/release/test/test_ops.py`, `pnpm test:ops`.
6. **After every release:** the runner verifies, refreshes `api` (`api.refresh()`), re-compares that release's tables into
   `meta.sync_status` and makes one POST to the site's `/api/revalidate` (`REVALIDATE_URL`, `REVALIDATE_SECRET`) so the changed pages
   refresh now; look at one affected page on spxn.com.
7. **Season notes** (why a season was short, cancelled games, anything a reader should know) live in `core.season_note`,
   read by the site from `api.season_note`. To add or edit one: edit `db/seed/season_note.csv` (one row; `franchise_key`
   empty for the whole league, else `<source code>:<source key>`; EN required, FR and JA when known; `source` is a
   `meta.source` code, `source_url` the page), run `scripts/build_core.sh` or just `psql -f db/build/183_season_notes.sql`
   from the repo root, then publish `core.season_note` to production with a data release (item 5). Check one page on
   spxn.com (pages are kept a day, refreshed on demand after the release). Migration `033` creates the table.
   **After loading new seasons** (a new league, a new year, a backfill like the NFL before 1999) the load is not done until these
   rerunnable steps have run on DS1, each through `scripts/mac/ds1-apply.sh`, and the load's report names each one that ran:
   `165` champions from the games (`166` the champions of the NFL seasons without a final and the check of the rest, from the season articles), `172` champion links, `175` team brands and logos, `178` alignment (conferences and divisions; a
   new season needs its standings templates in `legacy_alignment`, fetched by `scripts/alignment/`), `179_abbreviations` (the fan's team codes; it also reruns after ANY step that rewrites `core.franchise_identity`, such as 140 and 145: rerunning 140 on 2026-10-27 reset MLB's codes to LAN, NYA and CHN and nobody noticed until a bracket showed them; `db/checks/106` lists the baseball identities still holding a Retrosheet code, baseline 0), `183` season notes (add a row to
   `db/seed/season_note.csv` for a short or cancelled season), `190`, `191` and `192` the indexes, `209` the games and finals held at each venue (`core.venue_game_season`, `core.venue_final_game`; release both tables), then `refresh materialized view api.season_summary`
   (`select api.refresh()` on production; on DS1 `select api.refresh()` also rebuilds `api.alignment_changes`, which is precomputed from the places `178` writes). Then run `db/checks/051` to `053` (finished season without a champion, team seasons without
   a conference or division, a stale season summary): each must stay at its baseline. A load that skips one is how the NFL 1973-1998
   seasons went live with no champions and no conferences.
   **People who might be one person.** `db/build/185_person_merge.sql` merges two records only with a confirming fact (same birth date,
   a team season in common, or a club Wikidata lists that the other record has within his lifetime); every other fitting pair is
   logged as `possible-duplicate:` in `meta.data_issue` and never merged on the name. `db/review/person_review.sql` (read-only,
   `ds1-apply.sh --dry-run`) lists them as `db/seed/person_review.csv`; `python3 -I scripts/people/review_to_ts.py` copies the list
   to the admin page `/admin/people` (admin only, a snapshot in the code, not read from the database). Rerun both after a merge.
   **Venues of games.** `db/build/198_home_venue.sql` (where each club played, `core.franchise_home_venue`) and then `199_game_venue.sql`
   (`core.game_venue`: the games of the five leagues whose venue is not the home club's venue that day; `core.game.venue_id` stays empty, read `api.game_venue` and `api.venue_game`) rerun after any step that writes games (120 to 156) or home venues
   (175, 176, 193). Sources, seeds and the load order: `scripts/game_venue/README.md`. A Wikidata item that is a city is never a venue.
8. **DS1 and working copies.** DS1 is permanent; cloud and Mac copies are temporary. Work done on a working copy
   (the cloud agent holds a lot of it) is pushed to DS1 before the production load and before the copy is discarded.
   Migrations and `db/build` steps are rerunnable SQL. Never apply anything over an existing DS1 database without
   asking John. The DS1 commands below are all **untested**.
   - **Cloud to DS1** (the sync direction stays): a cloud session pushes its new data to DS1 before its container is
     discarded. With the VPN up and the `scripts/cloud/fwd.py` forwarder running (the session-start hook shows the
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
   - **machine2 working copy** (Docker, **untested**: the restore is in progress and not yet confirmed done):

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

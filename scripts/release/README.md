# Data releases

DS1 is the only place data is written. Production changes only through numbered, checked, logged releases that John approves
at `/admin/data`. Release numbers look like `2026.10.12-1`. The runner on the NAS (`runner/README.md`) does the work.

    python3 -I scripts/release/release.py prepare --title "NHL 2012 games" --tables core.game,core.team_season [--ticket ..] [--notes ..] [--replace]
    python3 -I scripts/release/release.py prepare --kind ds1_step --title "Add column" --file db/migrations/046_x.sql
    python3 -I scripts/release/release.py --by daily-job prepare --kind daily_scores [--title ".."]   # the daily job; see "Automatic approval"
    python3 -I scripts/release/release.py rollback --release 2026.10.12-1
    python3 -I scripts/release/release.py checks | status | drift | run

Needs python3 (standard library only), `psql`, DS1 (`SPX_DS1_HOST` or `PGHOST`, `PGPASSWORD`) and `SUPABASE_ACCESS_TOKEN`.
Exit code: 0 ok, 1 refused or blocked or (drift) differences found, 2 error.

## The flow

1. **prepare** runs `db/checks/*.sql` on DS1, compares the tables with production by key (`scripts/sync/compare.py`), and writes a
   pending release to `meta.data_release` on DS1 (full content) and on production (so the site can show it). The preview lists
   rows to add, change and remove per table, the size change and any blockers (failed check, table would shrink by more than
   5 percent without `--replace`, production would pass 450 MB, a column or table missing on production).
2. **approve**: John taps Approve at `/admin/data`. The site calls `api.approve_release` (below). Nothing else approves.
3. **run** (every minute on the NAS): for each approved release it checks that production's row matches DS1's copy (same digest,
   tables, options), re-runs the checks and the comparison and refuses if anything changed since the preview, saves the rows
   it will change (gzip TSV under `RELEASE_SNAPSHOT_DIR/<number>/` and DS1 schema `backup_release_<id>`; never in production),
   loads the changed rows into staging tables on production, then applies everything in ONE `do` block (one statement, so one
   transaction whatever the API does), in the order below, then check row counts, reset identity sequences and drop the staging
   tables. It then verifies by bucket fingerprint that production equals DS1 and runs
   `api.refresh()`. If verification fails it restores the snapshot and marks the release failed. If the apply fails, production
   is unchanged and the release is failed with the error. Whenever an apply has committed (done, failed verification, after a
   restore, and a rollback) the runner runs `select api.refresh();` on production and records `refresh` in the result (`ok`, or
   `failed: <error>`, which does not change the release outcome). A failure before the commit runs no refresh.
4. **ds1_step** runs one `db/migrations` or `db/build` file on DS1 in one transaction at the git sha pinned at prepare (the
   file must be committed and on `origin/main`); prepare does a dry run first. It rolls back if any check gets worse, and refuses
   files with psql backslash commands. Production is not touched; a migration must also be applied on production by hand (AGENTS.md item 4).
5. **rollback** prepares a release that restores the snapshot of an earlier publish (updated and deleted rows back, inserted rows
   removed). It needs approval like any other, and is refused if a later release touched the same tables.
6. **drift** (nightly) compares every `core`, `meta`, `ref` table, writes `meta.sync_status` on both sides and, if anything
   differs, proposes one pending fix release (replacing the previous proposal). It never approves.

### The order inside the apply block

Production's foreign keys are not deferrable and the release never changes them, so the block orders its statements so that every
foreign key and unique key holds after each one. "Fresh" means a table no foreign key points at (checked on DS1 and on production);
every other table in the release is "referenced". Tables are in parents-first order (`compare.apply_order`): a table comes after
every table of the release that it has a foreign key to, from the keys of DS1 and production put together, `NOT VALID` ones included,
in any schema (names are read from `pg_namespace`/`pg_class`, not `regclass::text`, which quotes `ref."position"` and so never matched
`ref.position`: releases 2026.10.13-11 and -13). Tables with no key between them keep the order they were given in. A key from a table to
itself needs no order. A loop of keys between the tables of a release is refused by `prepare` (and by `run`) with the loop and the key
names, because no order can satisfy it. A trigger that reads another table is not a key and is not seen: give it a key or check the
order by hand.

1. **Fresh tables, children first:** delete the listed removals, then delete the rows about to be written. A row replaced by one with
   another id but the same natural key (`franchise_brand`, `award_winner`), or rows that swap unique values, cannot collide, and nothing
   references what is deleted. Fresh tables are then written with a plain insert.
2. **All tables, parents first:** insert or update the changed rows. New parents (a rebuilt `division` with new ids) exist before the
   children that point at them, and children (`team_season`) are re-pointed away from the rows about to go.
3. **Referenced tables, children first:** delete the listed removals (old divisions, then old conferences). No kept row points at them now.

(Release 2026.10.13-8 failed because removals were deleted before the upserts: `team_season` still pointed at the old `division` rows.)
One case cannot be ordered: a referenced table where a removed row and an incoming row share a unique natural key. The block then fails
on that key, and production is unchanged (the release is failed with the error). The restore after a failed verification and the rollback
build their plan from the snapshot and go through the same block, so a restore also inserts the old parents, re-points the children, and
only then deletes the rows the release had inserted. One restore cannot work: a table whose old rows hold a value that a `NOT VALID` key refuses
(`core.person.primary_position` while it still holds free text instead of a position code), because the key is checked on every write of
that column. The restore then fails as a whole and leaves production as the release made it (the release is marked failed with the error).

## Automatic approval (daily scores)

`prepare --kind daily_scores` (default tables `core.game,meta.verification,meta.data_issue`; no `--replace`) writes an ordinary release
with a policy verdict in `preview.auto` (`eligible`, `reasons`). Exit 1 with "nothing to release" means DS1 and production already match.

Policy, checked at prepare, again by the runner right before it approves, and again right before it applies (on the same
comparison it applies): only those three tables; `core.game` rows change only in `status`, `home_score`, `away_score`,
`went_to_overtime`, `decided_by_shootout`, `overtime_periods`, `decided_by`, `updated_at`; only games that are not `final` in
production; no inserts, no deletes, at most 500 games; `meta.verification` and `meta.data_issue` changes are new rows only
(`entity_id` / `entity_key` of a changed game, at most 2000); no blocker (every check passes, size limit); and the release is
unchanged since its preview. One narrow exception: an existing `meta.data_issue` row may be updated when its source is
`wikipedia_daily`, `entity_kind` is `game`, `entity_key` is a game changed in the same release, and the only changed columns are
`resolution` and `resolved_at` (resolving or re-opening). Any other update to an existing data issue (other column, other source,
other kind, a game not in the release) makes the release ineligible, with the reason.

- **Eligible:** the runner approves it as `auto:daily-scores` once it is 10 minutes old (measured from `created_at` on production's
  clock, never earlier), at most one release per run, oldest first, then applies it in the same run. Nothing else is ever approved
  by the runner: at apply time an `auto:` approval is refused unless the release is `daily_scores` and approved as exactly
  `auto:daily-scores`, and a release that no longer meets the policy (or changed since the preview) goes back to `pending`
  with the reasons, untouched.
- **Ineligible:** stays pending for John, reasons shown at `/admin/data`. John can approve it by hand as usual.
- **Hold** (per release, `/admin/data`): `api.hold_release` puts an eligible pending release, or one the runner approved but has
  not started, back to pending and sets `held_at`; the runner never auto-approves a held release.
- **Hold all auto-approvals** (`meta.auto_approval`, migration 047, on production and mirrored to DS1): releases are still prepared
  but stay pending. The runner reads production's switch before approving and the approval and the start of every automatic
  release are conditional on it in the same SQL statement; a release approved but not started goes back to pending. A switch
  that cannot be read stops the automatic step. Resume (`api.resume_auto_approvals`) only clears the switch; the runner then
  re-checks and approves the queue, one release per run, oldest first. John's own approvals are never affected.
- **Auto-pause** (actor `system`, reason recorded): an automatic release failed or was refused, an automatic approval is on a
  release that is not a daily_scores or does not match DS1's copy, a runner stopped during an automatic release, or the nightly
  drift check finds production rows that an automatic release wrote (row hashes are saved in the result's `touched`, kept 14 days)
  changed or missing in production. DS1 moving ahead of production is not a mismatch.

## Score update requests and "Check now" (migration 053)

Production cannot reach DS1, so the site cannot start a scores update itself. At `/admin/data` (Settings tab) a signed-in admin presses
**Request scores update**; on the Drift tab **Check now** asks for a drift check the same way. Each press calls a `security definer` function
(`api.request_score_update` / `api.request_drift_check`: approval secret, signed-in admin and Origin check on the server, as for approvals)
that adds ONE row to `meta.score_update_request` and nothing else. The table has row level security on and no grants for `anon` or
`authenticated`; it is not a release table (the drift comparison skips it). Rules in SQL: one queued or running request at a time (a
unique index, so two clicks make one row), about 10 minutes after the last request of the same kind ended, no `auto:`, `request:` or
`system` names as the requester. Status: `queued`, `running`, `done`, `failed`, `nothing` (nothing new), a short `summary`, and the
`release_number` it prepared. The page shows them, with the note that Wikipedia often updates hours after games end.

The runner needs no extra timer: `release.py run` (every minute) also reads the queued request from production. Scores request:

1. It takes the **shared lock** (below) and checks the daily job's heartbeat (`ingest.daily_run` has no `running` row started in the last
   30 minutes); otherwise the request stays queued and is looked at again next minute. If a `daily_scores` release is already open
   (pending, approved or running) no job is started and the request says so.
2. It runs `scripts/daily/run.py --apply` against DS1 with the runner's own checkout and environment (cache in `RELEASE_DAILY_CACHE`,
   default `daily` next to the snapshot folder; the first run fetches all pages), with the job's release hook switched on
   (`DAILY_PREPARE_RELEASE=1`, `DAILY_RELEASE_KIND=daily_scores`). It never changes that job's rules; it only calls it.
3. The job prepares a `daily_scores` release. The runner approves it as `request:<admin email>`, with no 10 minute wait, only if the
   release is `daily_scores`, Hold all auto-approvals is off, the policy passes now (`auto_gate`, the same checks as the automatic
   approval) and the release is unchanged since its preview. Otherwise it stays pending with the reason for John. A release that
   changes more than scores (the job's review route) is never approved this way.
4. A `request:` approval is treated like an automatic one right before the apply: policy and Hold are checked again (a release that fails
   goes back to pending), only `daily_scores` with a non-empty name is accepted, a failure pauses automatic approvals, and the drift check
   watches the rows it wrote for 14 days. The site cannot make such an approval: `approve_release` refuses `request:` names.

Outcomes written on the request: `done` (release approved, or prepared and waiting for John, with the reason), `nothing` (the job found
nothing new), `failed` (the job exited non-zero or timed out after `RELEASE_DAILY_TIMEOUT` seconds, default 2400; or the release could not be
prepared). A request left `running` by a runner that stopped is marked `failed`.

Drift request: the runner runs the drift check right away (same code as the nightly one), writes `meta.sync_status`, proposes the fix
release if tables differ, and writes a summary (`Checked N tables: ...`).

**The shared lock.** `scripts/release/daily_lock.py` is a Postgres advisory lock on DS1 (key 7243907711) held by one idle psql session; it
works between the runner and the daily job's container and frees itself if the holder dies. The runner takes it around a requested run.
The scheduled daily job (`daily/entry.sh`, a separate container on the NAS, owned by the daily session) does not take it yet: until it
does, only the heartbeat check above protects a requested run from a scheduled run already in progress, not the other way round. To
close that, run its command through the lock: in `daily/entry.sh` `run_once`, replace `python3 -I "$RUN" "${args[@]}" ...` with
`python3 -I "$DIR/scripts/release/daily_lock.py" --wait 3600 -- python3 -I "$RUN" "${args[@]}" ...` (it needs the same `PG*` variables the
job already has; exit 75 means the lock stayed taken).

## Sync status after every release

After every release that committed (including a failed verification and a rollback), the runner compares that release's tables again and
rewrites their rows in `meta.sync_status` on both sides (`result.sync_status` records `ok` or the error). `/admin/data` shows the time of the
comparison, and a table reported as different whose release finished after that comparison is called out of date, not a mismatch.

## Site cache refresh after a release

After each committed release (`done`, failed verification after commit, rollback) the runner makes ONE `POST` to the site
(`REVALIDATE_URL`, with `REVALIDATE_SECRET` as a Bearer token) listing cache tags; no timers, no retries. The site's fetches carry the tags
`api`, `api:<view>` and `api:<view>:<league>` (or `:all`, for a query that names no league), so the route calls `revalidateTag` for what the
release touched: the api views that read the release's tables (found in DS1's catalog), and for a `daily_scores` release the leagues of the
games it changed (`api:<view>:<league>` and `api:<view>:all`); a release that cannot say which leagues refreshes `api:<view>`, and a table no
view reads refreshes `api`. `data-version` (the footer) is always included. If the variables are unset the runner logs it and the pages
refresh within the hour as before; a failure is recorded in `result.revalidate` and never fails the release. The URL must be https (plain
http only for this computer, for tests).

## Checks

`db/checks/*.sql` are single `select` statements that return the problem rows. A header `-- baseline: N` is the number of known
problem rows today: the check blocks a release only when it returns more than N. Lower the number when the data is cleaned up.

## How the approval is secured

- Migration 047 adds `meta.auto_approval` (the switch) with the same lock-down and three more functions, each needing the secret and
  validating the change in SQL: `hold_release(p_secret, p_id, p_actor)`, `pause_auto_approvals(p_secret, p_actor, p_reason)` and
  `resume_auto_approvals(p_secret, p_actor)`. `approve_release` and these refuse an actor that starts with `auto:` or is `system`,
  so the site cannot imitate the runner. The site never approves automatically; only the runner (which holds the Supabase token) does.
- `meta.data_release`, `meta.sync_status` and `meta.release_secret` have no grants for `anon` or `authenticated` and row level
  security on: the public key cannot read or write them. The only way in is three `security definer` functions in `api`
  (migration 045): `release_dashboard(p_secret)`, `approve_release(p_secret, p_id, p_approve, p_actor)` and the view `api.data_version`
  (release number and time only, for the footer).
- Migration 053 adds `request_score_update` and `request_drift_check` (one queued row each, see above) and `release_summary` (three counts for
  the admin bar: releases waiting, a drift fix proposed, Hold on), all behind the same secret; they refuse `auto:`, `request:` and `system` names.
- Both functions need the approval secret: a random string of 32 or more characters held in the site's environment as
  `RELEASE_APPROVAL_SECRET` (server only). The database stores only its sha256 in `meta.release_secret`.
  `approve_release` can only turn a `pending` release into `approved` or `rejected`, and refuses an approval when the preview has blockers.
- The site checks the signed-in admin and the request's Origin on the server before it uses the secret. The admin's verified email is
  recorded as the approver.
- The runner trusts DS1's copy of a release, not production's: it refuses an approved release whose digest, tables or options differ from
  DS1's, and a release DS1 never prepared. Production's row can only say "approved".

One-time setup (the coordinator):

    S=$(openssl rand -hex 32); printf %s "$S" | pbcopy   # the secret, on the clipboard: paste it into the site's environment as RELEASE_APPROVAL_SECRET
    printf %s "$S" | shasum -a 256 | cut -d' ' -f1       # the hash to store (not secret)
    -- on production: insert into meta.release_secret (secret_hash) values ('<hash>') on conflict (id) do update set secret_hash = excluded.secret_hash;

Apply `db/migrations/045_data_releases.sql` on DS1 (`scripts/mac/ds1-apply.sh`) and on production first. To rotate the secret, repeat.

## Exact values and restore

Float columns are hashed and compared by their exact bits (`float8send` / `float4send`), because the Management API prints floats
with 15 digits while the stored value is the same. DS1 sessions set `extra_float_digits=3`; production rows read for a snapshot
come back as bits and are written as exact text. A restore (after a failed verification, or a rollback) deletes and re-inserts the
rows it restores in tables that no foreign key references, so natural unique keys that swap between rows cannot collide; tables
that other tables reference are still upserted by primary key. A publish does the same (see "The order inside the apply block"). Releases prepared before this change have different row
hashes for tables with float columns (`core.person`): prepare them again.

## Tests

    python3 -I scripts/release/test/test_release.py
    python3 -I scripts/release/test/test_auto.py     # automatic approval, hold, pause, resume, auto-pause (migration 047)
    python3 -I scripts/release/test/test_apply_order.py  # the apply block's order against non-deferrable keys (own throwaway Postgres, port 3150; stops it after; includes the position-release shape and the foreign key loop refusal)
    python3 -I scripts/release/test/test_request.py  # score update and drift requests, the shared lock, sync status, site cache refresh (053)

Uses the local Docker Postgres (`spx-stats-local`): builds a small template database from `spx_stats` (only read), makes scratch copies
standing in for DS1 and production, and `mock_api.py` stands in for the Management API. Covers prepare, approval through the function,
run, guardrail refusals, a failure mid-apply (production unchanged), a lost answer after commit, rollback, drift, ds1_step, float
values through an API that rounds them, a restore with swapped unique keys, `api.refresh()` after a commit (also after a failed verification). `test_auto.py` simulates time by moving `created_at` back and covers the data issue resolve and re-open rule.

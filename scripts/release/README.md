# Data releases

DS1 is the only place data is written. Production changes only through numbered, checked, logged releases that John approves
at `/admin/data`. Release numbers look like `2026.10.12-1`. The runner on the NAS (`runner/README.md`) does the work.

    python3 -I scripts/release/release.py prepare --title "NHL 2012 games" --tables core.game,core.team_season [--ticket ..] [--notes ..] [--replace]
    python3 -I scripts/release/release.py prepare --kind ds1_step --title "Add column" --file db/migrations/046_x.sql
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
   transaction whatever the API does): delete the listed removals (children first), upsert (parents first), check row counts,
   reset identity sequences, drop the staging tables. It then verifies by bucket fingerprint that production equals DS1 and runs
   `api.refresh()`. If verification fails it restores the snapshot and marks the release failed. If the apply fails, production
   is unchanged and the release is failed with the error.
4. **ds1_step** runs one `db/migrations` or `db/build` file on DS1 in one transaction at the git sha pinned at prepare (the
   file must be committed and on `origin/main`); prepare does a dry run first. It rolls back if any check gets worse, and refuses
   files with psql backslash commands. Production is not touched; a migration must also be applied on production by hand (AGENTS.md item 4).
5. **rollback** prepares a release that restores the snapshot of an earlier publish (updated and deleted rows back, inserted rows
   removed). It needs approval like any other, and is refused if a later release touched the same tables.
6. **drift** (nightly) compares every `core`, `meta`, `ref` table, writes `meta.sync_status` on both sides and, if anything
   differs, proposes one pending fix release (replacing the previous proposal). It never approves.

## Checks

`db/checks/*.sql` are single `select` statements that return the problem rows. A header `-- baseline: N` is the number of known
problem rows today: the check blocks a release only when it returns more than N. Lower the number when the data is cleaned up.

## How the approval is secured

- `meta.data_release`, `meta.sync_status` and `meta.release_secret` have no grants for `anon` or `authenticated` and row level
  security on: the public key cannot read or write them. The only way in is three `security definer` functions in `api`
  (migration 045): `release_dashboard(p_secret)`, `approve_release(p_secret, p_id, p_approve, p_actor)` and the view `api.data_version`
  (release number and time only, for the footer).
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

## Tests

    python3 -I scripts/release/test/test_release.py

Uses the local Docker Postgres (`spx-stats-local`): builds a small template database from `spx_stats` (only read), makes scratch copies
standing in for DS1 and production, and `mock_api.py` stands in for the Management API. Covers prepare, approval through the function,
run, guardrail refusals, a failure mid-apply (production unchanged), a lost answer after commit, rollback, drift, ds1_step.

# How data gets to spxn.com

One page for people and agents. Details live in the files linked at the end.

## The one rule

- **DS1 is the only place data is written.** DS1 is our main database, on John's NAS.
- **Production is a published copy.** It is the database the site reads (Supabase).
  It changes only through a **data release**: a numbered, checked, logged update that John approves.
- Nobody edits production by hand.

## The path

    source (API, file, download)
      -> raw archive on DS1 + hard copy on Dropbox
      -> legacy_<source> schema on DS1 (raw, kept as it came)
      -> core build on DS1 (the cleaned history)
      -> release prepared: preview + checks
      -> John approves at /admin/data
         (daily scores approve themselves after 10 minutes if they pass the policy)
      -> NAS runner applies the release, checks production equals DS1,
         refreshes the views, writes the log
      -> spxn.com shows it (pages cache for up to an hour)

Words: a **release** is one batch of row changes. A **preview** lists rows to add, change and remove.
The **runner** is a small program on the NAS that applies approved releases, once a minute.

## Who does what

- **Agents** work on their own local copy. They never touch production.
  They hand the coordinating session the DS1 steps (SQL files under `db/`).
- **Coordinating session** applies DS1 steps with `bash scripts/mac/ds1-apply.sh <file> [--dry-run]`
  and prepares releases with `scripts/release/release.py prepare`.
- **John** approves or rejects at `/admin/data` (works on a phone). Nothing else approves,
  except the daily-scores rule below.
- **Runner** applies approved releases. It holds the production token; the site does not.

## Daily scores

- A daily job writes new scores to DS1 only, then prepares a `daily_scores` release.
- It approves itself 10 minutes later, only if: just score and status fields change, only games not
  final yet, no inserts or deletes, at most 500 games, all checks pass.
- Anything else waits for John, with the reasons shown at `/admin/data`.

## Asking for things from /admin/data

- **Request scores update** (Settings tab): production cannot reach DS1, so the click only writes one request row. The runner (it already
  looks every minute) runs the daily scores job on DS1, prepares the release and approves it for you if the auto-approval checks pass and
  Hold is off. Otherwise it waits for you under Pending. One request at a time, about 10 minutes apart. Wikipedia often updates hours
  after games end, so a request may find nothing new.
- **Check now** (Drift tab): the same, for a drift check.
- After every release the runner re-compares that release's tables, so the Drift tab shows when the comparison was taken and calls an older
  result out of date. It also asks the site to refresh the changed pages right away, instead of within the hour.
- Admins see a slim bar at the top of every page when a release is waiting, a drift fix is proposed or auto-approval is on Hold.

## Safety nets

- **Checks:** `db/checks/*.sql` run on DS1 before every release. A failed check blocks it.
- **Shrink and space guards:** a table shrinking more than 5 percent needs `--replace`.
  A release that would take production past 450 MB is blocked.
- **Snapshot and undo:** before changing production the runner saves the old rows (on the NAS and on DS1,
  never in production). `release.py rollback --release <number>` prepares an undo; John approves it.
- **Verify:** after applying, the runner checks production equals DS1. If not, it restores the snapshot.
- **Nightly drift check:** compares every table on both sides, shows the result at `/admin/data`,
  and proposes a fix release. It never approves.
- **Hold:** stops one release from auto-approving.
- **Pause:** "Hold all auto-approvals" stops every automatic approval. John's own approvals still work.
- **Auto-pause:** the system pauses itself if an automatic release fails or the drift check finds
  rows an automatic release wrote have changed.

## Schema changes

- A new table or column is a migration (`db/migrations/NNN_name.sql`).
- Apply it to DS1 first, then to production, **before** the release that fills it.
- The DS1 side can be a `ds1_step` release (one file, one transaction, rolled back if checks get worse).

## In an emergency

1. **Wrong auto-approvals?** Pause auto-approvals at `/admin/data`.
2. **A bad release is live?** `python3 -I scripts/release/release.py rollback --release <number>`,
   then John approves the undo.
3. **Need a hand fix on production?** Only with John's OK in chat. Fix DS1 first, then the hand fix
   on production, then run the drift check (`release.py drift`) and confirm it is clean.
   Never `truncate`, never `load.py --replace`, never a full load.
4. **Production empty or broken?** Tell John first. Do not rebuild it by hand.

## Where the details live

- [`AGENTS.md`](../AGENTS.md) section 8: rules for agents.
- [`scripts/release/README.md`](../scripts/release/README.md): prepare, approve, run, policy, security.
- [`scripts/sync/README.md`](../scripts/sync/README.md): the read-only DS1 vs production comparison.
- [`runner/README.md`](../runner/README.md): the NAS runner and how to set it up.

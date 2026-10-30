# Release runner (on nas1)

A small container that sits next to DS1 (nas1, the always-on NAS that hosts the source database). Every 60 seconds it runs `release.py run` (applies the data releases John approved at
`/admin/data`) and once a night `release.py drift` (compares DS1 and production). It needs DS1 on the local network and the
internet (Supabase and GitHub). Production cannot reach DS1, so this is the only way data gets to production.
It cannot approve anything on its own: approval is a button on the site. Two exceptions, both limited to `daily_scores` releases and
re-checked against the policy and the Hold switch right before the apply: the automatic approval after a 10 minute hold, and the approval
of the release prepared for an admin's **Request scores update** (below).

## Set up once (about 15 minutes)

1. On nas1 (its file manager, or ssh) create the folder `spx-release-runner` inside the job-folder base (`NAS1_DOCKER_DIR` in the private host
   mapping) and put four files in it, taken from this folder of the
   repo (https://github.com/spxis/spx-stats/tree/main/runner): `Dockerfile`, `entry.sh`, `docker-compose.yml`, and a copy of
   `release-runner.env.example` named `release-runner.env`.
2. Create an empty folder named `data` inside `spx-release-runner`. The bind mount `./data:/data` fails
   on first start if it is missing.
3. Open `release-runner.env` in a text editor and fill in (names only here; the values are in the private file):
   - `SUPABASE_ACCESS_TOKEN`: the production access token.
   - `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`: the Turso database the admin and bulky tables are published to (no release of them and no
     drift comparison of them without both). After a code change in `scripts/release` the runner must be rebuilt (Build) before the next prepare.
   - `PGPASSWORD`: the DS1 password. `PGHOST=127.0.0.1` (DS1 is on the same NAS and the container uses host networking, because
     bridge containers had no DNS on that NAS). `PGPORT`, `PGUSER`, `PGDATABASE` are already right.
4. In the NAS's container UI (its Docker or Compose project screen) open Project, then Create. Name `spx-release-runner`, path the folder from step 1, source
   "Use existing docker-compose.yml". Next until it asks to build and start; accept.
5. Read the log in the container UI: Container, then `spx-release-runner`, then Log. Within a minute you should see lines like
   `nothing approved` repeating. If you see `... is not set`, a name in `release-runner.env` is empty.
6. Check DS1 access from the NAS once: in the container UI open the container's Terminal and run
   `python3 -I /work/repo/scripts/release/release.py checks`. It prints one line per check, all `ok`.

## Score update requests, drift checks and the site refresh

- **Request scores update** (Settings tab) and **Check now** (Drift tab) at `/admin/data` write one request row in production. The same
  once-a-minute run reads it (no new timer). A scores request runs `scripts/daily/run.py --apply` against DS1 from this container, using the
  checkout and the `PG*` settings it already has, prepares a `daily_scores` release and approves it as `request:<admin>` if the policy
  passes and Hold is off. It needs nothing new in `release-runner.env`; the job's downloads are kept in `data/daily/`. The first request
  fetches every Wikipedia page (about 17 requests); later ones only what changed.
- **Update now** on a league of `/admin/ops` (migration 150) is the same request with a league: the run is `run.py --apply --league <league>`.
  The ops tick also raises the admin alerts `scores-stale:<league>`, `scores-overdue:<league>` and `scores-no-run` from the snapshot it already
  builds (thresholds `SCORES_STALE_HOURS` 6, `SCORES_OVERDUE_HOURS` 12, `SCORES_NO_RUN_HOURS` 20; optional env, nothing new is required).
  Both are in `scripts/release`, so **the runner must be rebuilt at the commit that has them** (`RELEASE_REF`, then Build) and migration 150 applied first.
- **Refresh** buttons on the scoreboards and the scope/sources choices of the scores update dialog (migration 156) run `scripts/daily/run.py --live-only` for
  one request (read-only on DS1, Turso only, through the shared limiter). It writes with the Turso settings the container already has
  (`TURSO_DATABASE_URL`, and `TURSO_RUNLOG_TOKEN` or else `TURSO_AUTH_TOKEN`, a token that can write). balldontlie is read only when
  `BALLDONTLIE_API_KEY` is set in `release-runner.env` (optional; without it that source is skipped and the item says so, as for a requested scores run). `scripts/daily` and `scripts/release` changed: **rebuild the runner at the
  commit that has them** (`RELEASE_REF`, then Build) and apply migration 156 first (DS1, then production).
- A requested run holds the shared DS1 lock (`scripts/release/daily_lock.py`) and waits while the daily job's heartbeat shows a run in
  progress. While it runs (a few minutes at most; `RELEASE_DAILY_TIMEOUT`, 2400 s) the runner does nothing else.
- **Site refresh.** After each committed release the runner sends the changed tables' tags to the site's `/api/revalidate` in small batches a few seconds apart (`REVALIDATE_BATCH`, `REVALIDATE_GAP`, `REVALIDATE_SPREAD`; scripts/release/README.md) so the changed pages rebuild now without all of them at once.
  Add to `release-runner.env`: `REVALIDATE_URL=https://spxn.com/api/revalidate` and `REVALIDATE_SECRET=<the same value as the site's
  REVALIDATE_SECRET, 32 or more characters>`. Without them nothing is sent and pages refresh within the hour. The secret only lets a caller
  refresh cache tags; it cannot read or change data.
- After each committed release the runner also compares that release's tables again and updates `meta.sync_status`.
- Rebuild after pulling this change: in the container UI, Project, `spx-release-runner`, Action, Build (only needed for a new `Dockerfile` or
  `entry.sh`; this change touches neither, so setting `RELEASE_REF` to the new sha and restarting is enough).

## API watchdog (keeps production's REST API up)

On 2026-10-14 production's PostgREST stalled for about 90 minutes (statement timeouts, then `PGRST002` "could not query the database for
the schema cache", 503 on every uncached page) until the project was restarted by hand. The runner now does the same, in order, only after
the API has stayed down for a while. `scripts/release/watchdog.py` is started by `entry.sh` next to the release loop (not inside it, so a long
scores update cannot stop the probes) and does one probe a minute:

1. **Probe.** One read of the public API, the way a visitor's page would make it: `GET /rest/v1/games?league=eq.nhl&year=eq.2010&select=game_id&limit=1`
   with the public key and an 8 second timeout (not `/rest/v1/`, which answers 401 to the publishable key). Only HTTP 200 with a JSON list counts as working.
2. **5 failed probes in a row** (about 5 minutes): the incident is recorded and the runner sends `NOTIFY pgrst, 'reload schema'` through the
   Management API `database/query` endpoint (once per incident).
3. **5 more failures:** `POST /v1/projects/<ref>/restart`, at most once an hour. After a restart failed probes are ignored for 10 minutes
   (`WATCHDOG_GRACE`, 600 s) while the project comes back; if it is still down after that and the hour is up, it restarts again.
4. **The first probe that works** closes the incident. A run of fewer than 5 failures leaves no trace except a log line.

Before a reload or a restart it asks the Management API for the project's status and holds off (and asks again next minute) when that does not
answer or says the project is paused, restarting, restoring or being upgraded, so a bad network on the NAS or a project already mid-restart never
causes one. It uses the `SUPABASE_ACCESS_TOKEN` the runner already holds; nothing new goes in `release-runner.env`.

- **Switch off:** `WATCHDOG=0` in `release-runner.env`, then Build (a restart alone can keep the old values). The log says `watchdog: off`.
- **Records.** Each incident is one row of `meta.api_health_event` (migration 090: `failing_since`, `detected_at`, `probes_failed`, `reload_at`,
  `restart_at`, `recovered_at`, `last_error`), written on DS1 and copied to production through the Management API, which answers even while
  PostgREST does not. `/admin/data` shows the latest as an "API health" line under the title (red while an incident is open); without the migration on
  production the line is simply left out, and without it on DS1 the runner logs `could not record the incident` and carries on.
  Apply 090 on DS1 and on production before the first outage you want recorded. The table is not a release table: the drift check and `prepare` skip it.
- **State** is `data/watchdog.json` (the streak, what was sent, the last restart, an incident not yet written to both sides), so a restart of the
  container does not forget an outage in progress or the once-an-hour limit.
- **Cost:** one single-row read a minute (Supabase Free has no request limit; nothing Vercel-side is touched) and, during an outage only, one
  Management API call per action. The unit tests are `python3 -I scripts/release/test/test_watchdog.py` (no database, no network).
- **Version.** `entry.sh` changed (it starts the watchdog), so the first time needs Build: copy `entry.sh` over and
  `cd "$NAS1_DOCKER_DIR/spx-release-runner" && sudo "$NAS1_DOCKER_BIN" compose up -d --build` (on nas1, with those two values from the private host mapping). After that the watchdog code follows `RELEASE_REF` like the rest.

## Ops snapshot and controls (`/admin/ops`)

`/admin/ops` is a very internal admin page about the DS1 side: the harvester, the Dropbox backup, DS1 against production row counts, the daily scores job,
the watchdog and the releases. Production (Vercel) cannot reach DS1 and must not, so `scripts/release/ops.py` is started by `entry.sh` next to the
watchdog (one tick a minute, its own process) and pushes the facts to production. One tick makes at most two Management API calls:

1. **Every tick:** one small read of `meta.ops_request` (an admin's clicks: **Snapshot now**, **Pause harvester**, **Resume harvester**). Pause writes the
   switch the harvester reads (`ingest.harvest_state` key `ops_pause`, checked every 15 s by `scripts/harvest/pause.py`: it finishes the request it is
   on, then stands still); Resume deletes it. Each request is marked `done` or `failed` on production, and the runner then writes a snapshot at once.
   "Check drift now" is not here: it is the existing drift request that `release.py run` handles.
2. **Every 15 minutes (`OPS_SNAPSHOT_EVERY`, 900 s):** build one snapshot from DS1 (psql only; no production call to build it) and write it with
   `meta.ops_status_put` if it differs from the last one written (a sha256 of the payload without its own time, the heartbeat and the last probe), or
   if the last write is an hour old (`OPS_HEARTBEAT_EVERY`, 3600 s: the page tells a quiet system from a dead runner by this). Production keeps the
   newest 96 rows (a day at 15 minutes). The snapshot is a few KB (limit 24 KB; an oversized one keeps only the tables that differ).

What is in it: harvester (state, queue depth by kind and state, gap targets left by kind and league, requests and pages in the last hour and today,
last error, heartbeat), daily scores job (last run, outcome, last `daily_scores` release), watchdog (last probe, open incident; the watchdog now keeps
`last_probe_at` and `last_ok_at` in `data/watchdog.json`), releases (waiting, running, last done and failed, the runner's code sha), DS1 against
production (the latest drift comparison, `meta.sync_status`: counts and a differs flag per table, when it was made) and the backup (rows and bytes of
`legacy_files.raw_archive`, and the last report of `spx-raw-export.sh` from `ingest.raw_export_run`; no row at all is shown as "never ran").
A section the runner cannot read says so and the others still go out. State is `data/ops.json`.

- **Switch off:** `OPS_SNAPSHOT=0` in `release-runner.env`, then Build. The log says `ops snapshot: off`.
- **Cost:** per day 1,440 one-row reads of production plus at most 96 snapshot writes (about 100 KB to 1 MB a day of churn, a ring of 96 rows
  of a few KB, so production grows by under 1 MB in all). Nothing Vercel-side runs on a timer: the page refreshes itself once a minute only while a tab
  is visible and used (stops after 10 idle minutes).
- **Needs** migration 104 on production (`meta.ops_status`, `meta.ops_request`, `api.ops_dashboard`, `api.request_ops`) and, for the Backups section,
  migration 105 on DS1 (`ingest.raw_export_run`). Without 104 the runner logs `could not read the requests` once an hour and keeps going.
  The Mac export script writes its row at the end of each run; it must be the new `scripts/mac/spx-raw-export.sh` on machine1 (copy it over `~/bin/`).
- **Code is `entry.sh`'s first change since the watchdog:** it now also starts `ops.py`, so the first time needs Build. From the Mac, in the checkout (one command):

      cd ~/Projects/spx-stats && . scripts/mac/lib/hosts.sh && git pull -q && tar -C runner -cf - entry.sh | ssh "$NAS1_SSH_ALIAS" "B='$NAS1_DOCKER_BIN' R='$NAS1_DOCKER_DIR'; "'set -e; D=$R/spx-release-runner; sudo tar -C $D -xf -; cd $D && sudo $B compose up -d --build 2>&1 | tail -4; sleep 25; sudo $B logs --tail 12 spx-release-runner'

  If `RELEASE_REF` pins a commit, set it to the new `main` first (`release.py` and `compare.py` changed: the two new tables are in the reserved list).
  A quiet minute logs nothing; the first `ops: snapshot N written` appears within a minute of the start.
- Tests: `python3 -I scripts/release/test/test_ops.py` (the pure builder always; the SQL, collectors, requests and a whole tick against a scratch
  Postgres when `PGHOST`, `PGPORT`, `PGUSER` are set) and, in `web/`, `pnpm test:ops`.

## What it does and where things are

- Code: the public repo, fetched from GitHub every minute and checked out at `RELEASE_REF` (default `origin/main`). Pin the
  runner to a reviewed `main` commit: set `RELEASE_REF=<commit sha>` in `release-runner.env`. To update it, edit `RELEASE_REF`
  to the newly reviewed sha, then in the container UI open Project, `spx-release-runner`, Action, Build.
- Before changing production a release saves the old rows to `data/snapshots/<release number>/` (gzip TSV, in the `data`
  folder next to `docker-compose.yml`) and to schema `backup_release_<id>` on DS1. Never in production. Delete old ones
  now and then; keep the last few.
- One job at a time. A release that was running when the container stopped is marked failed; run the drift check or look at
  `/admin/data` to see whether production matches DS1.
- Changing the `Dockerfile` or `entry.sh` needs a rebuild: in the container UI, Project, Action, Build.

## Safety

- `release-runner.env` holds two secrets. Keep it on the NAS only, never in git (it is in `.gitignore`).
- The Supabase token can do anything in the project; the guardrails live in `release.py` (checks, 5 percent shrink limit, 450 MB peak size estimate
  limit, snapshot, one transaction, verification). Do not run other things with that token from the NAS.

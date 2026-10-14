# Release runner (Synology NAS)

A small container that sits next to DS1. Every 60 seconds it runs `release.py run` (applies the data releases John approved at
`/admin/data`) and once a night `release.py drift` (compares DS1 and production). It needs DS1 on the local network and the
internet (Supabase and GitHub). Production cannot reach DS1, so this is the only way data gets to production.
It cannot approve anything on its own: approval is a button on the site. Two exceptions, both limited to `daily_scores` releases and
re-checked against the policy and the Hold switch right before the apply: the automatic approval after a 10 minute hold, and the approval
of the release prepared for an admin's **Request scores update** (below).

## Set up once (about 15 minutes)

1. In File Station create the folder `docker/spx-release-runner` and put four files in it, taken from this folder of the
   repo (https://github.com/spxis/spx-stats/tree/main/runner): `Dockerfile`, `entry.sh`, `docker-compose.yml`, and a copy of
   `release-runner.env.example` named `release-runner.env`.
2. In File Station create an empty folder named `data` inside `docker/spx-release-runner`. The bind mount `./data:/data` fails
   on first start if it is missing.
3. Open `release-runner.env` in a text editor and fill in (names only here; the values are in the private file):
   - `SUPABASE_ACCESS_TOKEN`: the production access token.
   - `PGPASSWORD`: the DS1 password. `PGHOST=127.0.0.1` (DS1 is on the same NAS and the container uses host networking, because
     the NAS runs AdGuard Home and bridge containers had no DNS). `PGPORT`, `PGUSER`, `PGDATABASE` are already right.
4. In DSM open Container Manager, then Project, then Create. Name `spx-release-runner`, path the folder from step 1, source
   "Use existing docker-compose.yml". Next until it asks to build and start; accept.
5. Read the log in DSM: Container (or Container Manager), then Container, then `spx-release-runner`, then Log. Within a minute you should see lines like
   `nothing approved` repeating. If you see `... is not set`, a name in `release-runner.env` is empty.
6. Check DS1 access from the NAS once: in Container Manager open the container's Terminal and run
   `python3 -I /work/repo/scripts/release/release.py checks`. It prints one line per check, all `ok`.

## Score update requests, drift checks and the site refresh

- **Request scores update** (Settings tab) and **Check now** (Drift tab) at `/admin/data` write one request row in production. The same
  once-a-minute run reads it (no new timer). A scores request runs `scripts/daily/run.py --apply` against DS1 from this container, using the
  checkout and the `PG*` settings it already has, prepares a `daily_scores` release and approves it as `request:<admin>` if the policy
  passes and Hold is off. It needs nothing new in `release-runner.env`; the job's downloads are kept in `data/daily/`. The first request
  fetches every Wikipedia page (about 17 requests); later ones only what changed.
- A requested run holds the shared DS1 lock (`scripts/release/daily_lock.py`) and waits while the daily job's heartbeat shows a run in
  progress. While it runs (a few minutes at most; `RELEASE_DAILY_TIMEOUT`, 2400 s) the runner does nothing else.
- **Site refresh.** After each committed release the runner makes one `POST` to the site's `/api/revalidate` so the changed pages rebuild now.
  Add to `release-runner.env`: `REVALIDATE_URL=https://spxn.com/api/revalidate` and `REVALIDATE_SECRET=<the same value as the site's
  REVALIDATE_SECRET, 32 or more characters>`. Without them nothing is sent and pages refresh within the hour. The secret only lets a caller
  refresh cache tags; it cannot read or change data.
- After each committed release the runner also compares that release's tables again and updates `meta.sync_status`.
- Rebuild after pulling this change: Container Manager, Project, `spx-release-runner`, Action, Build (only needed for a new `Dockerfile` or
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
  `cd /volume2/docker/spx-release-runner && sudo docker compose up -d --build`. After that the watchdog code follows `RELEASE_REF` like the rest.

## What it does and where things are

- Code: the public repo, fetched from GitHub every minute and checked out at `RELEASE_REF` (default `origin/main`). Pin the
  runner to a reviewed `main` commit: set `RELEASE_REF=<commit sha>` in `release-runner.env`. To update it, edit `RELEASE_REF`
  to the newly reviewed sha, then in DSM open Container Manager, Project, `spx-release-runner`, Action, Build.
- Before changing production a release saves the old rows to `data/snapshots/<release number>/` (gzip TSV, in the `data`
  folder next to `docker-compose.yml`) and to schema `backup_release_<id>` on DS1. Never in production. Delete old ones
  now and then; keep the last few.
- One job at a time. A release that was running when the container stopped is marked failed; run the drift check or look at
  `/admin/data` to see whether production matches DS1.
- Changing the `Dockerfile` or `entry.sh` needs a rebuild: Container Manager, Project, Action, Build.

## Safety

- `release-runner.env` holds two secrets. Keep it on the NAS only, never in git (it is in `.gitignore`).
- The Supabase token can do anything in the project; the guardrails live in `release.py` (checks, 5 percent shrink limit, 450 MB
  limit, snapshot, one transaction, verification). Do not run other things with that token from the NAS.

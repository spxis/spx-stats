# Daily scores job (on nas1)

A small container that sits next to DS1 (nas1, the always-on NAS that hosts the source database). Once a day at 10:00 Toronto time it runs `scripts/daily/run.py --apply`: it reads the
clubs' season articles on English Wikipedia (plus nflverse for the NFL), cross-checks them and writes the results to **DS1 only**,
through `ingest.report_results`, re-checking the last 7 days for late edits. Between runs it only sleeps: nothing is polled, and
nothing contacts Wikipedia, GitHub or DS1 except at the daily run. It costs $0 and uses no cloud.
It never touches production. Production gets the results through a data release (see "Production" below).

## Set up once (about 15 minutes)

1. On nas1 (its file manager, or ssh) create the folder `spx-daily-scores` inside the job-folder base (`NAS1_DOCKER_DIR` in the private host mapping)
   and put four files in it, taken from this folder of the repo
   (https://github.com/spxis/spx-stats/tree/main/daily): `Dockerfile`, `entry.sh`, `docker-compose.yml`, and a copy of
   `daily.env.example` named `daily.env`.
2. Create an empty folder named `data` inside `spx-daily-scores`. The bind mount `./data:/data` fails on
   first start if it is missing.
3. Open `daily.env` in a text editor and fill in the one empty value (names only here):
   - `PGPASSWORD`: the DS1 password. On your Mac, copy it without showing it: `security find-generic-password -s 'spx-stats-db DS1 55440' -w | pbcopy`,
     then paste it after `PGPASSWORD=`. `PGHOST=127.0.0.1` stays (DS1 is on the same NAS and the container uses host networking,
     because bridge containers had no DNS on that NAS). `PGPORT`, `PGUSER`, `PGDATABASE` are already right.
4. In the NAS's container UI (its Docker or Compose project screen) open Project, then Create. Name `spx-daily-scores`, path the folder from step 1, source
   "Use existing docker-compose.yml". Next until it asks to build and start; accept.
5. Read the log: in the container UI, Container, `spx-daily-scores`, Log. You should see
   `daily: waiting for 10:00 America/Toronto each day` and then `daily: sleeping until <tomorrow or today> 10:00 EDT`.
   If you see `... is not set`, a name in `daily.env` is empty.
6. Try one run now, without writing anything: in the container UI, Container, `spx-daily-scores`, Action (or Details), Terminal,
   Create (bash), then run `bash /usr/local/bin/entry.sh once --dry-run`. It prints the Wikipedia pages, the games found and the
   comparison with DS1 (about a minute; the first run fetches all 134 pages, 17 requests). `once` with no argument does the real
   `--apply`. The daily loop itself is not affected.
7. Check that it left a heartbeat (below) after the first real run.

If the container starts after 10:00 and today has not run yet, it runs straight away once (catch-up), then waits for tomorrow.
A failed run is tried again after an hour, up to 3 times that day (`DAILY_MAX_TRIES`, `DAILY_RETRY_SECS`).

## What it does and where things are

- Code: the public repo, fetched from GitHub at each daily run and checked out at `DAILY_REF` (default `origin/main`). Pin the job to a
  reviewed `main` commit: set `DAILY_REF=<commit sha>` in `daily.env`, then in the container UI, Project, `spx-daily-scores`, Action, Build.
  Changing the `Dockerfile` or `entry.sh` needs a rebuild the same way.
- State and downloads: the `data` folder next to `docker-compose.yml` (`data/cache/state.json`, `data/cache/raw/` the wikitext as served,
  `data/logs/` the run output and the DS1 transaction logs, kept 60 days, `last_ok` and `tries` for the schedule). Deleting `data/cache`
  only makes the next run fetch everything again. The User-Agent stays `spx-stats/1.0 (https://spxn.com; john@spxis.com)`.
- One transaction: the rehearsal (rolled back) runs first and any failed check or error means nothing was written; the load is one
  transaction that commits only if every check passed. A run that fails leaves DS1 as it was (the raw pages are archived first, on their
  own, which only adds rows). The run exits non-zero and the log says why.
- The container only needs DS1 on the NAS, GitHub, Wikipedia, nflverse (github.com) and, for the NBA schedule and the MLB and NFL second check, api.balldontlie.io (free tier, one request every 13 s at most). Nothing else.

## The heartbeat: did today's run happen?

Every `--apply` run writes one row to `ingest.daily_run` on DS1 (migration 048; DS1 only, not in a release): `started_at`,
`finished_at`, `outcome` (`running`, `ok`, `failed`), the NAS host, the code's git sha, and a `summary` with the counts (new page
revisions, observations new and repeated, games changed or made, which release tables were written to, requests, any error).

    select run_id, started_at, finished_at, outcome, summary->'load'->>'games_changed' as games_changed
    from ingest.daily_run order by started_at desc limit 10;

A day with no row means the job did not start (container stopped, GitHub unreachable, DS1 password wrong). A row stuck on `running`
for hours means the run died. `failed` has the error in `summary`. It is not `meta.load_run`: `meta` is a release schema, so every row
there would show up as something to publish.

## Production

The job knows nothing about production (the ingest function is not installed there). Results reach production as a data release of the
tables DS1 changed (`scripts/release/README.md`):

- Today the nightly drift check on the release runner proposes the change and John approves it at `/admin/data`.
- A hook can prepare that release right after the run instead: `scripts/daily/release_hook.py` (`prepare_release()`). It is OFF unless
  `DAILY_PREPARE_RELEASE=1`, needs `SUPABASE_ACCESS_TOKEN` in `daily.env` (the same powerful token the release runner holds; see the comment
  in `daily.env.example`) and does not approve anything. When it is off or cannot run it logs `left to the nightly drift check`.
- With `DAILY_RELEASE_KIND=daily_scores`, a run that only changed `core.game`, `meta.verification` or `meta.data_issue` prepares a
  `daily_scores` release ("Daily scores <date>"), which the runner auto-approves after a hold if it passes its checks. A run that also
  touched anything else (a new season, team seasons, external ids) prepares a normal release titled "Daily scores <date> (needs review)"
  that waits for John.

## Working on it from a Mac

A new or rebuilt Mac needs nothing for the daily job or the release runner (`$NAS1_DOCKER_DIR/spx-release-runner`, same pattern
with `release-runner.env`) except the private host mapping and the ssh alias (`zsh scripts/mac/spx-credentials.sh hosts`, then `machine`; see `scripts/mac/README.md`).
Both containers run on the NAS by themselves. To edit `daily.env`: run `. scripts/mac/lib/hosts.sh` loads the private host mapping (nas1's ssh alias `$NAS1_SSH_ALIAS` and the job-folder base `$NAS1_DOCKER_DIR`; see `scripts/mac/README.md`), then `ssh "$NAS1_SSH_ALIAS"` and `vi "$NAS1_DOCKER_DIR/spx-daily-scores/daily.env"`.

To **write a secret into `daily.env` without showing it**, take the value from this Mac's keychain, pipe it over ssh stdin, replace the
line on the NAS and print only a count (`1` means the name is there once, with a non-empty value). Set `n` to the variable name and
use the matching keychain item (`PGPASSWORD` is `spx-stats-db DS1 55440`, `SUPABASE_ACCESS_TOKEN` is `spx-stats SUPABASE_ACCESS_TOKEN`):

    . scripts/mac/lib/hosts.sh
    security find-generic-password -s 'spx-stats SUPABASE_ACCESS_TOKEN' -w | ssh "$NAS1_SSH_ALIAS" \
      "f=$NAS1_DOCKER_DIR/spx-daily-scores/daily.env; "'n=SUPABASE_ACCESS_TOKEN; IFS= read -r T; { grep -v "^$n=" "$f"; printf "%s=%s\n" "$n" "$T"; } > "$f.new" && cat "$f.new" > "$f" && rm "$f.new"; unset T; grep -c "^$n=." "$f"'

It is safe for values with quotes, spaces or `$` (tested against a dummy keychain item), keeps the file's owner and mode, and replaces rather than
duplicates. The container reads `daily.env` when it starts, so then, in the container UI, Project, `spx-daily-scores`, Action, Build (a plain restart can keep the old values).

## Safety

- `daily.env` holds the DS1 password (and optionally the Supabase token). Keep it on the NAS only, never in git (it is in `.gitignore`).
- The job connects to DS1 as its admin user and switches to the restricted role `ingest_writer` for the report; it needs no other login.

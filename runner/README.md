# Release runner (Synology NAS)

A small container that sits next to DS1. Every 60 seconds it runs `release.py run` (applies the data releases John approved at
`/admin/data`) and once a night `release.py drift` (compares DS1 and production). It needs DS1 on the local network and the
internet (Supabase and GitHub). Production cannot reach DS1, so this is the only way data gets to production.
It cannot approve anything: approval is a button on the site.

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

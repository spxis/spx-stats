# DS1 nightly backup (job on nas2)

DS1 holds the only full copy of the data (about 9 GB, every `legacy_*` schema, `legacy_files.raw_archive`, `core`, `meta`, `ref`, `api`). Every night
at **05:30 America/Toronto** a container on nas2 runs `pg_dump -Fc` of `spx_stats` from DS1 over the home LAN and keeps **14 daily and 8 weekly**
dumps. Cost: $0 (a container on a NAS we own). It never writes to DS1: the login is the read-only role `spx_backup`, and every session it opens
is forced read-only. Short version for everyone else: [docs/backups.md](../docs/backups.md).

Why 05:30: the daily scores job runs at 03:00 (hourly retries up to 05:00) and 10:00; the release runner's drift check is about 22:00-23:00
Eastern; the harvester pauses 09:50-10:30. 05:30 touches none of them. The dump is one connection (no parallel workers) with a 2-minute lock
timeout, so DS1 sees one read stream and no long waits; compression runs on nas2.

## What one run does (`scripts/backup/ds1-backup.sh`, the one piece of code)

1. Writes `daily/.<date>-ds1-nightly.dump.partial` on nas2's disk. The real name appears only by rename, after `pg_restore --list` read the
   whole archive back and found tables in it. A run that dies leaves only a hidden partial, which the next run removes.
2. **Size guard:** a new dump under 80 percent of the previous one is parked as `<date>-ds1-nightly.dump.suspect` in the backup folder; nothing is
   pruned; the run fails and raises the alert. If the database really shrank, rerun once with `BACKUP_ACCEPT_SMALLER=1`.
3. A good dump: on a Sunday it is also linked into `weekly/` (temp name, then rename). Then pruning, only now: newest 14 in `daily/`, newest 8 in
   `weekly/`. Only files named `YYYY-MM-DD-ds1-nightly.dump` are ever deleted. A failed dump, a failed read-back, a too-small dump or a
   missing disk-space margin deletes nothing.
4. **Run log:** one entry per run, job `ds1-backup` (`scripts/runlog/runlog.py`). A failure raises the admin alert `backup:ds1`; the next
   success resolves it. If Turso cannot be reached the entry is spooled to `/data/runlog-pending.jsonl` and the backup is unaffected.
5. `last-run.txt` in the backup folder records the last outcome (read by `scripts/backup/backup-status.sh`).

Space: each dump is the database's compressed size (a guess: 2 to 4 GB); 14 + 8 dumps stay well under 100 GB; nas2 has terabytes free. Check
the real size after the first dump (the run log summary and `backup-status.sh` print it).

## Install (coordinating session only; nothing here needs John except one possible step)

Needs on nas2: its container app (Docker) with a docker command the login can run **without sudo** (passwordless sudo is not available there),
and the job folder and dump folder as **absolute** paths in the private mapping (`NAS2_DOCKER_DIR`, `NAS2_BACKUP_DIR`; rsync and scp resolve a
relative path against a different home than the ssh shell does, which lost a file in testing). If `docker ps` fails for the login, the install
says so: **one step for John**, letting that login use docker on nas2 (its docker group), then log in again.

1. **DS1 step (coordinating session; add-only, reversible with `drop role spx_backup`):**

       bash scripts/mac/ds1-apply.sh db/ds1/002_backup_role.sql --dry-run
       bash scripts/mac/ds1-apply.sh db/ds1/002_backup_role.sql
       bash scripts/backup/backup-role-login.sh       # makes the password, keeps it in the Mac keychain, proves read yes / write no

2. **One command that installs and checks the job on nas2** (ships the files, verifies their checksums at the absolute path on nas2, writes
   `backup.env` mode 600 from the keychain, builds and starts the container, runs `once --check` inside it, prints no secret):

       bash scripts/backup/install-nas2.sh

   The check connects to DS1 as `spx_backup`, shows server and `pg_dump` versions, confirms writes are refused, shows free space. If DS1 refuses
   the connection from nas2, check that DS1's Postgres allows the role from the LAN (`pg_hba.conf`); this was not testable here.
3. **First dump now, then the drill:**

       bash scripts/backup/install-nas2.sh --first-dump

Update the job after a change to `backup/`: run step 2 again (it overwrites the four files and rebuilds). A change to `scripts/backup/` needs
nothing: the container fetches the repo at each run (`BACKUP_REF`, default `origin/main`; pin a commit in `backup.env` for a reviewed state; if
GitHub is down it uses the copy it already has).

Day to day: `bash scripts/backup/backup-status.sh --nas2` (last run, size, age, number of dumps; exit 1 if failed or older than 36 hours) and the
run log at `/admin/runs`. `bash scripts/mac/spx-check.sh` has a `nas2 (DS1 backups)` line (network only).
Log in the container: `data/logs/` next to the compose file on nas2, kept 60 days.

## Restore drill (do it once after the first dump, then every few months)

Restores a dump into a scratch Postgres and compares the row count of every table with DS1. Run it from machine1 with a scratch container on
a port in 7740-7749 (dump copied from nas2 first, with a checksum check):

    docker run -d --name spx-drill -e POSTGRES_PASSWORD=drill -p 127.0.0.1:7742:5432 postgres:17-alpine   # check the port is free first
    # copy <dump> from nas2's daily/ to ~/Projects/backups/spx-stats/ and compare cksum on both ends
    DRILL_PGHOST=127.0.0.1 DRILL_PGPORT=7742 DRILL_PGUSER=postgres DRILL_PGPASSWORD=drill \
      bash scripts/backup/restore-drill.sh ~/Projects/backups/spx-stats/<dump> --tolerance-pct 1
    docker rm -f -v spx-drill

The source side uses `PGHOST PGPORT PGUSER PGPASSWORD` (the same names as the backup, with the `spx_backup` login). DS1 keeps changing after
the dump, so a table may differ by 1 percent or 10 rows (reported as "drift"); `--strict` allows no difference (use it only on a quiet source).
A missing table, a failed restore or a table outside the tolerance fails the drill. Write the result (date, dump, counts, minutes) in the run
log with `runlog.py event --job ds1-backup-drill --kind ops --outcome ok|failed --summary ...`.

## Disaster recovery in one paragraph

A new Postgres 17 with the same extensions, then `pg_restore -d spx_stats --no-owner -j 4 <dump>`, then recreate the roles `anon`,
`authenticated`, `ingest_writer`, `service_role` and run the grants you need (restore with owners and grants only when those roles exist).
Production is a published subset of DS1, so a restored DS1 can rebuild it through the normal data release path.

## Fallback without nas2: machine1 by launchd (same script)

`scripts/backup/mac-backup.sh` finds DS1 like the other Mac scripts, reads the keychain (the read-only login if it exists, else the admin login,
with the session still forced read-only) and writes the same `daily/` and `weekly/` layout to `~/Projects/backups/spx-stats/`. Nightly at 05:30
(a Mac that was asleep runs it on wake), installed by:

    cd ~/Projects/spx-stats && L=~/Projects/backups/spx-stats && mkdir -p "$L" ~/Library/LaunchAgents && \
    sed -e "s|__REPO__|$PWD|" -e "s|__LOGDIR__|$L|" scripts/backup/launchd/spx-ds1-backup.plist.example > ~/Library/LaunchAgents/net.spxn.ds1-backup.plist && \
    launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/net.spxn.ds1-backup.plist && bash scripts/backup/mac-backup.sh --check

It is a spare, not a second schedule: run both only if you want two copies in two places. Remove it with `launchctl bootout gui/$(id -u)/net.spxn.ds1-backup`.

## Tests

    bash scripts/backup/test/backup-test.sh [--docker]    # scratch Postgres x2 + libSQL in Docker, ports 7740-7749, removed by name afterwards
    bash scripts/backup/test/install-test.sh               # the nas2 installer with stand-in ssh / docker / keychain
    bash scripts/mac/test/hosts-test.sh                    # the NAS2 names and the spx-check line

`--docker` builds `backup/Dockerfile` and runs the job inside it against the scratch server; it needs this branch committed (the container clones
the working tree, `BACKUP_REF=origin/<branch>`).

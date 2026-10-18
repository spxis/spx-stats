# The run log and the admin alerts

Everything automated that happens each day, and the human decisions around it, in one append-only log in **Turso** (not production: it grows daily
and production is nearly full). The site shows it at `/admin/runs` (admin only); the alert banner on every admin page and the count in the account
menu read the same database. DS1's own heartbeat tables (`ingest.daily_run`, `ingest.raw_export_run`, `meta.ops_status`) keep working and feed it.

## The writer

`scripts/runlog/runlog.py`, standard library only, **never fails its caller** (every function catches everything; a write that cannot be sent goes to
a spool file, `RUNLOG_SPOOL` or `~/.cache/spx-runlog/pending.jsonl`, and is sent with the next write that works).

    import runlog
    rl = runlog.Run("daily-scores", kind="job").start()      # optional; a run that dies stays 'running'
    rl.item("nhl", "ok", "3 games changed", counts={...})     # per league, table or step
    rl.finish("ok", "summary", counts={...}, detail={...}, links={"release": "2026.10.18-1"})
    runlog.event("deploy-prebuilt", "deploy", "ok", "deployed abc1234", detail={...}, actor="machine2", ref="abc1234")
    runlog.alert_raise("daily:mlb", "daily-scores", "mlb", "MLB scores did not update: ...")
    runlog.alert_resolve("daily:mlb")

Shell: `. scripts/runlog/log.sh; runlog_event <job> <kind> <outcome> "<summary>" ['<detail json>'] [--actor ..] [--ref ..] [--alert-key k]`, or
`python3 -I scripts/runlog/runlog.py event --job .. --kind .. --outcome ..`. `RUNLOG=0` switches it off (every test of a script that logs sets it).

Environment (names only): `TURSO_DATABASE_URL` and `TURSO_RUNLOG_TOKEN` (a token that can write; `TURSO_AUTH_TOKEN` is used when it is not set). The
shell scripts on a Mac also read the keychain items `spx-stats TURSO_DATABASE_URL` and `spx-stats TURSO_RUNLOG_TOKEN` (`log.sh` sets `RUNLOG_KEYCHAIN=1`;
Python jobs never read the keychain). The site reads with its read token (`TURSO_AUTH_TOKEN`) and needs `TURSO_RUNLOG_TOKEN` only to dismiss alerts.
Machines are named by role: put `machine1` or `machine2` in `--actor`, never a host name (`RUNLOG_HOST` stays empty).

## Tables (created by the writer, `create table if not exists`)

- `run_log` (uid, kind, job, scope, actor, host, ref, started_at, finished_at, outcome, summary, counts, detail, links). `kind`: `job`, `data`, `release`,
  `approval`, `deploy`, `ops`. `outcome`: `running`, `ok`, `warning`, `failed`, `skipped`. A run is written when it starts (optional) and closed once;
  nothing edits a finished entry. `uid` is made by the caller, so a write that is sent twice is one row.
- `run_log_item` (run_uid, seq, name, outcome, summary, counts, detail): the per-league, per-table or per-step results of one run.
- `alert` (key, job, scope, severity, message, first_at, last_at, repeats, state `open|resolved`, resolved_at, dismissed_at, dismissed_by).
- `run_meta` (key, value): the last retention run.
- **Retention** (once a day, by whichever writer finishes first): `detail` of a run and all its items after 90 days, the one-line entry after a year,
  a resolved alert that was dismissed after 90 days.

## Alerts

`alert_raise(key, ...)` opens the alert; a repeat failure raises it again, **also after a dismissal** (it clears `dismissed_at`). `alert_resolve(key)` is the
job's next success: the alert stops counting as open but stays in the banner until an admin dismisses it. Keys: `daily:<league>`, `daily-left-out:<league>`,
`daily:run`, `harvest:cycle`, `raw-export`, `release:<number>`, `drift`, `ops-snapshot`, `watchdog:api`, `deploy`, `stale:<league>`.
**Stale scores** are not raised by a job: the site checks (every minute at most, when an admin looks) whether a league's latest season has regular season
games dated more than two days ago that still have no result, reading what visitors see, and keeps `stale:<league>` rows in the table (a dismissal
stays until the league has been fresh and goes stale again). Without `TURSO_RUNLOG_TOKEN` on the site the stale leagues still show in the banner but cannot be dismissed.

## Who writes what

| Producer | Entries | Where |
|---|---|---|
| daily scores | one run, one item per league, alerts per league | `scripts/daily/runlog_hook.py`, called by `run.py --apply` (NAS job: add the two variables to `daily.env`) |
| harvester | one entry per cycle, alert on a crash | `scripts/harvest/harvest.py` (NAS job: `harvest.env`) |
| Dropbox export | one entry per run, read from `ingest.raw_export_run` by the ops tick (the Mac script is not touched) | `scripts/release/runlog_feed.py` |
| release runner | prepare, approve, reject, withdraw, auto-approve, apply, drift | `scripts/release/release.py` (`rl(...)`), `runlog_feed.release_event` |
| ops snapshot, watchdog | hourly good-news beat, failures and incidents | `scripts/release/ops.py`, `watchdog.py` |
| deployments | `deploy-prebuilt.sh` (one entry per run that built or deployed: commit, version, deployment url, sign-in guard, pruned count, last stage), `deploy.sh` (site deploys) | the scripts |
| DS1 steps | `ds1-apply.sh`: file, dry run or real, the counts output | the script |

Not yet logged: production migrations and Turso schema applies done by hand through the Management API or `release.py turso-schema` (no script of ours
runs the migration), runner rebuilds and `RELEASE_REF` changes (done on the NAS by hand).

## Tests

    docker run -d --name spx-libsql-test -p 127.0.0.1:7743:8080 ghcr.io/tursodatabase/libsql-server:latest
    python3 -I scripts/runlog/test/test_runlog.py          # the writer: start/finish, items, alerts, spool, retention
    python3 -I scripts/release/test/test_runlog_feed.py    # what the runner, watchdog and ops tick write
    cd web && pnpm test:runlog                             # the page rules (expected jobs, MISSED, filters, banner, stale)
    docker rm -f spx-libsql-test

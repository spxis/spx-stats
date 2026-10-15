# scripts/harvest

The code of the harvest job (setup, rules, limits, request and size estimates and the list of missing `db/build` steps are in [`harvest/README.md`](../../harvest/README.md)).

    python3 -I scripts/harvest/status.py [--measure] [--json]     what it is doing (read-only, DS1)
    python3 -I scripts/harvest/harvest.py plan [--everything]     one planner run
    python3 -I scripts/harvest/harvest.py run [--once] [--max-seconds N] [--no-plan]
    python3 -I scripts/harvest/harvest.py reparse [--kind K] [--league L] [--all]
    python3 -I scripts/harvest/test/test_harvest.py               tests (scratch Postgres on port 7770 for the DS1 ones: test/scratch.sh up)

| File | What it holds |
|---|---|
| `config.py`, `tiers.py` | settings from the environment; the priorities (gaps first, biggest first, newest season first) |
| `db.py` | psql only: `scripts/daily/ds1.sh` on a Mac, `PGHOST` in the container, `HARVEST_PSQL` in tests |
| `jobs.py` | the queue (`ingest.harvest_job`) and its state machine: `after_success`, `after_missing`, `after_error`, `claim` |
| `planner.py` | measures the gaps in DS1 and enqueues them (pass 1), then everything else once the gap queue is empty (pass 2) |
| `worker.py` | the loop: pause, plan, claim, ask, archive, parse, load, settle, heartbeat; `reparse` |
| `netapi.py` | polite HTTP: throttle, `maxlag`, `Retry-After`, backoff; `Transient` and `Permanent` |
| `pause.py` | stands still around the daily scores run and while its lock is held |
| `wikitext.py`, `parse.py` | templates, wikitables, infoboxes, rosters, drafts from wikitext |
| `wikidata.py` | the team query, pruning of items to the allowed properties, claims |
| `load.py` | SQL for the archive row and the parsed rows |
| `status.py` | the one-screen summary |

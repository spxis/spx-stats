# DS1 and production sync check

**The rule: DS1 first, then production.** DS1 is the source of truth; production is a copy. Never write a production row
DS1 does not hold. Run `compare.py` after every load. Rows found only in production are reported to John and are never
deleted without his OK.

## Run

Needs `psql`, python3 (standard library only), DS1 reachable, and a Supabase access token.

    export SPX_DS1_HOST=<DS1 address>            # see scripts/mac/spx-checks.sh; or set PGHOST and the other PG* names
    export PGPASSWORD="$(security find-generic-password -s 'spx-stats-db DS1 55440' -w)"
    export SUPABASE_ACCESS_TOKEN="$(security find-generic-password -s 'spx-stats SUPABASE_ACCESS_TOKEN' -w)"
    python3 -I scripts/sync/compare.py --out ~/spx-sync/$(date +%F)

With `SPX_DS1_HOST` set the defaults are port 55440, user `postgres`, database `spx_stats`. Both sides are only read
(DS1 sessions are read-only; production gets `select` queries only). Options: `--tables core.game,core.person` for a few
tables, `--detail-limit N` for how many differing rows get a column-by-column listing (default 2000).
Exit code: 0 all same, 1 differences, 2 error.

## What it does

For every table in `core`, `meta` and `ref` (never `legacy_*`): rows are grouped into 256 buckets by the first byte of
`md5(primary key)`, and each bucket gets a row count and one md5 over its row hashes. Only buckets that differ are
looked at again, key by key. Large tables are read in several small queries (production side: at most about 100,000
rows scanned per Management API call), with timeouts and retries. Only columns present on both sides are compared;
timestamps are compared in UTC; ordering uses the `C` collation, so DS1 and production agree.

A table listed in `PUBLISH_FILTER` (top of `compare.py`; today only `core.external_id` with `entity_kind <> 'game'`) is compared
as DS1's filtered rows against all of production's rows: the DS1 side of every count, bucket, drill and copy reads
`(select * from <table> where <condition>)`, the production side never does. Production rows the condition excludes show as
"only in production". Only the side labelled DS1 (`PsqlSide.source`) is filtered.

## Output

One line per table: `same`, or `DIFF` with the row counts and `only-in-DS1`, `only-in-prod`, `different`. A table
missing in production says so (apply the migration first). Files in `--out`, written only when there is something to say:

| File | Meaning | What to do |
|---|---|---|
| `<table>.to_prod.sql` | rows DS1 has and production lacks: `insert ... overriding system value ... on conflict do nothing`, ids exactly as on DS1, identity sequence reset at the end | run on production (Supabase MCP `execute_sql`, or the `prod_load.py` route), in the order of `apply_order.txt` (parents before children), then compare again |
| `<table>.prod_only.tsv` | keys production has and DS1 lacks | report to John; never delete |
| `<table>.diff.tsv` | same key, different values: key, column, DS1 value, production value | decide which side is right (DS1 wins unless DS1 is wrong, then fix DS1 first); insert-only SQL cannot change an existing row |

Big `to_prod.sql` files (more than a few thousand rows) are too large for one MCP call; split them or load through a
script that sends batches. After applying, run `select api.refresh();` on production.

## Testing without DS1 or production

`--ds1-dsn` and `--prod-dsn` point either side at any Postgres that `psql` can reach (for example two databases on the
local Docker container `spx-stats-local`, made with `create database x template spx_stats`):

    python3 -I scripts/sync/compare.py --out /tmp/x --ds1-dsn "host=127.0.0.1 port=55432 user=postgres dbname=a" \
      --prod-dsn "host=127.0.0.1 port=55432 user=postgres dbname=b"

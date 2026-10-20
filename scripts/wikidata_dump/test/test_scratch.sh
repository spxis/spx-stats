#!/bin/bash
# Migration 141 and load.py against a scratch Postgres (Docker, port 7745, removed by name afterwards). Never touches DS1 or production.
#   bash scripts/wikidata_dump/test/test_scratch.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
NAME=spx-wikidata-dump-scratch
PORT=7745
export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres PGDATABASE=spx_stats PGSSLMODE=disable PGOPTIONS='-c client_min_messages=warning'
TMP="$(mktemp -d)"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then echo "port $PORT is in use" >&2; exit 1; fi
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx_stats -p 127.0.0.1:${PORT}:5432 postgres:17-alpine >/dev/null
for _ in $(seq 1 30); do pg_isready -q -h 127.0.0.1 -p "$PORT" -U postgres && break; sleep 1; done
sleep 2
q() { psql -X -q -At -v ON_ERROR_STOP=1 -c "$1"; }
expect() { [ "$2" = "$3" ] && echo "ok   $1" || { echo "FAIL $1: got '$2', want '$3'" >&2; exit 1; }; }

psql -X -q -v ON_ERROR_STOP=1 -f "$ROOT/db/migrations/141_legacy_wikidata_dump.sql"
psql -X -q -v ON_ERROR_STOP=1 -f "$ROOT/db/migrations/141_legacy_wikidata_dump.sql"   # rerunnable

F="$ROOT/scripts/wikidata_dump/filter.py"; L="$ROOT/scripts/wikidata_dump/load.py"; D="$HERE/fixture-dump.json.gz"
python3 -I "$F" extract "$D" "$TMP/out" --fresh --dump-md5 aaaa --dump-sha256 bbbb --dump-path spx-wikidata-dump/fixture.json.gz 2>/dev/null
python3 -I "$F" refs "$TMP/out" >/dev/null
python3 -I "$F" labels "$D" "$TMP/out" --fresh 2>/dev/null

python3 -I "$L" "$TMP/out" --dry-run >/dev/null
expect "dry run writes nothing" "$(q 'select count(*) from legacy_wikidata_dump.load_run')" "0"

python3 -I "$L" "$TMP/out" --dump-name wikidata-fixture-all.json.gz --dump-date 2026-10-12 --batch-rows 2 >/dev/null
expect "person rows" "$(q 'select count(*) from legacy_wikidata_dump.person')" "4"
expect "event rows" "$(q 'select count(*) from legacy_wikidata_dump.event')" "3"
expect "item rows" "$(q 'select count(*) from legacy_wikidata_dump.item')" "6"
expect "label rows" "$(q 'select count(*) from legacy_wikidata_dump.label')" "3"
expect "two runs, both done" "$(q "select string_agg(kind || ':' || status, ',' order by run_id) from legacy_wikidata_dump.load_run")" "extract:done,labels:done"
expect "provenance stored" "$(q "select dump_name || '|' || dump_date || '|' || dump_md5 || '|' || dump_sha256 || '|' || dump_path from legacy_wikidata_dump.load_run where kind = 'extract'")" "wikidata-fixture-all.json.gz|2026-10-12|aaaa|bbbb|spx-wikidata-dump/fixture.json.gz"
expect "file hashes stored" "$(q "select jsonb_object_keys(files) from legacy_wikidata_dump.load_run where kind = 'extract' order by 1 limit 1")" "events.jsonl.gz"
expect "loaded counts stored" "$(q "select loaded->'person'->>'rows_in_table_for_run' from legacy_wikidata_dump.load_run where kind = 'extract'")" "4"
expect "generated columns" "$(q "select label_en || ':' || sitelinks from legacy_wikidata_dump.person where qid = 'Q1001'")" "Alice Skater:4"
expect "jsonb is queryable" "$(q "select doc->'P569'->0->>'t' from legacy_wikidata_dump.person where qid = 'Q1001'")" "+1961-01-26T00:00:00Z"
expect "no forbidden property in any doc" "$(q "select count(*) from legacy_wikidata_dump.person where doc ?| array['P21','P140','P172','P26','P40','P102','P509','P25']")" "0"

# rerun: same run_key, upsert, same counts
python3 -I "$L" "$TMP/out" >/dev/null
expect "rerun keeps one row per qid" "$(q 'select count(*) from legacy_wikidata_dump.person')" "4"
expect "rerun reuses the run rows" "$(q 'select count(*) from legacy_wikidata_dump.load_run')" "2"

# --min-sitelinks (only people with at least 1 sitelink: Q1001 has 4, the others none)
python3 -I "$F" extract "$D" "$TMP/out2" --fresh >/dev/null 2>&1
python3 -I "$L" "$TMP/out2" --tables person --min-sitelinks 1 --replace-old >/dev/null
expect "min-sitelinks plus replace-old: one person left, from the new run" "$(q "select count(*) || ':' || count(distinct run_id) from legacy_wikidata_dump.person")" "1:1"
expect "replace-old only touched the loaded table" "$(q 'select count(*) from legacy_wikidata_dump.event')" "3"

# a changed file is refused, a limit run is refused
cp "$TMP/out2/people.jsonl.gz" "$TMP/people.bak"; printf 'x' >> "$TMP/out2/people.jsonl.gz"
if python3 -I "$L" "$TMP/out2" --tables person >/dev/null 2>&1; then echo "FAIL: a changed file was loaded" >&2; exit 1; else echo "ok   changed file refused"; fi
cp "$TMP/people.bak" "$TMP/out2/people.jsonl.gz"
python3 -I "$F" extract "$D" "$TMP/out3" --fresh --limit 5 >/dev/null 2>&1
if python3 -I "$L" "$TMP/out3" >/dev/null 2>&1; then echo "FAIL: a limit run was loaded" >&2; exit 1; else echo "ok   limit run refused"; fi

# a bad batch marks the run failed
python3 - "$TMP/out2" <<'PY'
import gzip, json, sys
d = sys.argv[1]
with gzip.open(d + "/events.jsonl.gz", "ab") as f:
    f.write(b'{"id":"Q99","l":{"en":"x"}}\n{"id":"Q99","l":{"en":"dup"}}\n')
PY
python3 -I "$L" "$TMP/out2" --tables event --no-verify >/dev/null 2>&1 && { echo "FAIL: duplicate ids went unnoticed" >&2; exit 1; } || echo "ok   duplicate ids stop the load"
expect "failed run recorded" "$(q "select status from legacy_wikidata_dump.load_run order by run_id desc limit 1")" "failed"
echo "all scratch checks passed"

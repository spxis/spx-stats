#!/bin/bash
# Tests for scripts/mac/same-data.py --tables and the deploy gate. Scratch Postgres in Docker, removed by name.
# Nothing reaches DS1 or production. Run from the repo root:
#   bash scripts/mac/test/same-data-test.sh
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
PY="$HERE/../same-data.py"
GATE="$HERE/../lib/same-data-gate.sh"
NAME="spx-same-data-test-$$"
PORT=""
for p in 7740 7741 7742 7743 7744 7745 7746 7747 7748 7749; do
  if ! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then PORT=$p; break; fi
done
[ -n "$PORT" ] || { echo "no free port in 7740-7749"; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
pass=0 fail=0
ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; }

. "$GATE"
[ "$(same_data_gate 0 0)" = ok ] && ok "equal continues" || bad "equal continues"
[ "$(same_data_gate 1 1)" = warn ] && ok "--force continues with a warning" || bad "--force continues with a warning"
[ "$(same_data_gate 1 0)" = differ ] && ok "a difference stops" || bad "a difference stops"
[ "$(same_data_gate 2 1)" = unread ] && ok "unreadable stops even with --force" || bad "unreadable stops even with --force"
grep -q 'same_data_gate' "$HERE/../deploy-prebuilt.sh" && ok "deploy-prebuilt uses the gate" || bad "deploy-prebuilt uses the gate"

docker info >/dev/null 2>&1 || { echo "Docker is not running"; echo "passed $pass, failed $fail"; exit 1; }
docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=ds1 \
  -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 || { echo "scratch Postgres did not start"; exit 1; }

docker exec -i "$NAME" psql -U postgres -d ds1 -v ON_ERROR_STOP=1 <<'SQL'
create schema core;
create schema meta;
create schema ref;
create table core.widget (id int primary key, n int);
create table core.external_id (id int primary key, entity_kind text not null);
insert into core.widget select g, 1 from generate_series(1, 1000) g;
insert into core.external_id values (1, 'team');
SQL
docker exec "$NAME" psql -U postgres -d postgres -c 'create database prod' >/dev/null
docker exec "$NAME" pg_dump -U postgres -d ds1 --schema=core --schema=meta --schema=ref | docker exec -i "$NAME" psql -U postgres -d prod -v ON_ERROR_STOP=1 >/dev/null

DS1="postgresql://postgres@127.0.0.1:$PORT/ds1"
PROD="postgresql://postgres@127.0.0.1:$PORT/prod"
run() { python3 -I "$PY" --tables --ds1-dsn "$DS1" --prod-dsn "$PROD"; }

out="$(run)"; rc=$?
[ "$rc" = 0 ] && echo "$out" | grep -q "all equal" && ok "equal databases pass" || bad "equal databases pass ($rc): $out"

docker exec "$NAME" psql -U postgres -d ds1 -c "insert into core.widget values (1001, 1)" >/dev/null
out="$(run)"; rc=$?
echo "$out" | grep -q "core.widget: DS1 1,001 / production 1,000" && [ "$rc" = 1 ] && ok "one extra row fails" || bad "one extra row fails ($rc): $out"

docker exec "$NAME" psql -U postgres -d ds1 -c "delete from core.widget where id = 1001" >/dev/null
docker exec "$NAME" psql -U postgres -d ds1 -c "insert into core.external_id values (2, 'game')" >/dev/null
out="$(run)"; rc=$?
[ "$rc" = 0 ] && echo "$out" | grep -q "all equal" && ok "an extra game id on DS1 does not count" || bad "an extra game id on DS1 does not count ($rc): $out"

docker exec "$NAME" psql -U postgres -d ds1 -c "update core.widget set n = 2 where id = 1" >/dev/null
out="$(run)"; rc=$?
echo "$out" | grep -q "core.widget: DS1 1,000 / production 1,000 (rows differ)" && [ "$rc" = 1 ] && ok "same count, different rows fails" || bad "same count, different rows fails ($rc): $out"

out="$(python3 -I "$PY" --tables --ds1-dsn "$DS1" --prod-dsn "postgresql://postgres@127.0.0.1:1/nope" 2>&1)"; rc=$?
[ "$rc" = 2 ] && echo "$out" | grep -q "could not compare" && ok "unreachable production exits 2" || bad "unreachable production exits 2 ($rc): $out"

echo
echo "passed $pass, failed $fail"
[ "$fail" = 0 ]

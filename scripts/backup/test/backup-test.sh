#!/bin/bash
# Tests of the DS1 backup (scripts/backup/) on SCRATCH servers only, in Docker, on ports in the 7740-7749 block (AGENTS.md section 6).
# Nothing here touches DS1, production, Turso or nas2: the "DS1" is a throwaway Postgres, the run log a throwaway libSQL server.
#   bash scripts/backup/test/backup-test.sh [--docker]
#   --docker also builds the nas2 image (backup/Dockerfile) and runs the job inside it against the scratch server (needs this branch
#            committed: the container clones a clone of the repo, BACKUP_REF=origin/<current branch>)
# Containers are named spx-backup-test-src / -drill / -libsql, started here and removed by name at the end.
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../.." && pwd)
B="$REPO/scripts/backup"
SRC_PORT="${BACKUP_TEST_SRC_PORT:-7740}"
DRILL_PORT="${BACKUP_TEST_DRILL_PORT:-7741}"
LIBSQL_PORT="${BACKUP_TEST_LIBSQL_PORT:-7743}"
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin:/usr/local/bin:$PATH"
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/spx-backup-test.XXXXXX")
PASS=0; FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
check() { local d=$1; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got [$2], wanted [$3])"; fi; }

cleanup() {
  docker rm -f -v spx-backup-test-src spx-backup-test-drill spx-backup-test-libsql >/dev/null 2>&1
  rm -rf "${ROOT:?}"
}
trap cleanup EXIT
for p in "$SRC_PORT" "$DRILL_PORT" "$LIBSQL_PORT"; do
  if lsof -iTCP:"$p" -sTCP:LISTEN -n -P >/dev/null 2>&1; then echo "port $p is in use; pick another in 7740-7749" >&2; exit 2; fi
done

echo "(a) scratch servers"
docker run -d --name spx-backup-test-src -e POSTGRES_PASSWORD=srcpw -p 127.0.0.1:$SRC_PORT:5432 postgres:17-alpine >/dev/null || exit 2
docker run -d --name spx-backup-test-drill -e POSTGRES_PASSWORD=drillpw -p 127.0.0.1:$DRILL_PORT:5432 postgres:17-alpine >/dev/null || exit 2
docker run -d --name spx-backup-test-libsql -p 127.0.0.1:$LIBSQL_PORT:8080 ghcr.io/tursodatabase/libsql-server:latest >/dev/null || exit 2
for i in $(seq 1 60); do
  PGPASSWORD=srcpw pg_isready -q -h 127.0.0.1 -p $SRC_PORT && PGPASSWORD=drillpw pg_isready -q -h 127.0.0.1 -p $DRILL_PORT && break; sleep 1
done
sleep 3   # the entrypoint restarts the server once after initialising
adm() { PGPASSWORD=srcpw psql -X -q -At -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $SRC_PORT -U postgres -d spx_stats "$@"; }
PGPASSWORD=srcpw psql -X -q -h 127.0.0.1 -p $SRC_PORT -U postgres -c "create database spx_stats" || exit 2
adm <<'SQL' >/dev/null || exit 2
create role anon nologin; create role authenticated nologin;
create schema core; create schema meta; create schema legacy_files; create schema api;
create table core.game (id bigserial primary key, season int, note text);
insert into core.game (season, note) select i % 150, md5(random()::text) || md5(random()::text) || md5(random()::text) from generate_series(1, 60000) i;
create table core.person (id serial primary key, name text);
insert into core.person (name) select 'person ' || i from generate_series(1, 500) i;
create table meta.source (code text primary key);
insert into meta.source values ('a'), ('b');
create table legacy_files.raw_archive (id serial primary key, body bytea);
insert into legacy_files.raw_archive (body) select decode(md5(random()::text) || md5(random()::text), 'hex') from generate_series(1, 300);
create materialized view api.player_index as select id, name from core.person where id <= 400;
create unique index on api.player_index (id);
grant usage on schema api to anon; grant select on api.player_index to anon;
SQL
ok "scratch DS1 built (60000 games, 500 people, 300 raw files, a materialised view)"

echo "(b) the read-only role: db/ds1/002_backup_role.sql and backup-role-login.sh"
check "the role file applies" adm -f "$REPO/db/ds1/002_backup_role.sql"
check "…and applies again (rerunnable)" adm -f "$REPO/db/ds1/002_backup_role.sql"
eq "role is NOLOGIN until the login script runs" "$(adm -c "select rolcanlogin::text || rolsuper::text || rolbypassrls::text from pg_roles where rolname='spx_backup'")" "falsefalsetrue"
# stand-ins: the admin psql, and a `security` that records the password instead of using the keychain
mkdir -p "$ROOT/bin"
cat > "$ROOT/bin/admpsql" <<EOF
#!/bin/bash
[ "\$1" = "--host" ] && { echo 127.0.0.1; exit 0; }
PGPASSWORD=srcpw exec psql -h 127.0.0.1 -p $SRC_PORT -U postgres -d spx_stats -v ON_ERROR_STOP=1 "\$@"
EOF
cat > "$ROOT/bin/security" <<EOF
#!/bin/bash
case "\$1" in
  find-generic-password) [ -f "$ROOT/kc" ] && exit 0 || exit 44 ;;
  add-generic-password) while [ \$# -gt 0 ]; do [ "\$1" = "-w" ] && printf '%s' "\$2" > "$ROOT/kc"; shift; done ;;
esac
EOF
chmod +x "$ROOT/bin/admpsql" "$ROOT/bin/security"
PATH="$ROOT/bin:$PATH" DS1_PSQL="$ROOT/bin/admpsql" BACKUP_ROLE_HOST=127.0.0.1 BACKUP_ROLE_PORT=$SRC_PORT bash "$B/backup-role-login.sh" > "$ROOT/login.out" 2>&1
eq "login script exit" "$?" 0
check "login script proves read and no-write" grep -q 'cannot write' "$ROOT/login.out"
check "login script prints no password" bash -c "! grep -qF \"\$(cat $ROOT/kc)\" $ROOT/login.out"
eq "password is 40 characters" "$(wc -c < "$ROOT/kc" | tr -d ' ')" 40
PATH="$ROOT/bin:$PATH" DS1_PSQL="$ROOT/bin/admpsql" bash "$B/backup-role-login.sh" > "$ROOT/login2.out" 2>&1
eq "a second run without --rotate refuses" "$?" 1

export PGHOST=127.0.0.1 PGPORT=$SRC_PORT PGUSER=spx_backup PGDATABASE=spx_stats PGPASSWORD="$(cat "$ROOT/kc")"
export TURSO_DATABASE_URL="http://127.0.0.1:$LIBSQL_PORT" TURSO_RUNLOG_TOKEN="" RUNLOG_SPOOL="$ROOT/spool.jsonl"
BK="$ROOT/backups"
run() { BACKUP_DIR="$BK" bash "$B/ds1-backup.sh" "$@" > "$ROOT/run.out" 2>&1; echo $?; }
lq() { # libSQL query -> first column of each row
  python3 -I - "$1" <<'PY'
import json, sys, urllib.request, os
body = json.dumps({"requests": [{"type": "execute", "stmt": {"sql": sys.argv[1]}}, {"type": "close"}]}).encode()
req = urllib.request.Request(os.environ["TURSO_DATABASE_URL"] + "/v2/pipeline", data=body, headers={"content-type": "application/json"})
r = json.loads(urllib.request.urlopen(req, timeout=10).read())["results"][0]
if r["type"] == "error": print("ERR"); sys.exit(0)
for row in r["response"]["result"]["rows"]: print("|".join(str(c.get("value")) for c in row))
PY
}
for i in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$LIBSQL_PORT/health" && break; sleep 1; done

echo "(c) --check"
eq "check exit" "$(run --check)" 0
check "check says the session is read-only" grep -q 'session read-only: on' "$ROOT/run.out"
check "check says the write was refused" grep -q 'write attempt refused' "$ROOT/run.out"
check "check wrote no dump and no folder content" test -z "$(find "$BK/daily" "$BK/weekly" -type f 2>/dev/null)"

echo "(d) one backup"
eq "backup exit" "$(BACKUP_DATE=2026-10-01 run)" 0
check "the dump is in daily/" test -s "$BK/daily/2026-10-01-ds1-nightly.dump"
check "no partial file is left" test -z "$(ls -A "$BK/daily" | grep partial)"
check "pg_restore --list reads it" bash -c "pg_restore --list '$BK/daily/2026-10-01-ds1-nightly.dump' | grep -q 'TABLE DATA core game'"
check "last-run.txt says ok" grep -q '^outcome=ok' "$BK/last-run.txt"
check "the lock is released" test ! -e "$BK/.lock"
eq "a Thursday is not copied to weekly/" "$(ls "$BK/weekly" | wc -l | tr -d ' ')" 0
eq "run log: one ok entry for ds1-backup" "$(lq "select count(*) from run_log where job='ds1-backup' and outcome='ok'")" 1
eq "run log: no alert" "$(lq "select count(*) from alert where key='backup:ds1' and state='open'")" 0
check "backup-status.sh reads the folder" bash "$B/backup-status.sh" "$BK"

echo "(e) retention with fake dated files"
GOOD="$BK/daily/2026-10-01-ds1-nightly.dump"
for d in $(seq 1 30); do dd=$(printf '2026-09-%02d' "$d"); cp "$GOOD" "$BK/daily/$dd-ds1-nightly.dump"; done
for dd in 2026-06-07 2026-06-14 2026-06-21 2026-06-28 2026-07-05 2026-07-12 2026-07-19 2026-07-26 2026-08-02 2026-08-09; do cp "$GOOD" "$BK/weekly/$dd-ds1-nightly.dump"; done
echo keep > "$BK/daily/notes.txt"; echo keep > "$BK/daily/2026-09-01-other.dump"; echo keep > "$BK/weekly/readme.txt"
eq "retention run exit (a Sunday)" "$(BACKUP_DATE=2026-11-01 run)" 0
eq "daily/ holds exactly 14 dumps" "$(ls "$BK/daily" | grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2}-ds1-nightly\.dump$')" 14
eq "the newest daily is today's" "$(ls "$BK/daily" | grep -E 'ds1-nightly' | sort -r | head -1)" "2026-11-01-ds1-nightly.dump"
eq "the 14th newest daily is 2026-09-19" "$(ls "$BK/daily" | grep -E '^[0-9-]{10}-ds1-nightly' | sort -r | sed -n 14p)" "2026-09-19-ds1-nightly.dump"
eq "weekly/ holds exactly 8 dumps" "$(ls "$BK/weekly" | grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2}-ds1-nightly\.dump$')" 8
eq "the Sunday dump was added to weekly/" "$(ls "$BK/weekly" | grep -E 'ds1-nightly' | sort -r | head -1)" "2026-11-01-ds1-nightly.dump"
eq "the 8th weekly is 2026-06-28, the 9th and 10th (06-21, 06-14, 06-07) are gone" "$(ls "$BK/weekly" | grep -E 'ds1-nightly' | sort -r | sed -n 8p)" "2026-06-28-ds1-nightly.dump"
check "files that are not backups are untouched" bash -c "cat '$BK/daily/notes.txt' '$BK/daily/2026-09-01-other.dump' '$BK/weekly/readme.txt' | grep -c keep | grep -q 3"
eq "no partial left in weekly/" "$(ls -A "$BK/weekly" | grep -c partial)" 0
eq "a rerun on the same day replaces, not duplicates" "$(BACKUP_DATE=2026-11-01 run)" 0
eq "…still 14 daily" "$(ls "$BK/daily" | grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2}-ds1-nightly\.dump$')" 14

echo "(f) restore drill (before the source is changed)"
LAST="$BK/daily/2026-11-01-ds1-nightly.dump"
export DRILL_PGHOST=127.0.0.1 DRILL_PGPORT=$DRILL_PORT DRILL_PGUSER=postgres DRILL_PGPASSWORD=drillpw
bash "$B/restore-drill.sh" "$LAST" --strict > "$ROOT/drill.out" 2>&1; eq "drill --strict on an unchanged source: exit" "$?" 0
check "…counts every table" grep -q 'compared 5 tables: 5 equal, 0 within tolerance, 0 failing' "$ROOT/drill.out"
check "…says PASS" grep -q '^PASS' "$ROOT/drill.out"
eq "…the scratch database was dropped" "$(PGPASSWORD=drillpw psql -X -At -h 127.0.0.1 -p $DRILL_PORT -U postgres -d postgres -c "select count(*) from pg_database where datname like 'drill_%'")" 0
adm -c "insert into core.person (name) select 'late ' || i from generate_series(1, 5) i" >/dev/null
bash "$B/restore-drill.sh" "$LAST" --strict > "$ROOT/drill.out" 2>&1; eq "5 people added since the dump, --strict: exit" "$?" 1
check "…names the table" grep -q 'FAIL  core.person' "$ROOT/drill.out"
bash "$B/restore-drill.sh" "$LAST" > "$ROOT/drill.out" 2>&1; eq "…default tolerance: exit" "$?" 0
check "…reports the drift" grep -q 'drift core.person .*(+5 since the dump)' "$ROOT/drill.out"
adm -c "delete from core.game where id % 2 = 0" >/dev/null
bash "$B/restore-drill.sh" "$LAST" > "$ROOT/drill.out" 2>&1; eq "half the games gone from the source: exit" "$?" 1
check "…names core.game" grep -q 'FAIL  core.game' "$ROOT/drill.out"
adm -c "create table meta.new_table (i int); insert into meta.new_table values (1)" >/dev/null
bash "$B/restore-drill.sh" "$LAST" > "$ROOT/drill.out" 2>&1
check "a table the restore lacks is a failure" grep -q 'FAIL  meta.new_table .*missing from the restore' "$ROOT/drill.out"
bash "$B/restore-drill.sh" "$LAST" --no-source > "$ROOT/drill.out" 2>&1; eq "--no-source: exit" "$?" 0
echo "garbage" > "$ROOT/bad.dump"
bash "$B/restore-drill.sh" "$ROOT/bad.dump" > "$ROOT/drill.out" 2>&1; eq "a damaged dump: exit" "$?" 1
PGHOST=127.0.0.1 PGPORT=$DRILL_PORT bash "$B/restore-drill.sh" "$LAST" > "$ROOT/drill.out" 2>&1; eq "target equal to source is refused" "$?" 2

echo "(g) size guard (the source now holds about half its games, and more rows are gone)"
adm -c "delete from core.game where id % 4 <> 1; delete from legacy_files.raw_archive where id > 20" >/dev/null
adm -c "vacuum full core.game" >/dev/null; adm -c "vacuum full legacy_files.raw_archive" >/dev/null
BEFORE_D="$(ls "$BK/daily" | md5sum 2>/dev/null || ls "$BK/daily" | md5)"; BEFORE_W="$(ls "$BK/weekly" | md5sum 2>/dev/null || ls "$BK/weekly" | md5)"
adm -c "delete from core.game where id % 8 <> 1" >/dev/null; adm -c "vacuum full core.game" >/dev/null
eq "much smaller dump: exit" "$(BACKUP_DATE=2026-11-03 run)" 3
check "…parked as .suspect" test -s "$BK/2026-11-03-ds1-nightly.dump.suspect"
check "…not in daily/" test ! -e "$BK/daily/2026-11-03-ds1-nightly.dump"
eq "…daily/ unchanged, nothing pruned" "$(ls "$BK/daily" | md5sum 2>/dev/null || ls "$BK/daily" | md5)" "$BEFORE_D"
eq "…weekly/ unchanged" "$(ls "$BK/weekly" | md5sum 2>/dev/null || ls "$BK/weekly" | md5)" "$BEFORE_W"
eq "…still 14 daily dumps" "$(ls "$BK/daily" | grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2}-ds1-nightly\.dump$')" 14
check "…last-run.txt says failed" grep -q '^outcome=failed' "$BK/last-run.txt"
eq "…run log: a failed entry" "$(lq "select count(*) from run_log where job='ds1-backup' and outcome='failed'")" 1
eq "…run log: the alert is open" "$(lq "select count(*) from alert where key='backup:ds1' and state='open'")" 1
check "…the message says why" grep -q 'under 80 percent' "$ROOT/run.out"
check "backup-status.sh now reports a problem" bash -c "! bash '$B/backup-status.sh' '$BK'"
eq "BACKUP_ACCEPT_SMALLER=1 accepts it" "$(BACKUP_ACCEPT_SMALLER=1 BACKUP_DATE=2026-11-03 run)" 0
check "…the dump is now in daily/" test -s "$BK/daily/2026-11-03-ds1-nightly.dump"
check "…the .suspect file is gone" test ! -e "$BK/2026-11-03-ds1-nightly.dump.suspect"
eq "…the next success resolves the alert" "$(lq "select count(*) from alert where key='backup:ds1' and state='open'")" 0
eq "…and records it as resolved" "$(lq "select count(*) from alert where key='backup:ds1' and state='resolved'")" 1

echo "(h) a failed dump keeps the old dumps"
FILES_BEFORE="$(ls "$BK/daily" "$BK/weekly" | md5sum 2>/dev/null || ls "$BK/daily" "$BK/weekly" | md5)"
eq "wrong password: exit" "$(PGPASSWORD=wrong BACKUP_DATE=2026-11-04 run)" 2
eq "…no file changed" "$(ls "$BK/daily" "$BK/weekly" | md5sum 2>/dev/null || ls "$BK/daily" "$BK/weekly" | md5)" "$FILES_BEFORE"
check "…the message is in the output" grep -q 'pg_dump failed' "$ROOT/run.out"
eq "…run log: failed again, alert open" "$(lq "select count(*) from alert where key='backup:ds1' and state='open'")" 1
eq "server unreachable: exit" "$(PGPORT=7749 BACKUP_DATE=2026-11-04 run)" 2
# a pg_dump that "succeeds" with a broken archive
mkdir -p "$ROOT/shim"; printf '#!/bin/bash\nwhile [ $# -gt 0 ]; do [ "$1" = "-f" ] && echo "not an archive" > "$2"; shift; done\nexit 0\n' > "$ROOT/shim/pg_dump"; chmod +x "$ROOT/shim/pg_dump"
eq "an unreadable archive: exit" "$(PATH="$ROOT/shim:$PATH" BACKUP_DATE=2026-11-04 run)" 4
eq "…no file changed" "$(ls "$BK/daily" "$BK/weekly" | md5sum 2>/dev/null || ls "$BK/daily" "$BK/weekly" | md5)" "$FILES_BEFORE"
check "…and no partial file is left" test -z "$(ls -A "$BK/daily" "$BK/weekly" | grep partial)"
printf '#!/bin/bash\nsleep 1\nexit 1\n' > "$ROOT/shim/pg_dump"
eq "pg_dump failing outright: exit" "$(PATH="$ROOT/shim:$PATH" BACKUP_DATE=2026-11-04 run)" 2

echo "(i) run log failing does not stop the backup"
eq "Turso unreachable: the backup still succeeds" "$(TURSO_DATABASE_URL=http://127.0.0.1:7749 BACKUP_ACCEPT_SMALLER=1 BACKUP_DATE=2026-11-05 run)" 0
check "…the dump is there" test -s "$BK/daily/2026-11-05-ds1-nightly.dump"
check "…the entry was spooled for later" test -s "$ROOT/spool.jsonl"
eq "RUNLOG=0 is quiet and works" "$(RUNLOG=0 BACKUP_ACCEPT_SMALLER=1 BACKUP_DATE=2026-11-06 run)" 0

echo "(j) one run at a time, room"
sleep 60 & SLP=$!
mkdir -p "$BK/.lock"; echo $SLP > "$BK/.lock/pid"
eq "a live lock: exit 75" "$(BACKUP_DATE=2026-11-07 run)" 75
kill $SLP 2>/dev/null; wait $SLP 2>/dev/null
eq "a lock whose process is gone is taken over" "$(BACKUP_ACCEPT_SMALLER=1 BACKUP_DATE=2026-11-07 run)" 0
eq "no room on a fresh folder: exit 5" "$(BACKUP_DIR="$ROOT/empty" BACKUP_MIN_FREE_MB=999999999 bash "$B/ds1-backup.sh" > "$ROOT/run.out" 2>&1; echo $?)" 5
eq "…and nothing was deleted or written but the note" "$(ls "$ROOT/empty/daily" | wc -l | tr -d ' ')" 0
eq "a missing setting: exit 1" "$(env -u PGPASSWORD BACKUP_DIR="$BK" bash "$B/ds1-backup.sh" > "$ROOT/run.out" 2>&1; echo $?)" 1

echo "(k) mac-backup.sh and the launchd file"
check "mac-backup.sh is valid shell" bash -n "$B/mac-backup.sh"
check "the plist is well formed" plutil -lint "$B/launchd/spx-ds1-backup.plist.example"

if [ "${1:-}" = "--docker" ]; then
  echo "(l) the nas2 image, run against the scratch server"
  BR="$(git -C "$REPO" rev-parse --abbrev-ref HEAD)"
  docker build -q -t spx-backup-test-image "$REPO/backup" >/dev/null 2>&1; eq "image builds" "$?" 0
  mkdir -p "$ROOT/d-backups" "$ROOT/d-data"
  git clone -q "$REPO" "$ROOT/src-clone"   # a plain clone: a worktree's .git is a pointer file that means nothing inside the container
  dk() { docker run --rm -v "$ROOT/src-clone:/src:ro" -v "$ROOT/d-backups:/backups" -v "$ROOT/d-data:/data" \
      -e PGHOST=host.docker.internal -e PGPORT=$SRC_PORT -e PGUSER=spx_backup -e PGDATABASE=spx_stats -e PGPASSWORD="$(cat "$ROOT/kc")" \
      -e TURSO_DATABASE_URL="http://host.docker.internal:$LIBSQL_PORT" -e TURSO_RUNLOG_TOKEN= -e BACKUP_REPO_URL=/src -e BACKUP_REF="origin/$BR" \
      -e BACKUP_DATE=2026-11-08 spx-backup-test-image "$@"; }
  dk once --check > "$ROOT/d.out" 2>&1; eq "container: once --check" "$?" 0
  check "…pg_dump in the image is 17" grep -q 'pg_dump 17' "$ROOT/d.out"
  dk once > "$ROOT/d.out" 2>&1; eq "container: once (real dump)" "$?" 0
  check "…dump in the mounted folder" test -s "$ROOT/d-backups/daily/2026-11-08-ds1-nightly.dump"
  eq "…run log entry from the container" "$(lq "select count(*) from run_log where summary like '2026-11-08-ds1-nightly%'")" 1
  docker rmi spx-backup-test-image >/dev/null 2>&1
fi

echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" = 0 ]

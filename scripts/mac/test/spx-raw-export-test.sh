#!/bin/bash
# Tests spx-raw-export.sh with stub psql, security, shasum, xxd and launchctl on a temporary PATH and a fake Dropbox.
# Needs bash, python3 and sha256sum (run it in the Linux container or on the Mac). Writes only under a temp folder.
#   bash scripts/mac/test/spx-raw-export-test.sh

HERE=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$HERE/../spx-raw-export.sh"
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/spx-export-test.XXXXXX")
trap 'rm -rf "$ROOT"' EXIT
PASS=0; FAIL=0

ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
check() { # description, then a command that must succeed
  local d=$1; shift
  if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi
}
has() { grep -q -- "$2" "$1"; }

STUBS="$ROOT/stubs"
mkdir -p "$STUBS"
cp "$HERE/stub-psql.py" "$STUBS/psql"; chmod +x "$STUBS/psql"
cat >"$STUBS/security" <<'EOF'
#!/bin/bash
echo "security $*" >>"$STUB_LOG"
echo stubpw
EOF
cat >"$STUBS/shasum" <<'EOF'
#!/bin/bash
[ "$1" = "-a" ] && shift 2
exec sha256sum "$@"
EOF
cat >"$STUBS/xxd" <<'EOF'
#!/usr/bin/env python3
import sys
a = sys.argv[1:]
assert a[:2] == ["-r", "-p"], a
data = open(a[2]).read() if len(a) > 2 else sys.stdin.read()
sys.stdout.buffer.write(bytes.fromhex("".join(data.split())))
EOF
cat >"$STUBS/launchctl" <<'EOF'
#!/bin/bash
echo "launchctl $*" >>"$STUB_LOG"
EOF
chmod +x "$STUBS"/*

N=0
# newenv: fresh fake Dropbox, HOME, TMPDIR, log and fixture for one scenario
newenv() {
  N=$((N + 1))
  E="$ROOT/s$N"; mkdir -p "$E/home" "$E/tmp" "$E/dropbox"
  export STUB_LOG="$E/log" STUB_FIXTURE="$E/fixture.json" HOME="$E/home" TMPDIR="$E/tmp"
  export SPX_DROPBOX_DIR="$E/dropbox" SPX_RETRY_PAUSE=0 SPX_PROBE_LIMIT=3 SPX_FETCH_LIMIT=20 PATH="$STUBS:/usr/bin:/bin:/sbin"
  unset SPX_DS1_HOST SPX_DS1_DB_PASSWORD STUB_FLAKY STUB_NO_STATUS_TABLE
  # stand-in addresses (documentation ranges); the real mapping is private and HOME here is a scratch folder, so none is read
  export NAS1_LAN_HOSTS="nas.example.test 192.0.2.101 192.0.2.102 192.0.2.103 192.0.2.104" NAS1_VPN_HOST=198.51.100.77
  : >"$STUB_LOG"
  RAW="$E/dropbox/Backups/spx-stats/raw"
}
fixture() { printf '%s' "$1" >"$STUB_FIXTURE"; }
run() { # runs the script; output in $E/out, status in $RC, elapsed seconds in $SECS
  local t0=$SECONDS
  bash "$SCRIPT" "$@" >"$E/out" 2>&1; RC=$?
  SECS=$((SECONDS - t0))
}

BASIC='[{"name":"nhl/2026-10-01/a.txt","data":"alpha\n"},{"name":"nba/2026-10-02/b.csv","data":"x,y\n1,2\n"},{"name":"mlb/2026-10-03/empty","data":""}]'
ALLDOWN="nas.example.test=noname 192.0.2.101=timeout 192.0.2.102=hang 192.0.2.103=noroute 192.0.2.104=refused 198.51.100.77=hang"

echo "(a) only the VPN host answers"
newenv; fixture "$BASIC"
export STUB_HOSTS="nas.example.test=noname 192.0.2.101=timeout 192.0.2.102=refused 192.0.2.103=noroute 192.0.2.104=timeout 198.51.100.77=up"
run
check "exit 0" test "$RC" = 0
check "says VPN" has "$E/out" '^using DS1 at 198.51.100.77 (VPN)$'
check "three files written" test "$(find "$RAW" -type f | wc -l | tr -d " ")" = 3
check "content right" test "$(cat "$RAW/nhl/2026-10-01/a.txt")" = alpha
check "empty file written" test -f "$RAW/mlb/2026-10-03/empty"
check "no .part left" test -z "$(find "$E/dropbox" -name '*.part')"
check "summary line" has "$E/out" 'written 3, skipped 0, differs 0, bad 0, unsafe 0'
check "keychain was asked" has "$STUB_LOG" "security find-generic-password -s spx-stats-db DS1 55440 -w"
check "password never printed" test -z "$(grep -r stubpw "$E/out")"
run
check "second run writes nothing" has "$E/out" 'written 0, skipped 3'
check "second run exit 0" test "$RC" = 0

echo "(b) only a home-network address answers"
newenv; fixture "$BASIC"
export STUB_HOSTS="nas.example.test=noname 192.0.2.101=timeout 192.0.2.102=up 192.0.2.103=up 192.0.2.104=refused 198.51.100.77=hang"
run
check "exit 0" test "$RC" = 0
check "first answering host wins, home network" has "$E/out" '^using DS1 at 192.0.2.102 (home network)$'
check "files written" test "$(find "$RAW" -type f | wc -l | tr -d " ")" = 3
check "later hosts not used for data" test -z "$(grep -E '^(192.0.2.103|198.51.100.77) .* (list|fetch)' "$STUB_LOG")"

echo "(b2) SPX_DS1_HOST is tried first; mDNS name works"
newenv; fixture "$BASIC"
export STUB_HOSTS="nas.example.test=up 192.0.2.101=up 198.51.100.77=up myhost=up"
SPX_DS1_HOST=myhost run
check "custom host first" has "$E/out" '^using DS1 at myhost (home network)$'
SPX_DS1_HOST='' run
check "then the LAN name" has "$E/out" '^using DS1 at nas.example.test (home network)$'

echo "(c) nothing answers"
newenv; fixture "$BASIC"
export STUB_HOSTS="$ALLDOWN"
run
check "exit 1" test "$RC" = 1
check "quick (under 10s with a 3s watchdog)" test "$SECS" -lt 10
for h in nas.example.test 192.0.2.101 192.0.2.102 192.0.2.103 192.0.2.104 198.51.100.77; do check "lists $h" has "$E/out" "$h"; done
check "explains timeout" has "$E/out" 'timed out'
check "explains refused" has "$E/out" 'refused'
check "explains no route" has "$E/out" 'no route'
check "explains hung host" has "$E/out" 'no answer in 3s'
check "explains name" has "$E/out" 'name not found'
check "fix 1 VPN" has "$E/out" 'Turn the VPN'
check "fix 2 NAS firewall" has "$E/out" "NAS's firewall settings"
check "nothing written" test -z "$(find "$E/dropbox" -type f)"
SPX_PROBE_LIMIT=3 bash "$SCRIPT" --scheduled >"$E/out" 2>&1; RC=$?
check "scheduled run: exit 0 and one line" test "$RC" = 0 -a "$(wc -l <"$E/out" | tr -d ' ')" = 1
check "scheduled line says skipping" has "$E/out" 'skipping'

echo "(c1) no private host mapping at all"
newenv; fixture "$BASIC"
export NAS1_LAN_HOSTS="" NAS1_VPN_HOST=""
run
check "exit 1" test "$RC" = 1
check "says MISSING and the one fix" has "$E/out" 'MISSING: the private host mapping .* does not exist'
check "names the fix command" has "$E/out" 'spx-credentials.sh hosts'
SPX_PROBE_LIMIT=3 bash "$SCRIPT" --scheduled >"$E/out" 2>&1; RC=$?
check "scheduled run: exit 0 and skips" test "$RC" = 0 && has "$E/out" 'skipping'

echo "(c2) wrong password is named"
newenv; fixture "$BASIC"
export STUB_HOSTS="198.51.100.77=up"
mkdir -p "$E/bin2"; printf '#!/bin/bash\necho wrongpw\n' >"$E/bin2/security"; chmod +x "$E/bin2/security"
PATH="$E/bin2:$PATH" run
check "exit 1" test "$RC" = 1
check "password refused named" has "$E/out" 'password was refused'

echo "(d) file already present with the same hash is skipped"
newenv; fixture "$BASIC"
export STUB_HOSTS="198.51.100.77=up"
mkdir -p "$RAW/nhl/2026-10-01"; printf 'alpha\n' >"$RAW/nhl/2026-10-01/a.txt"
run
check "written 2, skipped 1" has "$E/out" 'written 2, skipped 1'
check "one batch, only the two missing files" test "$(grep -c ' batch ' "$STUB_LOG")" = 1

echo "(e) present with a different hash is reported, not overwritten"
newenv; fixture "$BASIC"
mkdir -p "$RAW/nhl/2026-10-01"; printf 'LOCAL EDIT\n' >"$RAW/nhl/2026-10-01/a.txt"
run
check "reported DIFFERS" has "$E/out" '^DIFFERS nhl/2026-10-01/a.txt'
check "file untouched" test "$(cat "$RAW/nhl/2026-10-01/a.txt")" = "LOCAL EDIT"
check "others written" has "$E/out" 'written 2, skipped 0, differs 1'
check "exit 2" test "$RC" = 2

echo "(f) bad hash from the server: the .part is removed, nothing is renamed"
newenv
fixture '[{"name":"nhl/x/good.txt","data":"good\n"},{"name":"nhl/x/bad.txt","data":"fine\n","served":"corrupt\n"}]'
run
check "BAD reported" has "$E/out" '^BAD     nhl/x/bad.txt'
check "bad file absent" test ! -e "$RAW/nhl/x/bad.txt"
check "no .part left" test -z "$(find "$E/dropbox" -name '*.part')"
check "good file still written" test "$(cat "$RAW/nhl/x/good.txt")" = good
check "exit 2" test "$RC" = 2
echo "   rerun after the server is right"
fixture '[{"name":"nhl/x/good.txt","data":"good\n"},{"name":"nhl/x/bad.txt","data":"fine\n"}]'
run
check "resumes: bad file now written" test "$(cat "$RAW/nhl/x/bad.txt")" = fine
check "exit 0" test "$RC" = 0

echo "(g) quote in a name, unsafe names"
newenv
fixture '[{"name":"nhl/o'"'"'brien/it'"'"'s \"x\".txt","data":"q\n"},{"name":"nhl/../etc/passwd","data":"no\n"},{"name":"/abs/path","data":"no\n"},{"name":"a//b","data":"no\n"},{"name":"nhl/ok/back\\slash","data":"no\n"},{"name":"nhl/ok/fine.txt","data":"ok\n"}]'
run
check "quote name written" test "$(cat "$RAW/nhl/o'brien/it's \"x\".txt")" = q
check "plain name written" test "$(cat "$RAW/nhl/ok/fine.txt")" = ok
check "four unsafe reported" test "$(grep -c '^UNSAFE' "$E/out")" = 4
check "dotdot not written" test ! -e "$E/dropbox/Backups/spx-stats/etc/passwd"
check "absolute not written" test ! -e /abs/path
check "only two files in Dropbox" test "$(find "$E/dropbox" -type f | wc -l | tr -d " ")" = 2
check "summary counts unsafe" has "$E/out" 'written 2, skipped 0, differs 0, bad 0, unsafe 4'
check "exit 2" test "$RC" = 2

echo "(g2) batching: many small files, one big one, a missing and a corrupt row"
newenv
python3 - "$STUB_FIXTURE" <<'PY'
import json, sys
rows = [{"name": "src/d/f%03d.txt" % i, "data": "file %d\n" % i} for i in range(95)]
rows.append({"name": "src/d/big.bin", "data": "B" * 1500000})
rows.append({"name": "src/d/corrupt.txt", "data": "ok\n", "served": "no\n"})
json.dump(rows, open(sys.argv[1], "w"))
PY
export STUB_HOSTS="198.51.100.77=up"
run
check "97 written... 96 good" has "$E/out" 'written 96, skipped 0, differs 0, bad 1'
check "big file exact" test "$(wc -c <"$RAW/src/d/big.bin" | tr -d ' ')" = 1500000
check "corrupt one absent" test ! -e "$RAW/src/d/corrupt.txt"
check "batches used, not one query a file" test "$(grep -c ' batch ' "$STUB_LOG")" -le 4
check "big file fetched alone" test "$(grep -c ' fetch ' "$STUB_LOG")" = 1
check "no .part left" test -z "$(find "$E/dropbox" -name '*.part')"
run
check "second run: nothing to write" has "$E/out" 'written 0, skipped 96, differs 0, bad 1'

echo "(g3) a flaky link: the first batch times out and is retried"
newenv; fixture "$BASIC"
export STUB_HOSTS="198.51.100.77=up"
STUB_FLAKY=batch SPX_RETRY_PAUSE=0 run
check "all written after the retry" has "$E/out" 'written 3, skipped 0, differs 0, bad 0'
check "the batch was asked twice" test "$(grep -c ' batch ' "$STUB_LOG")" = 2
check "exit 0" test "$RC" = 0
newenv; fixture "$BASIC"
STUB_HOSTS="198.51.100.77=up" STUB_FLAKY=list SPX_RETRY_PAUSE=0 run
check "a flaky listing is retried too" has "$E/out" 'written 3'

echo "(h) --check writes nothing"
newenv; fixture "$BASIC"
export STUB_HOSTS="198.51.100.77=up"
mkdir -p "$RAW/nhl/2026-10-01"; printf 'alpha\n' >"$RAW/nhl/2026-10-01/a.txt"
before=$(find "$E/dropbox" | sort | tr '\n' ' ')
run --check
after=$(find "$E/dropbox" | sort | tr '\n' ' ')
check "exit 0" test "$RC" = 0
check "tree unchanged" test "$before" = "$after"
check "reports what it would do" has "$E/out" 'would write 2 .*already there 1'
check "no data fetched" test -z "$(grep -E ' (fetch|batch) ' "$STUB_LOG")"
newenv; fixture "$BASIC"
run --check
check "--check on an empty Dropbox creates no folder" test ! -e "$E/dropbox/Backups"

echo "(i) no xxd on the Mac: perl fallback"
newenv; fixture "$BASIC"
export STUB_HOSTS="198.51.100.77=up"
mkdir -p "$E/noxxd"; for t in psql security shasum; do ln -s "$STUBS/$t" "$E/noxxd/$t"; done
PATH="$E/noxxd:/usr/bin:/bin:/sbin" run
check "written without xxd" has "$E/out" 'written 3'
check "content right" test "$(cat "$RAW/nhl/2026-10-01/a.txt")" = alpha

echo "(j) Dropbox folder detection"
newenv; fixture "$BASIC"
export STUB_HOSTS="198.51.100.77=up"
unset SPX_DROPBOX_DIR
run
check "no Dropbox: exit 1 with a message" test "$RC" = 1 && has "$E/out" 'No Dropbox folder found'
mkdir -p "$E/home/Dropbox"; run
check "home Dropbox folder used" test -f "$E/home/Dropbox/Backups/spx-stats/raw/nhl/2026-10-01/a.txt"
newenv; fixture "$BASIC"
mkdir -p "$E/home/Library/CloudStorage/Dropbox" "$E/home/Dropbox"; unset SPX_DROPBOX_DIR; run
check "CloudStorage preferred" test -f "$E/home/Library/CloudStorage/Dropbox/Backups/spx-stats/raw/nhl/2026-10-01/a.txt"

echo "(k) stale .part from an interrupted run, and the lock"
newenv; fixture "$BASIC"
mkdir -p "$RAW/nhl/2026-10-01"; printf 'half' >"$RAW/nhl/2026-10-01/a.txt.part"
run
check "stale .part replaced, file complete" test "$(cat "$RAW/nhl/2026-10-01/a.txt")" = alpha
check "no .part left" test -z "$(find "$E/dropbox" -name '*.part')"
newenv; fixture "$BASIC"
mkdir -p "$TMPDIR/spx-raw-export.lock"; echo $$ >"$TMPDIR/spx-raw-export.lock/pid"
run
check "second copy refused while one runs" test "$RC" = 1 && has "$E/out" 'already running'
echo 999999 >"$TMPDIR/spx-raw-export.lock/pid"; run
check "stale lock taken over" test "$RC" = 0

echo "(l) schedule"
newenv
run --install-schedule
P="$HOME/Library/LaunchAgents/ca.johnmorris.spx-raw-export.plist"
check "plist written" test -f "$P"
check "plist is valid XML" python3 -c "import plistlib,sys; d=plistlib.load(open(sys.argv[1],'rb')); assert d['StartInterval']==3600 and d['Label']=='ca.johnmorris.spx-raw-export' and d['ProgramArguments'][-1]=='--scheduled'" "$P"
check "plist logs to ~/Library/Logs/spx-raw-export.log" has "$P" "$HOME/Library/Logs/spx-raw-export.log"
check "launchctl asked to load" has "$STUB_LOG" 'launchctl bootstrap'
run --remove-schedule
check "plist removed" test ! -e "$P"
check "launchctl asked to unload" has "$STUB_LOG" 'launchctl bootout'

echo "(n) the run is reported to DS1 (ingest.raw_export_run, for /admin/ops)"
newenv; fixture "$BASIC"
export STUB_HOSTS="198.51.100.77=up"
run
S="$STUB_LOG.status"
check "one status row written" test "$(grep -c 'insert into ingest.raw_export_run' "$S")" = 1
check "it says ok, 3 checked, 3 copied, 0 present, 0 failed" has "$S" "'ok', 3, 3, 0, 0, "
check "it trims the table to the newest 200" has "$S" 'max(id) - 200'
run
check "second run reports 3 present, 0 copied" test "$(tail -n 1 "$S" | grep -c "'ok', 3, 0, 3, 0, ")" = 1
newenv; fixture "$BASIC"
mkdir -p "$RAW/nhl/2026-10-01"; printf 'LOCAL EDIT\n' >"$RAW/nhl/2026-10-01/a.txt"
run
check "a run with a DIFFERS reports problems and the failure count" has "$STUB_LOG.status" "'problems', 3, 2, 0, 1, "
newenv; fixture "$BASIC"
STUB_NO_STATUS_TABLE=1 run
check "without migration 105 the export still succeeds" test "$RC" = 0 && has "$E/out" 'written 3'
check "and says so in one line" has "$E/out" 'could not report this run to DS1'
newenv; fixture "$BASIC"
run --check
check "--check reports nothing" test ! -e "$STUB_LOG.status"
newenv; fixture "$BASIC"
export STUB_HOSTS="$ALLDOWN"
run
check "a run that never reached DS1 reports nothing" test ! -e "$STUB_LOG.status"

echo "(m) help and bad flags"
newenv
run --help; check "help exits 0" test "$RC" = 0
run --nonsense; check "bad flag exits 64" test "$RC" = 64

echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" = 0 ]

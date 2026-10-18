#!/bin/bash
# Tests for scripts/handoff/handoff.py and scripts/deploy.sh. No network, no real database, no Vercel: every outside command is a stub that
# logs its calls to $TMP/calls.log; the "site" is a fake on 127.0.0.1:$PORT (7792 by default, inside this project's 7700-7799 block).
# Run from the repo root:  bash scripts/handoff/test/handoff-test.sh
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$(cd "$HERE/../.." && pwd)"
HP="python3 -I $SCRIPTS/handoff/handoff.py"
PORT="${SPX_TEST_PORT:-7792}"
TMP="$(mktemp -d)"; PID=""
cleanup() { [ -z "$PID" ] || kill "$PID" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT
pass=0 fail=0
ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; }
expect() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

# ---- the scratch world ----
export SPX_HANDOFF_DIR="$TMP/handoff"; mkdir -p "$SPX_HANDOFF_DIR"
R="$TMP/repo"; mkdir -p "$R/web" "$R/db/build" "$R/db/migrations"
echo "select 1;" > "$R/db/build/220_x.sql"; echo "select 2;" > "$R/db/build/221_y.sql"
git -C "$R" init -q . && git -C "$R" -c user.name=t -c user.email=t@example.invalid add -A && git -C "$R" -c user.name=t -c user.email=t@example.invalid commit -qm init
git -C "$R" update-ref refs/remotes/origin/main HEAD
SHA="$(git -C "$R" rev-parse --short HEAD)"
LOG="$TMP/calls.log"; : > "$LOG"
B="$TMP/bin"; mkdir -p "$B"
cat > "$B/vercel" <<EOF
#!/bin/sh
echo "vercel \$*" >> "$LOG"
case "\$1" in
  deploy) echo "https://spx-stats-new.vercel.app" ;;
  inspect) echo "id dpl_StubDeploy1" ;;
esac
EOF
cat > "$B/task" <<EOF
#!/bin/sh
echo "task \$*" >> "$LOG"
EOF
cat > "$B/ds1" <<EOF
#!/bin/sh
echo "ds1-apply \$*" >> "$LOG"
echo "rows before 1, after 2"
[ -z "\${STUB_DS1_FAIL:-}" ]
EOF
cat > "$B/release" <<EOF
#!/bin/sh
echo "release \$*" >> "$LOG"
echo "prepared release 2026.10.18-4 (pending)"
EOF
cat > "$B/liveauth" <<EOF
#!/bin/sh
echo "liveauth \$*" >> "$LOG"
[ -z "\${STUB_AUTH_FAIL:-}" ]
EOF
cat > "$B/prod" <<'EOF'
#!/usr/bin/env python3
import os, re, sys, json
sql = sys.stdin.read()
open(os.environ["LOGFILE"], "a").write("prod-query\n")
if "data_release" in sql:
    print(json.dumps([{"status": os.environ.get("STUB_REL", "done")}]))
else:
    missing = os.environ.get("STUB_MISSING", "")
    objs = re.findall(r"select '([^']*)' as object", sql)
    print(json.dumps([{"object": o, "ok": not (missing and missing in o)} for o in objs]))
EOF
cat > "$B/turso" <<'EOF'
#!/bin/sh
echo '{"results":[{"response":{"result":{"rows":[[{"value":"api_totals"}],[{"value":"api_quality"}]]}}}]}'
EOF
chmod +x "$B"/*
export LOGFILE="$LOG"
export SPX_REPO="$R" SPX_NO_FETCH=1 SPX_TASK_CMD="$B/task" SPX_VERCEL_CMD="$B/vercel" SPX_DS1_APPLY_CMD="$B/ds1" SPX_RELEASE_CMD="$B/release" \
  SPX_CHECK_LIVE_AUTH="$B/liveauth" SPX_PROD_QUERY_CMD="$B/prod" SPX_TURSO_QUERY_CMD="$B/turso" SPX_SITE_URL="http://127.0.0.1:$PORT" SPX_ACTOR="test-actor"
export PATH="$B:$PATH"

# the fake site: 401 without the bypass header, 200 with it; /broken says Couldn't load
python3 -I - "$PORT" >/dev/null 2>&1 <<'EOF' &
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        ok = self.headers.get("x-vercel-protection-bypass") == "stubtoken"
        body = b"Couldn't load" if self.path == "/broken" else b"fine"
        self.send_response(200 if ok else 401); self.end_headers(); self.wfile.write(body if ok else b"")
HTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
EOF
PID=$!; disown "$PID" 2>/dev/null; sleep 1

# mk <ticket> <jq filter over the example> <example file>: a hand-off in the folder with commits set to the scratch commit
mk() { jq --arg id "$1" --arg sha "$SHA" ".ticket_id = \$id | .commits = [\$sha] | $2" "$SCRIPTS/handoff/examples/$3.json" > "$SPX_HANDOFF_DIR/$1.json"; }
reset() { rm -rf "$SPX_HANDOFF_DIR"; mkdir -p "$SPX_HANDOFF_DIR"; : > "$LOG"; }
T1=cmvtest0000000000000001; T2=cmvtest0000000000000002; T3=cmvtest0000000000000003
D="bash $SCRIPTS/deploy.sh"

echo "schema and helper"
for f in site-ready data-ready needs-decision; do expect "example $f is valid" "$HP check $SCRIPTS/handoff/examples/$f.json >/dev/null"; done
bad_json() { jq "$1" "$SCRIPTS/handoff/examples/site-ready.json" > "$TMP/bad.json"; $HP check "$TMP/bad.json" >/dev/null 2>&1; }
bad_json 'del(.title)'; [ $? = 1 ] && ok "missing title refused" || bad "missing title refused"
bad_json '.status = "done"'; [ $? = 1 ] && ok "unknown status refused" || bad "unknown status refused"
bad_json '.status = "needs-decision"'; [ $? = 1 ] && ok "needs-decision without a decision refused" || bad "needs-decision without a decision refused"
bad_json '.status = "blocked"'; [ $? = 1 ] && ok "blocked without a reason refused" || bad "blocked without a reason refused"
bad_json '.notes_for_john = "token=abcdef0123456789"'; [ $? = 1 ] && ok "secret in notes refused" || bad "secret in notes refused"
frag=/Us; bad_json ".notes_for_john = \"see ${frag}ers/someone/file\""; [ $? = 1 ] && ok "home path refused" || bad "home path refused"
frag=192.1; bad_json ".notes_for_john = \"host ${frag}68.1.20\""; [ $? = 1 ] && ok "private address refused" || bad "private address refused"
bad_json '.site_only = true'; [ $? = 1 ] && ok "site_only with migrations refused" || bad "site_only with migrations refused"
bad_json '.migrations[0].objects = ["x; drop table y"]'; [ $? = 1 ] && ok "unsafe object name refused" || bad "unsafe object name refused"
bad_json '.decision = {"question":"which one?","options":[{"id":"A","label":"one"},{"id":"B","label":"two"}],"recommendation":"Z"} | .status = "needs-decision"'
[ $? = 1 ] && ok "recommendation must name an option" || bad "recommendation must name an option"
for s in ready data-applied-not-released blocked needs-decision deployed released failed needs-change; do
  grep -q "\"$s\"" "$SCRIPTS/handoff/handoff.schema.json" && ok "status $s in the schema" || bad "status $s in the schema"
done

reset
cp "$SCRIPTS/handoff/examples/needs-decision.json" "$TMP/h.json"
$HP write "$TMP/h.json" >/dev/null && expect "write puts the file in the folder" "[ -f $SPX_HANDOFF_DIR/cmvdjc68s0000jj06d65ouvms.json ]"
expect "list shows it" "$HP list | grep -q needs-decision"
$HP reply cmvdjc68s0000jj06d65ouvms --status deployed --by tester --detail "first" --checked a --checked b >/dev/null
$HP reply cmvdjc68s0000jj06d65ouvms --status failed --by tester --detail "second" >/dev/null
expect "reply file has two history entries" "[ \$(jq '.history|length' $SPX_HANDOFF_DIR/replies/cmvdjc68s0000jj06d65ouvms.json) = 2 ]"
expect "checked is kept" "[ \$(jq '.history[0].checked|length' $SPX_HANDOFF_DIR/replies/cmvdjc68s0000jj06d65ouvms.json) = 2 ]"
$HP reply cmvdjc68s0000jj06d65ouvms --status failed --by tester --detail "second" >/dev/null
expect "an identical reply is not added twice" "[ \$(jq '.history|length' $SPX_HANDOFF_DIR/replies/cmvdjc68s0000jj06d65ouvms.json) = 2 ]"
expect "replies shows the latest" "$HP replies | grep -q FAILED"
$HP read cmvdjc68s0000jj06d65ouvms
expect "read moves it to replies/read" "[ -f $SPX_HANDOFF_DIR/replies/read/cmvdjc68s0000jj06d65ouvms.json ] && [ ! -f $SPX_HANDOFF_DIR/replies/cmvdjc68s0000jj06d65ouvms.json ]"
expect "no unread replies now" "$HP replies | grep -q 'no unread'"
$HP reply cmvdjc68s0000jj06d65ouvms --status needs-change --by tester --detail "third" --change "do it" >/dev/null
expect "a later reply continues the old history (append-only)" "[ \$(jq '.history|length' $SPX_HANDOFF_DIR/replies/cmvdjc68s0000jj06d65ouvms.json) = 3 ] && [ ! -f $SPX_HANDOFF_DIR/replies/read/cmvdjc68s0000jj06d65ouvms.json ]"
$HP reply cmvdjc68s0000jj06d65ouvms --status exploded --by tester --detail "nope" >/dev/null 2>&1; expect "unknown reply status refused" "[ \$? != 0 ]"
$HP check "$SCRIPTS/handoff/examples/reply-site.json" >/dev/null 2>&1
SPX_HANDOFF_DIR="$TMP/nowhere/x" $HP list >/dev/null 2>&1; expect "missing folder exits 3" "[ \$? = 3 ]"

echo "deploy.sh: waiting hand-offs"
reset; mk $T1 '.' site-ready; mk $T2 '.' needs-decision
out="$($D --dry-run 2>&1)"
expect "needs-decision shows options and the recommendation" "printf '%s' \"\$out\" | grep -q 'recommended'"
expect "dry run: no vercel, no task, no reply, nothing moved" "! grep -qE '^(vercel|task)' $LOG && [ ! -d $SPX_HANDOFF_DIR/replies ] && [ ! -d $SPX_HANDOFF_DIR/done ]"
expect "dry run says what it would deploy" "printf '%s' \"\$out\" | grep -q 'would deploy'"
expect "dry run did read production" "grep -q prod-query $LOG"

echo "deploy.sh: site hand-off, production has the objects"
reset; mk $T1 '.' site-ready
export SPX_VERCEL_BYPASS=stubtoken
out="$($D 2>&1)"; rc=$?
expect "exit 0" "[ $rc = 0 ]"
expect "clean archive deploy ran" "grep -q 'vercel link --yes --project spx-stats' $LOG && grep -q 'vercel deploy --prod --yes' $LOG"
expect "sign-in check ran with the new url" "grep -q 'liveauth --new https://spx-stats-new.vercel.app' $LOG"
expect "ticket marked done with the short sha" "grep -q \"task done $T1 --by test-actor --version $SHA\" $LOG"
expect "hand-off moved to done/" "[ -f $SPX_HANDOFF_DIR/done/$T1.json ] && [ ! -f $SPX_HANDOFF_DIR/$T1.json ]"
expect "reply says deployed with version and deployment" "[ \$(jq -r '.history[-1].status' $SPX_HANDOFF_DIR/replies/$T1.json) = deployed ] && [ \$(jq -r '.history[-1].deployment' $SPX_HANDOFF_DIR/replies/$T1.json) = dpl_StubDeploy1 ]"
expect "pages were checked with the header" "jq -e '.history[-1].checked | index(\"/nhl/2012 200\")' $SPX_HANDOFF_DIR/replies/$T1.json >/dev/null"
expect "summary printed" "printf '%s' \"\$out\" | grep -q -- '---- summary'"

echo "deploy.sh: no bypass token"
reset; mk $T1 '.' site-ready; unset SPX_VERCEL_BYPASS
out="$(HOME="$TMP/nohome" $D 2>&1)"
expect "pages skipped with a clear note" "jq -r '.history[-1].checked[]' $SPX_HANDOFF_DIR/replies/$T1.json | grep -q 'pages NOT checked'"
export SPX_VERCEL_BYPASS=stubtoken

echo "deploy.sh: missing migration object"
reset; mk $T1 '.' site-ready
out="$(STUB_MISSING=team_season_header $D 2>&1)"; rc=$?
expect "refused, exit 1" "[ $rc = 1 ]"
expect "says what is missing" "printf '%s' \"\$out\" | grep -q 'missing on production'"
expect "nothing deployed" "! grep -q '^vercel' $LOG"
expect "hand-off stays, reply says blocked" "[ -f $SPX_HANDOFF_DIR/$T1.json ] && [ \$(jq -r '.history[-1].status' $SPX_HANDOFF_DIR/replies/$T1.json) = blocked ]"
out="$(STUB_MISSING=team_season_header $D 2>&1)"
expect "running again does not repeat the reply" "[ \$(jq '.history|length' $SPX_HANDOFF_DIR/replies/$T1.json) = 1 ]"

echo "deploy.sh: one refused hand-off stops the deploy of the others"
reset; mk $T1 '.' site-ready; mk $T2 '.migrations = []' site-ready
out="$(STUB_MISSING=team_season_header $D 2>&1)"
expect "no deploy for either" "! grep -q '^vercel' $LOG && [ -f $SPX_HANDOFF_DIR/$T2.json ]"

echo "deploy.sh: commit not on main"
reset; mk $T1 '.commits = ["abcdef1"]' site-ready
out="$($D 2>&1)"
expect "refused" "printf '%s' \"\$out\" | grep -q 'not on origin/main' && ! grep -q '^vercel' $LOG"

echo "deploy.sh: checks fail after the deploy"
reset; mk $T1 '.' site-ready
out="$(STUB_AUTH_FAIL=1 $D 2>&1)"; rc=$?
expect "exit 1, ticket not closed, reply failed" "[ $rc = 1 ] && ! grep -q '^task' $LOG && [ \$(jq -r '.history[-1].status' $SPX_HANDOFF_DIR/replies/$T1.json) = failed ] && [ -f $SPX_HANDOFF_DIR/$T1.json ]"
reset; mk $T1 '.pages = ["/broken"]' site-ready
out="$($D 2>&1)"
expect "a Couldn't load page fails the check" "! grep -q '^task' $LOG && jq -r '.history[-1].detail' $SPX_HANDOFF_DIR/replies/$T1.json | grep -q broken"

echo "deploy.sh: Turso table missing"
reset; mk $T1 '.turso_tables = ["no_such_table"]' site-ready
out="$($D 2>&1)"
expect "refused" "printf '%s' \"\$out\" | grep -q 'missing in Turso' && ! grep -q '^vercel' $LOG"

echo "deploy.sh: data hand-off"
reset; mk $T3 '.ds1_steps[0].file = "db/build/220_x.sql" | .ds1_steps[1].file = "db/build/221_y.sql"' data-ready
out="$($D --dry-run 2>&1)"
expect "dry run shows the ds1-apply dry-run plan and applies nothing" "grep -q 'ds1-apply .*220_x.sql --dry-run' $LOG && ! grep -E '^ds1-apply' $LOG | grep -vq -- '--dry-run' && ! grep -q '^release' $LOG"
: > "$LOG"
out="$(echo n | $D 2>&1)"
expect "answering n applies nothing" "! grep -E '^ds1-apply' $LOG | grep -vq -- '--dry-run' && ! grep -q '^release' $LOG && [ -f $SPX_HANDOFF_DIR/$T3.json ]"
: > "$LOG"
out="$(echo y | $D 2>&1)"
expect "answering y applies both steps in order" "[ \$(grep -E '^ds1-apply' $LOG | grep -vc -- '--dry-run') = 2 ]"
expect "release prepared with tables and ticket" "grep -q \"release prepare --title Jersey numbers and team cities --tables core.person_jersey,core.team_season_city --ticket $T3\" $LOG"
expect "status data-applied-not-released with the release number" "[ \$(jq -r .status $SPX_HANDOFF_DIR/$T3.json) = data-applied-not-released ] && [ \$(jq -r .release $SPX_HANDOFF_DIR/$T3.json) = 2026.10.18-4 ]"
expect "reply says data-applied" "[ \$(jq -r '.history[-1].status' $SPX_HANDOFF_DIR/replies/$T3.json) = data-applied ]"
expect "ticket not closed yet, nothing deployed" "! grep -q '^task' $LOG && ! grep -q '^vercel' $LOG"
: > "$LOG"
out="$(STUB_REL=approved $D 2>&1)"
expect "release still waiting: reported, nothing else" "printf '%s' \"\$out\" | grep -q 'is approved' && ! grep -q '^vercel' $LOG"
out="$(STUB_REL=done $D 2>&1)"
expect "release done + deploy_after_release: deployed and closed" "grep -q '^vercel deploy' $LOG && grep -q \"task done $T3\" $LOG && [ -f $SPX_HANDOFF_DIR/done/$T3.json ]"
expect "history has data-applied, released, deployed" "[ \$(jq -r '[.history[].status] | join(\",\")' $SPX_HANDOFF_DIR/replies/$T3.json) = data-applied,released,deployed ]"

echo "deploy.sh: data step fails"
reset; mk $T3 '.ds1_steps[0].file = "db/build/220_x.sql" | .ds1_steps[1].file = "db/build/221_y.sql"' data-ready
out="$(STUB_DS1_FAIL=1 $D --dry-run 2>&1)"; rc=$?
expect "dry run failure is refused (exit 1)" "[ $rc = 1 ]"

echo "deploy.sh: package tag"
reset
P="$TMP/pkg"; PB="$TMP/pkg-origin.git"
git init -q --bare "$PB"; git init -q "$P"; git -C "$P" -c user.name=t -c user.email=t@example.invalid commit -q --allow-empty -m init
git -C "$P" remote add origin "$PB"; git -C "$P" push -q origin HEAD:main 2>/dev/null; git -C "$P" fetch -q origin
jq --arg id "$T2" --arg sha "$SHA" --arg dir "~/pkgtest" '.ticket_id=$id | .kind="package" | .commits=[$sha] | .package={name:"testpkg",dir:$dir,tag:"v1.2.3"} | del(.migrations,.turso_tables,.pages) | .site_only=true' "$SCRIPTS/handoff/examples/site-ready.json" > "$SPX_HANDOFF_DIR/$T2.json"
ln -s "$P" "$TMP/pkgtest"
out="$(HOME="$TMP" $D --dry-run 2>&1)"
expect "dry run: would tag, nothing pushed" "printf '%s' \"\$out\" | grep -q 'would tag' && [ -z \"\$(git -C $PB tag)\" ]"
out="$(echo n | HOME="$TMP" $D 2>&1)"
expect "n: no tag" "[ -z \"\$(git -C $PB tag)\" ]"
out="$(echo y | HOME="$TMP" $D 2>&1)"
expect "y: tag pushed and ticket closed" "[ \"\$(git -C $PB tag)\" = v1.2.3 ] && grep -q \"task done $T2 --by test-actor --version v1.2.3\" $LOG && [ -f $SPX_HANDOFF_DIR/done/$T2.json ]"

echo "static"
expect "bash -n deploy.sh" "bash -n $SCRIPTS/deploy.sh"
if command -v shellcheck >/dev/null 2>&1; then expect "shellcheck deploy.sh" "shellcheck $SCRIPTS/deploy.sh"; else echo "  (shellcheck not installed; skipped)"; fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" = 0 ]

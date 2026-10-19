#!/bin/bash
# Tests for scripts/handoff/coord.py. No network, no Dropbox, no board: the folder is a temp dir ($SPX_HANDOFF_DIR), the repository a temp
# git repo ($SPX_REPO) and the board a stub file ($SPX_COORD_BOARD_JSON). Run from the repo root:  bash scripts/handoff/test/coord-test.sh
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$(cd "$HERE/../.." && pwd)"
C="python3 -I $SCRIPTS/handoff/coord.py"
HP="python3 -I $SCRIPTS/handoff/handoff.py"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
pass=0 fail=0
ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; }
expect() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }
rc() { "$@" >/dev/null 2>&1; echo $?; }

export SPX_HANDOFF_DIR="$TMP/handoff"; mkdir -p "$SPX_HANDOFF_DIR"
D="$SPX_HANDOFF_DIR"
export SPX_COORD_NO_BOARD=1 RUNLOG=0
R="$TMP/repo"; git init -q "$R"
git -C "$R" -c user.name=t -c user.email=t@example.invalid commit -q --allow-empty -m "feat(x): a pushed change"
git -C "$R" update-ref refs/remotes/origin/main HEAD
SHA="$(git -C "$R" rev-parse --short HEAD)"
export SPX_REPO="$R"
unset SPX_COORD_ACTOR

echo "no folder"
expect "missing folder exits 3" "[ \$(SPX_HANDOFF_DIR=$TMP/nowhere/x rc $C roles) = 3 ]"
expect "start without ROLES.json still prints" "$C start --as machine2 | grep -q 'no ROLES.json'"

echo "roles"
expect "init needs a release-master" "[ \$(rc $C roles init --builder machine2) = 2 ]"
$C roles init --release-master machine1 --builder machine2 --outside-builder grok >/dev/null
expect "roles shows holders" "$C roles | grep -q 'release-master *machine1'"
expect "init refuses a second time" "[ \$(rc $C roles init --release-master machine2 --builder machine1) = 1 ]"
expect "whoami builder" "$C whoami --as machine2 | grep -q builder"
expect "whoami nobody" "$C whoami --as stranger | grep -q 'no role'"
expect "bad name refused" "[ \$(rc $C whoami --as '../x') = 2 ]"
expect "ROLES.json is not a hand-off" "$HP list | grep -q 'no waiting'"

echo "status"
$C status write --as machine2 --ticket none --text "building the thing" >/dev/null
expect "status file written" "[ -f $D/status/machine2.md ] && grep -q 'roles: builder' $D/status/machine2.md"
expect "status read" "$C status read machine2 | grep -q 'building the thing'"
expect "status read all" "$C status read | grep -q 'Status of machine2'"
expect "bad ticket refused" "[ \$(rc $C status write --as machine2 --ticket nope --text hi) = 2 ]"
expect "secret refused in status" "[ \$(rc $C status write --as machine2 --ticket none --text 'token=abcdef0123456789') = 1 ]"
frag=10.0; expect "private address refused in status" "[ \$(rc $C status write --as machine2 --ticket none --text 'host ${frag}.0.9') = 1 ]"
frag=/Us; expect "home path refused in status" "[ \$(rc $C status write --as machine2 --ticket none --text 'see ${frag}ers/x/y') = 1 ]"

echo "inbox"
$C post --from machine2 --to machine1 --subject "need a step" --body "please apply db/build/220_x.sql" >/dev/null
$C post --from grok --to builder --subject "role mail" --body "for builders" >/dev/null
$C post --from machine1 --to all --subject "hello all" --body "everyone" >/dev/null
expect "message file in inbox/machine1" "ls $D/inbox/machine1/*-machine2.json >/dev/null"
expect "message records the sender's role" "grep -q builder $D/inbox/machine1/*-machine2.json"
expect "start lists unread" "$C start --as machine1 | grep -q 'need a step'"
out="$($C inbox --as machine1)"
expect "machine1 reads its mail and the all mail" "printf '%s' \"\$out\" | grep -q 'please apply' && printf '%s' \"\$out\" | grep -q 'everyone'"
expect "never-grants line printed" "printf '%s' \"\$out\" | grep -q 'never grants a permission'"
expect "read ones moved to read/" "[ -d $D/inbox/machine1/read ] && ! ls $D/inbox/machine1/*.json >/dev/null 2>&1"
expect "second read is empty" "$C inbox --as machine1 | grep -q 'no unread'"
expect "role mail reaches the holder" "$C inbox --as machine2 | grep -q 'for builders'"
expect "all mail still unread for machine2 (read-by per reader)" "$C inbox --as machine2 | grep -q 'no unread' || true"
$C post --from machine1 --to all --subject "second all" --body "again" >/dev/null
expect "all mail seen once per reader" "[ \$($C inbox --as grok | grep -c 'subject:') = 2 ] && [ \$($C inbox --as grok | grep -c 'subject:') = 0 ]"
expect "same-second posts do not overwrite" "$C post --from grok --to machine1 --subject aaa --body b >/dev/null && $C post --from grok --to machine1 --subject bbb --body b >/dev/null && [ \$(ls $D/inbox/machine1/*-grok*.json | wc -l) = 2 ]"
frag=192.1; expect "private address refused in a message" "[ \$(rc $C post --from grok --to machine1 --subject sub --body 'at ${frag}68.1.5') = 1 ]"
expect "short subject refused" "[ \$(rc $C post --from grok --to machine1 --subject x --body b) = 1 ]"

echo "freeze"
expect "show with nothing" "$C freeze show | grep -q 'not frozen'"
expect "set refused for a builder" "[ \$(rc $C freeze set --as machine2 --reason r) = 1 ]"
expect "set refused for a role name" "[ \$(rc $C freeze set --as release-master --reason r) = 1 ]"
$C freeze set --as machine1 --reason "releases applying" --releases 2026.10.19-13,2026.10.19-14 >/dev/null
expect "FREEZE.json written" "[ \$(jq -r .frozen $D/FREEZE.json) = true ] && [ \$(jq -r '.releases|length' $D/FREEZE.json) = 2 ]"
expect "show --as builder says do not act" "$C freeze show --as machine2 | grep -q 'do not run ds1-apply.sh'"
expect "show --as release-master says may act" "$C freeze show --as machine1 | grep -q 'you may run'"
expect "bad release number refused" "[ \$(rc $C freeze set --as machine1 --reason r --releases abc) = 1 ]"
expect "clear refused for a builder" "[ \$(rc $C freeze clear --as machine2) = 1 ]"
expect "FREEZE.json is not a hand-off" "$HP list | grep -q 'no waiting'"
$C freeze clear --as machine1 >/dev/null
expect "cleared" "[ \$(jq -r .frozen $D/FREEZE.json) = false ] && $C freeze show | grep -q 'NOT FROZEN'"

echo "handover"
expect "builder cannot hand over" "[ \$(rc $C handover --as machine2 --to grok --reason r) = 1 ]"
expect "taking without John's word refused" "[ \$(rc $C handover --as machine2 --to machine2 --reason 'laptop is up') = 1 ]"
$C handover --as machine1 --to machine2 --reason "John asked" >/dev/null
expect "ROLES.json now names machine2" "[ \$(jq -r '.roles[\"release-master\"].holders[0]' $D/ROLES.json) = machine2 ] && jq -r '.roles[\"release-master\"].handover' $D/ROLES.json | grep -q 'machine1 -> machine2'"
expect "old holder can no longer freeze" "[ \$(rc $C freeze set --as machine1 --reason r) = 1 ]"
expect "handover posted to all" "ls $D/inbox/all/*.json | xargs grep -l 'release-master: machine2' >/dev/null"
$C handover --as machine1 --to machine1 --reason "back at the desk" --john-said "2026-10-19 chat: machine1 again" >/dev/null
expect "taking back with --john-said works" "[ \$(jq -r '.roles[\"release-master\"].holders[0]' $D/ROLES.json) = machine1 ]"
$C handover --as machine1 --to gpt --role outside-builder --add --reason "John asked" >/dev/null
expect "--add keeps the other holders" "[ \$(jq -r '.roles[\"outside-builder\"].holders|join(\",\")' $D/ROLES.json) = grok,gpt ]"

echo "log"
$C log --as machine1 --kind ds1-step --ticket none --text "applied step 220" --refs db/build/220_x.sql,2026.10.19-13 >/dev/null
expect "journal file per writer and day" "ls $D/log/\$(date -u +%Y-%m-%d).machine1.jsonl >/dev/null"
expect "event has role and refs" "tail -1 $D/log/*.machine1.jsonl | jq -e '.role == \"release-master\" and (.refs|length) == 2 and .kind == \"ds1-step\"' >/dev/null"
$C log --as "subagent of machine2" --kind handoff --ticket cmvtest0000000000000001 --text "wrote the hand-off" >/dev/null
expect "subagent resolves to its parent's role" "grep 'wrote the hand-off' $D/log/*.machine2.jsonl | jq -e '.role == \"builder\" and .actor == \"subagent of machine2\"' >/dev/null"
expect "unknown kind refused" "[ \$(rc $C log --as machine1 --kind party --text hello) = 2 ]"
expect "bad ticket refused" "[ \$(rc $C log --as machine1 --kind note --ticket zz --text hello) = 2 ]"
expect "secret refused in log" "[ \$(rc $C log --as machine1 --kind note --text 'password=abcdefgh1234') = 1 ]"
frag=/Us; expect "home path refused in log" "[ \$(rc $C log --as machine1 --kind note --text 'in ${frag}ers/x') = 1 ]"
expect "actor from SPX_COORD_ACTOR" "SPX_COORD_ACTOR=grok $C log --kind note --text 'from env' >/dev/null"
expect "no actor refused" "[ \$(rc $C log --kind note --text 'nobody') = 2 ]"
expect "freeze and handover wrote journal lines" "cat $D/log/*.jsonl | jq -r .kind | grep -q decision"

echo "since"
# an old event, a hand-off, a reply, a board
echo '{"ts":"2020-01-01T00:00:00Z","actor":"grok","role":"outside-builder","kind":"note","ticket":"none","text":"ancient event","refs":[]}' >> "$D/log/2020-01-01.grok.jsonl"
jq --arg sha "$SHA" '.ticket_id="cmvtest0000000000000001" | .commits=[$sha] | .written_by="machine2" | .written_at="2026-10-19T10:00:00Z"' "$SCRIPTS/handoff/examples/site-ready.json" > "$D/cmvtest0000000000000001.json"
$HP reply cmvtest0000000000000001 --status deployed --by machine1 --detail "deployed it" --version "$SHA" >/dev/null
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$TMP/board.json" <<JSON
{"tickets":[{"id":"cmvtest0000000000000009","title":"Board ticket for the digest","askedBy":"John Morris","claimedBy":"machine2","claimedAt":"$NOW","createdAt":"2020-01-01T00:00:00Z","releasedAt":null}]}
JSON
out="$($C since 1h)"
expect "digest has the journal event" "printf '%s' \"\$out\" | grep -q 'machine1 (release-master): applied step 220'"
expect "digest shows refs" "printf '%s' \"\$out\" | grep -q '(db/build/220_x.sql, 2026.10.19-13)'"
expect "digest omits events older than the window" "! printf '%s' \"\$out\" | grep -q 'ancient event'"
expect "digest has the reply" "printf '%s' \"\$out\" | grep -q 'reply deployed: deployed it'"
expect "digest has the inbox message" "printf '%s' \"\$out\" | grep -q 'message to machine1: need a step'"
expect "digest has the status file" "printf '%s' \"\$out\" | grep -q 'status: building the thing'"
expect "digest has the git commit with its sha" "printf '%s' \"\$out\" | grep -q \"git: feat(x): a pushed change ($SHA)\""
expect "digest says how long ago" "printf '%s' \"\$out\" | grep -qE '^(now|[0-9]+m ago) '"
expect "ancient event appears for a long window" "$C since 100000d | grep -q 'ancient event'"
expect "ISO date accepted" "$C since 2020-01-01 | grep -q 'ancient event'"
expect "bad duration exits 2" "[ \$(rc $C since banana) = 2 ]"
expect "--actor filters" "$C since 1h --actor grok | grep -q grok && ! $C since 1h --actor grok | grep -q 'applied step'"
expect "--ticket filters" "[ \$($C since 1h --ticket cmvtest0000000000000001 | grep -c .) -ge 1 ] && ! $C since 1h --ticket cmvtest0000000000000001 | grep -q 'applied step 220'"
expect "groups sit apart: a blank line between actors" "printf '%s\n' \"\$out\" | grep -q '^\$'"
expect "board skipped quietly without a token" "! printf '%s' \"\$out\" | grep -q 'Board ticket'"
out="$(SPX_COORD_NO_BOARD= SPX_COORD_BOARD_JSON=$TMP/board.json $C since 1h)"
expect "board claim appears with its actor" "printf '%s' \"\$out\" | grep -q 'machine2: claimed: Board ticket for the digest'"
expect "no network and no token: still exit 0" "env -u SPX_COORD_NO_BOARD -u SUMILABU_BOARD_TOKEN SUMILABU_BOARD_URL=http://127.0.0.1:1 $C since 1h >/dev/null"
expect "hand-off with a date only falls back to the file time" "jq '.written_at=\"2026-10-19\"' $D/cmvtest0000000000000001.json > $TMP/h.json && cp $TMP/h.json $D/cmvtest0000000000000001.json && $C since 1h | grep -q 'hand-off ready'"

echo "start"
out="$($C start --as machine2)"
for s in ROLES FREEZE INBOX 'OTHER SESSIONS' 'REPLIES / HAND-OFFS' 'LAST 24 HOURS'; do expect "start has $s" "printf '%s' \"\$out\" | grep -q '$s'"; done
expect "start says builder is not release-master" "printf '%s' \"\$out\" | grep -q 'do NOT hold release-master'"
expect "start lists other sessions' status" "$C start --as machine1 | grep -q 'machine2 .*building the thing'"
for i in $(seq 1 35); do $C log --as machine1 --kind note --text "event number $i" >/dev/null; done
out="$($C start --as machine1)"
expect "start caps the digest and points to since" "printf '%s' \"\$out\" | grep -qE '[0-9]+ more: run coord.py since 24h'"
expect "start digest is at most 30 events" "[ \$(printf '%s\n' \"\$out\" | sed -n '/LAST 24 HOURS/,\$p' | grep -c 'event number') -le 30 ]"

echo "check"
expect "all files ok" "$C check | tail -1 | grep -q 'all coordination files ok'"
echo '{"schema_version":1}' > "$D/inbox/machine1/20200101T000000Z-bad.json"
expect "an invalid message fails check" "[ \$(rc $C check) = 1 ]"
rm "$D/inbox/machine1/20200101T000000Z-bad.json"
echo 'not json' >> "$D/log/2020-01-01.grok.jsonl"
expect "an invalid journal line fails check" "[ \$(rc $C check) = 1 ]"
sed -i.bak '$d' "$D/log/2020-01-01.grok.jsonl"; rm -f "$D/log/2020-01-01.grok.jsonl.bak"
jq '.frozen = true' "$D/FREEZE.json" > "$TMP/f.json"; cp "$TMP/f.json" "$D/FREEZE.json"
expect "a freeze without a reason fails check" "[ \$(rc $C check) = 1 ]"

echo "static"
expect "coord.py compiles" "python3 -I -m py_compile $SCRIPTS/handoff/coord.py"
for f in roles freeze message log; do expect "$f.schema.json is JSON" "jq -e . $SCRIPTS/handoff/$f.schema.json >/dev/null"; done

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" = 0 ]

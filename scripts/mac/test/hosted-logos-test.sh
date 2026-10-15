#!/bin/bash
# Tests scripts/mac/lib/hosted-logos.sh and scripts/logos/export_hosted.py with a stand-in psql: the SportsLogos.Net files come out of DS1's archive
# into web/public/team-logos/sl, the run stops when a file a brand row names is missing or its bytes do not match, the password never reaches a
# command line, and deploy-prebuilt.sh and ds1-preview.sh write the files before they build. Writes only under a temp folder; touches no DS1.
#   bash scripts/mac/test/hosted-logos-test.sh

HERE=$(cd "$(dirname "$0")" && pwd)
LIB="$HERE/../lib/hosted-logos.sh"
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/spx-hosted-logos-test.XXXXXX")
trap 'rm -rf "$ROOT"' EXIT
PASS=0; FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
check() { local d=$1; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi; }

cp "$HERE/stub-psql-logos.py" "$ROOT/psql"; chmod +x "$ROOT/psql"
printf '#!/bin/bash\nexit 0\n' > "$ROOT/security"; chmod +x "$ROOT/security"

A="GIF89a-first-file"; B="second-file-bytes"
sha() { printf '%s' "$1" | python3 -I -c 'import hashlib,sys; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())'; }
hex() { printf '%s' "$1" | python3 -I -c 'import sys; print(sys.stdin.buffer.read().hex())'; }

# scenario <name> <referenced urls, newline separated> <archive rows file content>; sets W (the web dir), OUT and RC
N=0
run() {
  N=$((N + 1)); E="$ROOT/s$N"; mkdir -p "$E/web"
  printf '%b' "$1" > "$E/referenced"; printf '%b' "$2" > "$E/rows"; : > "$E/log"
  W="$E/web"
  OUT=$(
    export STUB_REFERENCED="$E/referenced" STUB_ROWS="$E/rows" STUB_LOG="$E/log" SPX_PSQL="$ROOT/psql"
    export SPX_DS1_HOST=192.0.2.10 SPX_DS1_DB_PASSWORD="${PW-hunter2-secret}" PATH="$ROOT:/usr/bin:/bin:/sbin:$PATH"
    say() { echo "say: $*"; }
    die() { echo "STOP: $*"; exit 1; }
    . "$LIB"
    hosted_logos_export "$W" 2>&1
  )
  RC=$?
  LOG="$E/log"
}

# 1. two files, both referenced
run "/team-logos/sl/5044.gif\n/team-logos/sl/abc.png\n" "/team-logos/sl/5044.gif\t$(sha "$A")\t$(hex "$A")\n/team-logos/sl/abc.png\t$(sha "$B")\t$(hex "$B")\n"
check "two referenced files: success" test "$RC" = 0
check "first file written with its exact bytes" test "$(cat "$W/public/team-logos/sl/5044.gif" 2>/dev/null)" = "$A"
check "second file written with its exact bytes" test "$(cat "$W/public/team-logos/sl/abc.png" 2>/dev/null)" = "$B"
check "the count is printed" grep -q "wrote 2 logo files" <<<"$OUT"
check "the password never appears on a command line" bash -c "! grep -q hunter2-secret '$LOG'"
check "it reaches psql through the environment" grep -q "pgpassword_set=True" "$LOG"
check "the session is read only" grep -q "read_only=True" "$LOG"
check "the DS1 host comes from the setting" grep -q "host=192.0.2.10" "$LOG"

# 2. an archived file nobody references is not written
run "/team-logos/sl/5044.gif\n" "/team-logos/sl/5044.gif\t$(sha "$A")\t$(hex "$A")\n/team-logos/sl/unused.png\t$(sha "$B")\t$(hex "$B")\n"
check "unreferenced archive rows are skipped" bash -c "test '$RC' = 0 && test -f '$W/public/team-logos/sl/5044.gif' && ! test -e '$W/public/team-logos/sl/unused.png'"

# 3. a referenced file is missing from the archive: stop, write nothing
run "/team-logos/sl/5044.gif\n/team-logos/sl/gone.png\n" "/team-logos/sl/5044.gif\t$(sha "$A")\t$(hex "$A")\n"
check "a missing referenced file stops the run" test "$RC" != 0
check "it names the missing file" grep -q "gone.png" <<<"$OUT"
check "nothing is written when one is missing" bash -c "! test -e '$W/public/team-logos/sl/5044.gif'"

# 4. bytes that do not match their sha256: stop
run "/team-logos/sl/5044.gif\n" "/team-logos/sl/5044.gif\t$(sha "something else")\t$(hex "$A")\n"
check "a sha256 mismatch stops the run" test "$RC" != 0
check "the mismatch is named" grep -q "sha256" <<<"$OUT"
check "a mismatched file is not written" bash -c "! test -e '$W/public/team-logos/sl/5044.gif'"

# 5. a path outside /team-logos/sl/ is refused
run "/team-logos/sl/../../evil.gif\n" ""
check "a path with .. is refused" test "$RC" != 0
run "/team-logos/other/x.gif\n" ""
check "a path outside /team-logos/sl is refused" test "$RC" != 0

# 6. no logos referenced: nothing to do, success
run "" ""
check "no hosted logos: success, nothing written" bash -c "test '$RC' = 0 && grep -q 'wrote 0 logo files' <<<'$OUT'"

# 7. no password: stop before psql
PW="" run "/team-logos/sl/5044.gif\n" "/team-logos/sl/5044.gif\t$(sha "$A")\t$(hex "$A")\n"
unset PW
check "no DS1 password stops the run" test "$RC" != 0
check "psql was never called without a password" bash -c "! test -s '$LOG'"

# 8. the two scripts that build write the files first
lineof() { grep -n "$2" "$1" | head -1 | cut -d: -f1; }
dp="$HERE/../deploy-prebuilt.sh"; pv="$HERE/../ds1-preview.sh"
check "deploy-prebuilt.sh sources the library" grep -q 'lib/hosted-logos.sh' "$dp"
check "deploy-prebuilt.sh exports the logos before vercel build" bash -c "[ '$(lineof "$dp" '^hosted_logos_export')' -lt '$(lineof "$dp" 'vercel build --prod --yes')' ]"
check "ds1-preview.sh sources the library" grep -q 'lib/hosted-logos.sh' "$pv"
check "ds1-preview.sh exports the logos into the image source before compose build" bash -c "[ '$(lineof "$pv" 'hosted_logos_export "\$SRC/web"')' -lt '$(lineof "$pv" 'compose build --quiet site')' ]"
check "ds1-preview.sh --update and --install both use prepare_src" bash -c "[ \$(grep -c 'prepare_src \"\${REF:-origin/main}\"' '$pv') = 2 ]"

echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]

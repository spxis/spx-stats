#!/bin/bash
# Tests for scripts/mac/check-live-auth.sh and the build assertion of deploy-prebuilt.sh against a fake site on 127.0.0.1:$PORT (7791 by default,
# inside this project's 7700-7799 block) and a stub `vercel`. Sends nothing to production. Run from the repo root:
#   bash scripts/mac/test/check-live-auth-test.sh
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="$HERE/../check-live-auth.sh"
PORT="${SPX_TEST_PORT:-7791}"
TMP="$(mktemp -d)"; PID=""
cleanup() { [ -z "$PID" ] || kill "$PID" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT
pass=0 fail=0
ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; }

# A fake vercel that lists two READY production deployments, newest first.
mkdir -p "$TMP/bin"
cat > "$TMP/bin/vercel" <<'EOF'
#!/bin/sh
echo '{"deployments":[{"url":"spx-stats-new.vercel.app","state":"READY","target":"production"},{"url":"spx-stats-old.vercel.app","state":"READY","target":"production"},{"url":"spx-stats-older.vercel.app","state":"READY","target":"production"}]}'
EOF
chmod +x "$TMP/bin/vercel"

# serve <providers status> <providers body> <home html>: a fake site on $PORT
serve() {
  [ -z "$PID" ] || { kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; }
  python3 -I - "$PORT" "$1" "$2" "$3" >/dev/null 2>&1 <<'EOF' &
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
port, pstatus, pbody, home = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4]
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path == "/api/auth/providers": status, body = pstatus, pbody
        elif self.path == "/": status, body = 200, home
        else: status, body = 404, ""
        self.send_response(status); self.send_header("content-type", "text/html"); self.end_headers(); self.wfile.write(body.encode())
HTTPServer(("127.0.0.1", port), H).serve_forever()
EOF
  PID=$!; disown "$PID" 2>/dev/null
  for _ in $(seq 1 30); do curl -s -m 2 -o /dev/null "http://127.0.0.1:$PORT/" && return 0; sleep 0.2; done
  echo "the fake site did not start"; exit 1
}
run() { PATH="$TMP/bin:$PATH" bash "$CHECK" --url "http://127.0.0.1:$PORT" "$@" 2>&1; }

GOOD_HOME='<header><a class="signin-link" href="/login">Sign in</a></header>'
serve 200 '{"google":{"id":"google"}}' "$GOOD_HOME"
out="$(run --new https://spx-stats-new.vercel.app)"; rc=$?
[ $rc = 0 ] && echo "$out" | grep -q "ok" && ok "healthy site passes" || { bad "healthy site passes ($rc): $out"; }

serve 404 '' "$GOOD_HOME"
out="$(run --new https://spx-stats-new.vercel.app)"; rc=$?
[ $rc = 1 ] && echo "$out" | grep -q "HTTP 404" && ok "auth routes 404 fail" || bad "auth routes 404 fail ($rc): $out"
echo "$out" | grep -q "vercel promote https://spx-stats-old.vercel.app" && ok "rollback names the previous deployment, not the new one" || bad "rollback command: $out"
echo "$out" | grep -q "do not prune" && ok "tells the caller not to prune" || bad "no prune warning"

serve 200 '{}' "$GOOD_HOME"
out="$(run --skip-list)"; rc=$?
[ $rc = 1 ] && echo "$out" | grep -q "does not list google" && ok "providers without google fail" || bad "providers without google ($rc): $out"
echo "$out" | grep -q "vercel list spx-stats" && ok "--skip-list prints the manual rollback steps" || bad "--skip-list text: $out"

serve 200 '{"google":{}}' '<header><button class="theme">Dark</button></header>'
out="$(run --skip-list)"; rc=$?
[ $rc = 1 ] && echo "$out" | grep -q "no sign-in control" && ok "kept page built signed-out fails" || bad "signed-out page ($rc): $out"

# The build assertion of deploy-prebuilt.sh: the kept home page in the build output must carry the sign-in control.
mkdir -p "$TMP/out/.vercel/output/functions/en"
printf '%s' "$GOOD_HOME" > "$TMP/out/.vercel/output/functions/en/s.prerender-fallback.html"
if ( cd "$TMP/out" && . "$HERE/../lib/build-auth.sh" && build_has_signin ); then ok "build output with the control passes"; else bad "build output with the control passes"; fi
printf '%s' '<header><button class="theme">Dark</button></header>' > "$TMP/out/.vercel/output/functions/en/s.prerender-fallback.html"
if ( cd "$TMP/out" && . "$HERE/../lib/build-auth.sh" && build_has_signin ); then bad "build output without the control is refused"; else ok "build output without the control is refused"; fi
rm "$TMP/out/.vercel/output/functions/en/s.prerender-fallback.html"
if ( cd "$TMP/out" && . "$HERE/../lib/build-auth.sh" && build_has_signin ); then bad "no home page in the output is refused"; else ok "no home page in the output is refused"; fi

echo
echo "passed $pass, failed $fail"
[ "$fail" = 0 ]

# The build-time half of the sign-in guard (deploy-prebuilt.sh; the live half is scripts/mac/check-live-auth.sh). Source it; never run it.
#
#   build_home_html   prints the path of the kept home page's HTML in the build output of the current directory (the English copy the
#                     rewrite for "/" serves), or nothing when there is none
#   build_has_signin  succeeds when that page carries the sign-in control (class="signin-link"), which the kept pages bake in when
#                     they are built with sign-in on (web/src/lib/auth/enabled.ts). A build made without it ships every page signed-out
#                     (2026-10-15), so the deploy stops here instead.

build_home_html() {
  local f
  for f in \
    .vercel/output/functions/en/s.prerender-fallback.html \
    .vercel/output/static/en/s.html \
    web/.next/server/app/en/s.html \
    .next/server/app/en/s.html; do
    [ -f "$f" ] && { printf '%s' "$f"; return 0; }
  done
  # The layout of Vercel's output can change: look for the English "s" page by its name before giving up.
  find .vercel/output web/.next/server/app -type f \( -path '*/en/s.prerender-fallback.html' -o -path '*/en/s.html' \) 2>/dev/null | head -1
}

build_has_signin() {
  local f
  f="$(build_home_html)"
  [ -n "$f" ] && grep -q 'class="signin-link"' "$f"
}

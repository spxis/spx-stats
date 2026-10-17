import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolvePageDestination } from "@/lib/routing";

/**
 * Apply the public-page destinations (lib/routing.ts) on every request, including App Router
 * client navigations (RSC). next.config afterFiles rewrites do this for a full load, but on
 * Vercel (minimal mode) the Next server skips them, so a click on /players or /teams from a
 * kept league page matches app/[locale] with locale=players|teams and the archive 404. A
 * refresh then hits the Vercel rewrite and shows the list. Next 16 also assumes a pathname's
 * rewrite does not change with the query string (/players vs /players?from=&to= is s/ vs q/).
 */
export function proxy(request: NextRequest) {
  const dest = resolvePageDestination(
    request.nextUrl.pathname,
    request.nextUrl.searchParams,
    request.headers.get("cookie"),
    request.headers.get("accept-language"),
  );
  if (!dest || dest === request.nextUrl.pathname) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = dest;
  return NextResponse.rewrite(url);
}

export const config = {
  // Public pages only. Same first segments as RESERVED_ROOTS in lib/routing.ts (must be a
  // literal so Next can analyse it at build). Files with a suffix stay on disk.
  matcher: [
    "/((?!api/|_next/|surface/|admin(?:/|$)|me(?:/|$)|login(?:/|$)|tickets(?:/|$)|brand/|flag/|soccer-flag|soccer-road/|bracket-svg/|jersey-banner/|title-banner/|favicon\\.ico$|manifest\\.webmanifest$|sitemap\\.xml$|robots\\.txt$|venues\\.csv$|venues\\.geojson$|soccer-flags).*)",
  ],
};

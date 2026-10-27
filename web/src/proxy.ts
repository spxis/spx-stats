import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { HINT_COOKIE, HINT_SECONDS } from "@/lib/auth/hint";
import { decideGate } from "@/lib/invite/gate";
import { CLOSED_HEADERS, REFUSAL_HEADERS, siteClosed } from "@/lib/invite/rules";
import { sessionOfRequest } from "@/lib/invite/session";
import { isInvited } from "@/lib/invite/store";
import { resolvePageDestination } from "@/lib/routing";

/**
 * Two jobs, in this order.
 *
 * 1. THE GATE (lib/invite, ticket "invite-only site"). While SITE_ACCESS says the site is closed (always on Vercel unless SITE_ACCESS=open), a request
 *    gets through only with a session cookie whose address is an admin (ADMIN_EMAILS) or on the invite list, or with the deploy-check bypass header.
 *    The session is read from the cookie alone: a signed-out request costs no database read and renders nothing (a browser opening a page is
 *    rewritten to the one small /invite-only page, anything else gets a few bytes). A signed-in request reads the invite list from a copy
 *    this instance keeps for a minute. The kept pages behind the gate stay kept (static, `x-nextjs-cache: HIT`): the proxy only decides whether
 *    the visitor may have them. Always reachable: the release runner's POST /api/revalidate (its own secret), /api/auth/*, /api/me, /login,
 *    /invite-only, the site's icons, and robots.txt (answered here as Disallow all). Every response carries X-Robots-Tag noindex while closed.
 *    SITE_ACCESS=open skips all of it.
 * 2. THE PAGE DESTINATIONS (lib/routing.ts): apply the public-page destinations on every request, including App Router
 *    client navigations (RSC). next.config afterFiles rewrites do this for a full load, but on
 *    Vercel (minimal mode) the Next server skips them, so a click on /players or /teams from a
 *    kept league page matches app/[locale] with locale=players|teams and the archive 404. A
 *    refresh then hits the Vercel rewrite and shows the list. Next 16 also assumes a pathname's
 *    rewrite does not change with the query string (/players vs /players?from=&to= is s/ vs q/).
 *    resolvePageDestination answers nothing for the reserved first segments (api, admin, login, brand, ...), so running it on every path is safe.
 */
function pageDestination(request: NextRequest): NextResponse {
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

/** next-auth's session cookie, by its two names (Secure on https), each possibly cut into numbered chunks. */
const SESSION_COOKIES = ["__Secure-next-auth.session-token", "next-auth.session-token"];

/**
 * A browser that carries a session but has lost the "ask" hint (lib/auth/hint.ts) draws the signed-out header on every kept page, and its Sign in
 * link only leads back to where it was (/login sends a signed-in reader on). Give the hint back with the response. It is only a hint: /api/me
 * answers from the real session, and clears it when that session is gone.
 */
function withHint(request: NextRequest, res: NextResponse): NextResponse {
  const session = request.cookies.getAll().some((c) => SESSION_COOKIES.some((name) => c.name === name || c.name.startsWith(`${name}.`)));
  if (session && request.cookies.get(HINT_COOKIE)?.value !== "1") {
    res.cookies.set(HINT_COOKIE, "1", { path: "/", maxAge: HINT_SECONDS, sameSite: "lax", secure: request.nextUrl.protocol === "https:" });
  }
  return res;
}

function withHeaders(res: NextResponse, headers: Record<string, string>): NextResponse {
  for (const [name, value] of Object.entries(headers)) res.headers.set(name, value);
  return res;
}

/** The gate (lib/invite/gate.ts decides). Returns the response that stops the request, or null to let it on. */
async function gate(request: NextRequest): Promise<NextResponse | null> {
  const { pathname, search } = request.nextUrl;
  const answer = await decideGate(
    { pathname, search, method: request.method, headers: request.headers, env: process.env },
    () => sessionOfRequest(request, process.env),
    (email) => isInvited(email),
  );
  switch (answer.action) {
    case "pass":
      return null;
    case "robots":
      return new NextResponse(answer.body, { status: 200, headers: { ...REFUSAL_HEADERS, "content-type": "text/plain; charset=utf-8" } });
    case "rewrite": {
      const url = request.nextUrl.clone();
      const [path, query] = answer.to.split("?");
      url.pathname = path;
      url.search = `?${query}`;
      return withHeaders(NextResponse.rewrite(url), REFUSAL_HEADERS);
    }
    case "refuse":
      return new NextResponse(answer.body, { status: answer.status, headers: { ...REFUSAL_HEADERS, "content-type": answer.contentType } });
  }
}

export async function proxy(request: NextRequest) {
  if (!siteClosed(process.env)) return withHint(request, pageDestination(request));
  const stopped = await gate(request);
  if (stopped) return stopped;
  return withHint(request, withHeaders(pageDestination(request), CLOSED_HEADERS));
}

export const config = {
  // Every path except the build's own static files and the icon: the gate must see pages, data routes and the public/ files alike.
  // (The page destinations no longer need a list of excluded roots here: resolvePageDestination leaves the reserved first segments alone.)
  matcher: ["/((?!_next/static/|favicon\\.ico$).*)"],
};

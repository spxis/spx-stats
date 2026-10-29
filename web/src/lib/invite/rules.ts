/**
 * The invite-only gate, as pure rules (no server-only import, no network: scripts/invite.test.ts runs them, and src/proxy.ts applies them).
 *
 * The site is closed or open by ONE setting, the environment variable SITE_ACCESS:
 *   invite  every page and data route needs a signed-in Google account that is an admin (ADMIN_EMAILS) or on the invite list (Turso)
 *   open    no gate at all: the proxy does what it did before the gate existed
 * Unset, the answer is `invite` on Vercel (any deployment there) and `open` everywhere else (next dev, a local build, the DS1 preview), so
 * a Vercel deployment is closed until someone writes SITE_ACCESS=open. Opening again is that one setting and a redeploy, never a code change.
 */
import { adminEmails, isAdmin } from "../auth/admin.ts";

type Env = Record<string, string | undefined>;
type Headers = { get(name: string): string | null };

export type SiteAccess = "invite" | "open";

export function siteAccess(env: Env): SiteAccess {
  const set = (env.SITE_ACCESS ?? "").trim().toLowerCase();
  if (set === "open" || set === "invite") return set;
  return env.VERCEL ? "invite" : "open";
}

export const siteClosed = (env: Env): boolean => siteAccess(env) === "invite";

/** Paths that answer a signed-out request while the site is closed. Each one reads no database for a signed-out visitor. */
const EXEMPT_EXACT = new Set([
  "/api/revalidate", // the release runner's POST: its own secret, checked by the route
  "/api/me", // who is signed in: answers null for anyone else, reads nothing for them
  "/api/locale", // the language cookie of the invite page
  "/login", // redirects to the invite page while closed
  "/invite-only", // the page itself (it is also where a rewrite lands)
  "/favicon.ico",
  "/manifest.webmanifest",
]);
const EXEMPT_PREFIX = ["/api/auth/", "/_next/static/", "/brand/", "/mascot/"];

/** True for the addresses that stay reachable while the site is closed. robots.txt is answered by the gate itself (`robotsClosed`). */
export function gateExempt(pathname: string): boolean {
  return EXEMPT_EXACT.has(pathname) || EXEMPT_PREFIX.some((p) => pathname.startsWith(p));
}

/** A request for data rather than a page: it gets a short JSON refusal, never the invite page. */
export function isDataPath(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return true;
  if (/\/rows\//.test(pathname)) return true;
  if (/^\/(surface|flag|soccer-flag|soccer-road|bracket-svg|field-plays|jersey-banner|title-banner)(\/|$)/.test(pathname)) return true;
  return /\.[a-z0-9]{2,8}$/i.test(pathname.slice(pathname.lastIndexOf("/") + 1));
}

/** A browser opening a page (as opposed to a crawler or a script): such a request is worth the one dynamic render of the invite page. */
export function isBrowserNavigation(headers: Headers, method: string): boolean {
  if (method !== "GET") return false;
  return headers.get("sec-fetch-dest") === "document" && headers.get("sec-fetch-mode") === "navigate";
}

/** The two headers every response carries while the site is closed. */
export const CLOSED_HEADERS: Record<string, string> = {
  "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
};
/** What a refusal carries on top: never kept by the data cache, the CDN or a browser. */
export const REFUSAL_HEADERS: Record<string, string> = { ...CLOSED_HEADERS, "cache-control": "private, no-store" };

export const robotsClosed = (): string => "User-agent: *\nDisallow: /\n";

/** Marks the invite page's HTML, so a deploy check can tell "the gate answered" from "the page is missing its sign-in control". */
export const GATE_MARKER = 'data-site-gate="closed"';

/** The short body a signed-out request that is not a browser page navigation gets: no render, no script, no database. */
export function refusalHtml(next: string): string {
  const href = `/invite-only?next=${encodeURIComponent(next)}`;
  return `<!doctype html><html lang="en" ${GATE_MARKER}><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Invite only</title></head>`
    + `<body><p>This site is invite only. <a href="${href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">Sign in</a>.</p></body></html>`;
}

export const refusalJson = (signedIn: boolean): string =>
  JSON.stringify({ error: signedIn ? "This account is not on the invite list." : "This site is invite only. Sign in at /invite-only." });

/** Constant-time string compare (the proxy cannot import node:crypto's timingSafeEqual on every runtime, so this is the plain version). */
export function sameSecret(a: string, b: string): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Deploy checks and the Mac scripts reach the real pages with Vercel's own protection-bypass header (scripts/deploy.sh sends it already).
 * Vercel puts that secret in the deployment's environment as VERCEL_AUTOMATION_BYPASS_SECRET; SITE_GATE_BYPASS names one of our own.
 * Neither is ever written to a file or a log.
 */
export function bypassOk(headers: Headers, env: Env): boolean {
  const sent = (headers.get("x-vercel-protection-bypass") ?? headers.get("x-spxn-gate-bypass") ?? "").trim();
  if (!sent) return false;
  return [env.SITE_GATE_BYPASS, env.VERCEL_AUTOMATION_BYPASS_SECRET].some((s) => sameSecret(sent, (s ?? "").trim()));
}

// ----------------------------------------------------------------------------------------------------------------- who is let in

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** A plain address: one @, no spaces or commas, a dot in the domain, at most 200 characters. */
export function validEmail(email: string): boolean {
  const e = normalizeEmail(email);
  return e.length <= 200 && /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]+$/.test(e);
}

export interface GateSession {
  email: string;
  emailVerified: boolean;
  /** True when the sign-in itself checked the invite list (the token's claim): used only when the list cannot be read. */
  invitedClaim: boolean;
}

export type Verdict = "allow" | "signed-out" | "not-invited";

/**
 * Decides one request from what the session says and what the invite list says. `invited` is true or false when the list could be read
 * and null when it could not (Turso down, no cached copy): then the claim made at sign-in decides, so a Turso outage does not lock out
 * people who were let in, and never lets in someone who was not.
 */
export function verdict(session: GateSession | null, invited: boolean | null, env: Env): Verdict {
  if (!session?.email) return "signed-out";
  if (!session.emailVerified) return "not-invited";
  if (isAdmin(session.email, session.emailVerified, env)) return "allow";
  if (invited === null) return session.invitedClaim ? "allow" : "not-invited";
  return invited ? "allow" : "not-invited";
}

/** Whether an address is let in without the list: the admins of the environment. */
export const isEnvAdmin = (email: string, env: Env): boolean => adminEmails(env).includes(normalizeEmail(email));

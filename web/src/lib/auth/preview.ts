/**
 * The preview-only sign-in ("Sign in (this Mac)"): lets the always-on DS1 preview and `scripts/mac/ds1-preview.sh` sign in as the admin
 * without Google, because those copies have no Google client. Pure (no server-only import) so a script can test it.
 *
 * It exists only when ALL of these hold, and each is checked again on every request that uses it:
 *  - SPX_PREVIEW=1, which only scripts/mac/ds1-preview.sh and the preview image set (Vercel never does);
 *  - VERCEL is not set (a belt on top of the first rule: a deployment on Vercel never has this sign-in, whatever else is set);
 *  - AUTH_SECRET (or NEXTAUTH_SECRET) is set, so the session is signed; the preview script makes one the first time and keeps it in
 *    its 600-permission env file;
 *  - the request names a loopback host (localhost, 127.0.0.1, [::1]) and carries no forwarding header that names anything else.
 * A session made this way carries `preview: true`; it is honoured only while the same conditions hold (lib/auth/user.ts), so a cookie
 * copied elsewhere is worth nothing.
 */
type Env = Record<string, string | undefined>;
type Headers = { get(name: string): string | null };

/** The fallback admin when neither SPX_PREVIEW_ADMIN nor ADMIN_EMAILS names one: the owner's address, which AGENTS.md already publishes as the commit address. */
export const DEFAULT_PREVIEW_ADMIN = "john@spxis.com";

/** The key the dev sign-in signs its throwaway session with when no AUTH_SECRET is set (never in a production build: devLogin is false there). */
export const DEV_SECRET = "dev-sign-in-not-a-secret";

/** The fake admin of the dev sign-in: a reserved address that is not a real mailbox. */
export const DEV_ADMIN = "dev-admin@example.invalid";

/** The dev sign-in for agents' own servers: needs `next dev` (NODE_ENV=development), SPXN_DEV_LOGIN=1 and no VERCEL. A production build never has it. */
export function devLogin(env: Env): boolean {
  return env.NODE_ENV === "development" && env.SPXN_DEV_LOGIN === "1" && !env.VERCEL;
}

/** The /dev page answers only when the dev sign-in is on and the request names a loopback host. */
export function devPageAllowed(env: Env, headers: Headers): boolean {
  return devLogin(env) && loopbackRequest(headers);
}

export function previewMode(env: Env): boolean {
  return (env.SPX_PREVIEW === "1" || devLogin(env)) && !env.VERCEL;
}

/** Whether the preview sign-in may be offered at all (a signing secret is needed to make a session). */
export function previewSignInEnabled(env: Env): boolean {
  return previewMode(env) && (devLogin(env) || Boolean((env.AUTH_SECRET ?? env.NEXTAUTH_SECRET ?? "").trim()));
}

/** The address the preview signs in as: SPX_PREVIEW_ADMIN, else the first ADMIN_EMAILS (or ADMIN_GOOGLE_ALLOWED_EMAILS) entry, else the default. */
export function previewAdminEmail(env: Env): string {
  if (devLogin(env) && env.SPX_PREVIEW !== "1") return DEV_ADMIN;
  const own = (env.SPX_PREVIEW_ADMIN ?? "").trim().toLowerCase();
  if (own) return own;
  for (const name of ["ADMIN_EMAILS", "ADMIN_GOOGLE_ALLOWED_EMAILS"]) {
    const first = (env[name] ?? "").split(/[,\s]+/).map((e) => e.trim().toLowerCase()).find((e) => e.length > 0);
    if (first) return first;
  }
  return DEFAULT_PREVIEW_ADMIN;
}

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i;

/**
 * True when the request was sent to a loopback host. The preview's port is published on 127.0.0.1 only, so only this Mac can reach it, and
 * inside Docker the peer address is the bridge, not 127.0.0.1: the Host header is what can be checked. A forwarding header (a proxy or a
 * tunnel in front) must not name anything else either, so exposing the port through Tailscale or a reverse proxy turns this off.
 */
export function loopbackRequest(headers: Headers): boolean {
  const host = (headers.get("host") ?? "").trim();
  if (!LOOPBACK_HOST.test(host)) return false;
  const forwardedHost = headers.get("x-forwarded-host");
  if (forwardedHost && !forwardedHost.split(",").every((h) => LOOPBACK_HOST.test(h.trim()))) return false;
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor && !forwardedFor.split(",").every((ip) => /^(127\.0\.0\.1|::1)$/.test(ip.trim()))) return false;
  return true;
}

/** The user the preview provider signs in, or null when the preview sign-in is off or the request is not from this Mac. */
export function previewUser(env: Env, headers: Headers): { id: string; email: string; name: string } | null {
  if (!previewSignInEnabled(env) || !loopbackRequest(headers)) return null;
  const email = previewAdminEmail(env);
  return { id: `preview:${email}`, email, name: "Preview admin (this Mac)" };
}

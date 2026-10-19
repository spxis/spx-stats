import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { AUTH_SECRET, firstEnv } from "../auth/enabled.ts";
import { DEV_SECRET, devLogin, loopbackRequest, previewSignInEnabled } from "../auth/preview.ts";
import type { GateSession } from "./rules.ts";

/**
 * Who a request is, read in the proxy from the session cookie alone: the same signed, encrypted JWT next-auth makes (lib/auth/config.ts), decoded
 * here with the same secret. No database, no network. A request with no session cookie returns before any decryption.
 * A session made by the DS1 preview's own sign-in counts only where that sign-in exists and the request names a loopback host (lib/auth/preview.ts).
 */
export async function sessionOfRequest(request: NextRequest, env: Record<string, string | undefined>): Promise<GateSession | null> {
  const secret = firstEnv(env, AUTH_SECRET) ?? (devLogin(env) ? DEV_SECRET : null);
  if (!secret) return null;
  let token = await getToken({ req: request, secret, secureCookie: true });
  token ??= await getToken({ req: request, secret, secureCookie: false });
  const email = typeof token?.email === "string" ? token.email : "";
  if (!token || !email) return null;
  if (token.preview === true && !(previewSignInEnabled(env) && loopbackRequest(request.headers))) return null;
  return { email, emailVerified: token.emailVerified === true, invitedClaim: token.invited === true };
}

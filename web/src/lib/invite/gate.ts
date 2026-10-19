/**
 * The gate's decision for one request, with nothing from Next in it: src/proxy.ts turns the answer into a response and scripts/invite.test.ts
 * runs every case without a server. Who the visitor is and what the list says are passed in as functions, called only when needed, so a request
 * the gate answers from the address alone (robots.txt, an exempt path, the bypass header) reads nothing, and a signed-out one reads no list.
 */
import { bypassOk, gateExempt, isBrowserNavigation, isDataPath, refusalHtml, refusalJson, robotsClosed, verdict, type GateSession } from "./rules.ts";

export type GateAnswer =
  | { action: "pass" }
  | { action: "robots"; body: string }
  | { action: "rewrite"; to: string } // a browser opening a page: drawn as /invite-only?next=...
  | { action: "refuse"; status: 401 | 403; contentType: string; body: string };

export interface GateRequest {
  pathname: string;
  search: string;
  method: string;
  headers: { get(name: string): string | null };
  env: Record<string, string | undefined>;
}

export async function decideGate(
  req: GateRequest,
  readSession: () => Promise<GateSession | null>,
  readInvited: (email: string) => Promise<boolean | null>,
): Promise<GateAnswer> {
  if (req.pathname === "/robots.txt") return { action: "robots", body: robotsClosed() };
  if (gateExempt(req.pathname) || bypassOk(req.headers, req.env)) return { action: "pass" };

  const session = await readSession();
  const invited = session ? await readInvited(session.email) : null;
  const decided = verdict(session, invited, req.env);
  if (decided === "allow") return { action: "pass" };

  const status = decided === "not-invited" ? 403 : 401;
  if (isDataPath(req.pathname)) {
    return { action: "refuse", status, contentType: "application/json; charset=utf-8", body: refusalJson(decided === "not-invited") };
  }
  const next = `${req.pathname}${req.search}`.slice(0, 500);
  if (isBrowserNavigation(req.headers, req.method)) return { action: "rewrite", to: `/invite-only?next=${encodeURIComponent(next)}` };
  return { action: "refuse", status, contentType: "text/html; charset=utf-8", body: refusalHtml(next) };
}

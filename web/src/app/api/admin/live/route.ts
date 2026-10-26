import { currentUser } from "@/lib/auth/user";
import { sameOrigin } from "@/lib/auth/origin";
import { devLogin } from "@/lib/auth/preview";
import { RefusedError, handleLiveRequest } from "@/lib/liveAdmin";
import { ReleaseError, requestLive } from "@/lib/releases/client";
import { todayUtc } from "@/lib/scores";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/live: an admin's "Refresh" of the live scores (a game, a day's list, a league, the main five, all sports) with the sources ticked.
 * Body: { scope, league?, day?, game?, sources: string[], settle?: boolean }. Admin only (anyone else gets a 404); the request must come from this site.
 * It does one thing: insert one request row on production through the existing admin request path (api.request_live). The runner next to DS1 does the
 * fetching, never this route. Answer: { ok: true, id } or { error }.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const reply = await handleLiveRequest(
    { user: user ? { email: user.email, admin: user.admin } : null, devLogin: devLogin(process.env), sameOrigin: sameOrigin(request.headers), body, today: todayUtc() },
    {
      queue: async (actor, req) => {
        try {
          return await requestLive(actor, req);
        } catch (e) {
          if (e instanceof ReleaseError && e.detail !== undefined) throw new RefusedError(e.detail);
          throw e;
        }
      },
    },
  );
  return Response.json(reply.body, { status: reply.status, headers: { "Cache-Control": "private, no-store" } });
}

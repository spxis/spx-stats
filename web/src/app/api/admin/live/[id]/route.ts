import { currentUser } from "@/lib/auth/user";
import { ApiError } from "@/lib/api/error";
import { handleLiveProgress, progressFromRow } from "@/lib/liveAdmin";
import { tursoConfigured, tursoQuery } from "@/lib/turso/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/live/<request id>: how one refresh is going, { status, summary, items }. Admin only (anyone else gets a 404). One Turso read of one row
 * by its key, never cached; the page asks no faster than every 15 seconds and only while its tab is visible. Nothing is fetched from a score source.
 * "waiting" means the runner has not started the request yet (it looks for requests once a minute).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const { id } = await params;
  const reply = await handleLiveProgress(
    { user: user ? { email: user.email, admin: user.admin } : null, id },
    {
      read: async (n) => {
        if (!tursoConfigured()) return null;
        try {
          const rows = await tursoQuery("select status, summary, items from live_request where id = ?", [n], { tables: ["live_request"], live: true });
          return rows[0] ? progressFromRow(rows[0]) : null;
        } catch (e) {
          if (e instanceof ApiError && !e.transient && /no such table/i.test(e.message)) return null;
          throw e;
        }
      },
    },
  );
  return Response.json(reply.body, { status: reply.status, headers: { "Cache-Control": "private, no-store" } });
}

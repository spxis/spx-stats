import { suggestPeople } from "@/lib/adminPeople";
import { currentUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/people/suggest?q=<text>: up to 10 people (every core.person, with or without a club season) for the admin search box.
 * Admin only: anyone else gets a 404. Response: { data: [{ id, name, league, first_season, last_season, url }] }, never cached.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user?.admin) return new Response(null, { status: 404 });
  try {
    const data = await suggestPeople(new URL(request.url).searchParams.get("q") ?? "");
    return Response.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

import { isLeague } from "@/lib/leagues";
import { parseDay, todayUtc } from "@/lib/scores";
import { getLiveScores } from "@/lib/turso/live";

/**
 * GET /api/live/<league>/<YYYY-MM-DD>: the unofficial results of that league's day, { rows: [...] }, for the scoreboard's overlay.
 * One cached Turso read per league and day, shared by every visitor for 30 seconds (the CDN keeps the answer too); it fetches from no score
 * source and writes nothing. A day older than a week or later than tomorrow reads nothing at all. No controls, no admin data: the rows are the same for everyone.
 */
const KEEP = "public, max-age=15, s-maxage=30, stale-while-revalidate=60";

export async function GET(_request: Request, { params }: { params: Promise<{ league: string; date: string }> }) {
  const { league, date } = await params;
  const day = parseDay(date);
  if (!isLeague(league) || !day) return Response.json({ error: "not a league or a day" }, { status: 400, headers: { "Cache-Control": "public, max-age=60, s-maxage=3600" } });
  try {
    return Response.json(await getLiveScores(league, day, todayUtc()), { headers: { "Cache-Control": KEEP } });
  } catch (e) {
    console.error(e);
    return Response.json({ rows: [] }, { headers: { "Cache-Control": "public, max-age=15, s-maxage=15" } });
  }
}

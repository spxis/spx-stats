import { ApiError } from "@/lib/api/client";
import { AWARD_GRID_HEAD } from "@/lib/awardGrid";
import { isLeague } from "@/lib/leagues";
import { leagueAwardGrid } from "@/lib/leagueTables";

// The older seasons of a league's awards grid as JSON (/nhl/rows/awards): what "Show all" under the awards table on the league page loads
// (components/AwardsGrid.tsx), so the page itself carries only the newest seasons. `logos` is the whole list the lines point into. Kept like the page
// (drawn on its first request, then a day). Nothing in it depends on the language. No query is read.
export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"lines":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; league: string }> }) {
  const { league: lg } = await params;
  if (!isLeague(lg)) return missing();
  try {
    const grid = await leagueAwardGrid(lg);
    if (!grid.seasons.length) return missing();
    return new Response(JSON.stringify({ lines: grid.seasons.slice(AWARD_GRID_HEAD), logos: grid.logos }), { headers: JSON_HEADERS });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"lines":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

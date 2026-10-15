import { ApiError } from "@/lib/api/client";
import { AWARD_HEAD } from "@/lib/awardLines";
import { isLeague } from "@/lib/leagues";
import { teamAwardLines } from "@/lib/teamAwardLines";
import { teamOf } from "@/lib/teamSlugs";

// The older awards of a franchise as JSON (/nhl/team/montreal-canadiens/rows/awards): what "Show all" under the awards table on the franchise page
// loads (components/AwardsTable.tsx). Kept like the page (drawn on its first request, then a day). Nothing in it depends on the language. No query is read.
export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"lines":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; league: string; franchise: string }> }) {
  const { league: lg, franchise } = await params;
  if (!isLeague(lg)) return missing();
  try {
    const at = await teamOf(lg, franchise);
    if (!at) return missing();
    const lines = await teamAwardLines(lg, at.f);
    if (!lines) return missing();
    return new Response(JSON.stringify({ lines: lines.lines.slice(AWARD_HEAD) }), { headers: JSON_HEADERS });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"lines":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

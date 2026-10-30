import { ApiError } from "@/lib/api/client";
import { compareView } from "@/lib/compareView";
import { isLeague } from "@/lib/leagues";
import { parseSeasonSeg } from "@/lib/slug";
import { teamSeasonOf } from "@/lib/teamSlugs";

// What the Compare menu of a club's season lists, as JSON (/nhl/2019-20/team/montreal-canadiens/rows/compare): every other club of the league, grouped as the
// club's division and conference were that season. The menu fetches it the first time it is opened (components/CompareMenu.tsx), so the season page carries no
// list of clubs. Kept like the page (drawn on its first request, then a day). Nothing in it depends on the language. No query is read.
export const revalidate = 2592000;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"view":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; league: string; year: string; franchise: string }> }) {
  const { league: lg, year, franchise } = await params;
  const ys = isLeague(lg) ? parseSeasonSeg(lg, year) : null;
  if (!isLeague(lg) || !ys || !ys.canonical) return missing();
  try {
    const at = await teamSeasonOf(lg, ys.y, franchise);
    if (!at) return missing();
    const view = await compareView(lg, at.f, ys.y);
    return view ? new Response(JSON.stringify({ view }), { headers: JSON_HEADERS }) : missing();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"view":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

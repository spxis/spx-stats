import { ApiError } from "@/lib/api/client";
import { getSeasonStandings } from "@/lib/data";
import { speaker } from "@/lib/i18n/speaker";
import { isLeague } from "@/lib/leagues";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { parseSeasonSeg } from "@/lib/slug";
import { seasonClubName } from "@/lib/seasonClubName";
import { teamFlowView } from "@/lib/teamFlowView";
import { teamSeasonOf } from "@/lib/teamSlugs";

// Where a club's players of a season came from and went, as JSON (/nhl/2019-20/team/montreal-canadiens/rows/flow): the blocks, bands and words of the diagram under the
// roster. The section fetches it when the reader gets near it (components/TeamFlowNear.tsx), so the season page carries none of it and reads none of the league's rosters.
// Kept like the page (drawn on its first request, then a day); the language is the route's. No query is read.
export const revalidate = 2592000;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"flow":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; league: string; year: string; franchise: string }> }) {
  const { locale: tag, league: lg, year, franchise } = await params;
  const ys = isLeague(lg) ? parseSeasonSeg(lg, year) : null;
  if (!isLeague(lg) || !ys || !ys.canonical) return missing();
  const { say, plural } = speaker(isLocale(tag) ? tag : DEFAULT_LOCALE);
  try {
    const at = await teamSeasonOf(lg, ys.y, franchise);
    if (!at) return missing();
    const name = await seasonClubName(lg, ys.y, at.f, await getSeasonStandings(lg, ys.y));
    return new Response(JSON.stringify({ flow: await teamFlowView(lg, ys.y, at.f, name, { say, plural }) }), { headers: JSON_HEADERS });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"flow":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

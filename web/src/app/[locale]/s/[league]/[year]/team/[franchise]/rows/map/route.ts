import { ApiError } from "@/lib/api/client";
import { clubMapView } from "@/lib/clubMapView";
import { speaker } from "@/lib/i18n/i18n";
import { isLeague } from "@/lib/leagues";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { parseSeasonSeg } from "@/lib/slug";
import { teamSeasonOf } from "@/lib/teamSlugs";

// The pins of the big map on a club's season as JSON (/nhl/2019-20/team/montreal-canadiens/rows/map): a venue pin for every club of the league that season. The map's
// dialog fetches it when it is opened (components/SeasonMap.tsx), so the season page carries only the club's own pin. Kept like the page (drawn on its first request,
// then a day); the language is the route's, since the pins carry words (venue facts, addresses). No query is read.
export const revalidate = 2592000;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"map":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; league: string; year: string; franchise: string }> }) {
  const { locale: tag, league: lg, year, franchise } = await params;
  const ys = isLeague(lg) ? parseSeasonSeg(lg, year) : null;
  if (!isLeague(lg) || !ys || !ys.canonical) return missing();
  const { say } = speaker(isLocale(tag) ? tag : DEFAULT_LOCALE);
  try {
    const at = await teamSeasonOf(lg, ys.y, franchise);
    if (!at) return missing();
    const map = await clubMapView(lg, ys.y, at.f, say);
    return map.pins.length ? new Response(JSON.stringify({ map }), { headers: JSON_HEADERS }) : missing();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"map":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

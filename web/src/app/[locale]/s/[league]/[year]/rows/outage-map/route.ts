import { ApiError } from "@/lib/api/client";
import { speaker } from "@/lib/i18n/speaker";
import { isLeague } from "@/lib/leagues";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { outageMapView } from "@/lib/outageMap";
import { parseSeasonSeg } from "@/lib/slug";

// The map of the clubs of the season before a gap, as JSON (/nhl/2004-05/rows/outage-map): the season-outage page fetches it when the reader gets near the map
// (components/OutageMapNear.tsx), so the page itself carries none of its pins. Kept like the page (drawn on its first request, then a day); the words are in the route's language. No query is read.
export const revalidate = 2592000;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"map":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; league: string; year: string }> }) {
  const { locale: tag, league: lg, year } = await params;
  const ys = isLeague(lg) ? parseSeasonSeg(lg, year) : null;
  if (!isLeague(lg) || !ys || !ys.canonical) return missing();
  try {
    const map = await outageMapView(lg, ys.y, speaker(isLocale(tag) ? tag : DEFAULT_LOCALE));
    return map ? new Response(JSON.stringify({ map }), { headers: JSON_HEADERS }) : missing();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"map":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

import { ApiError } from "@/lib/api/client";
import { franchiseMapView } from "@/lib/franchiseMap";
import { speaker } from "@/lib/i18n/i18n";
import { isLeague } from "@/lib/leagues";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { teamOf } from "@/lib/teamSlugs";

// What the two maps of a franchise's page draw besides the club's own pin, as JSON (/nhl/team/montreal-canadiens/rows/map): where every club of its latest
// season plays and every venue of every club. The corner map fetches it when it is opened and the venue section when the reader gets near
// (components/TeamMap.tsx, components/VenueMapLazy.tsx), so the page itself carries none of it. Kept like the page (drawn on its first request, then a
// day); the language is the route's, since the venue facts and addresses are worded in it. No query is read.
export const revalidate = 2592000;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"view":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; league: string; franchise: string }> }) {
  const { locale: tag, league: lg, franchise } = await params;
  if (!isLeague(lg)) return missing();
  const { say } = speaker(isLocale(tag) ? tag : DEFAULT_LOCALE);
  try {
    const at = await teamOf(lg, franchise);
    if (!at) return missing();
    return new Response(JSON.stringify({ view: await franchiseMapView(lg, at.f, say) }), { headers: JSON_HEADERS });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"view":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

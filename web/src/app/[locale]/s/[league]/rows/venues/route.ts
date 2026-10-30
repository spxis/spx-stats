import { ApiError } from "@/lib/api/client";
import { speaker } from "@/lib/i18n/i18n";
import { isLeague } from "@/lib/leagues";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { leagueVenueTeams } from "@/lib/franchiseMap";

// Every club of a league that has a venue with coordinates, with its venues and their addresses, as JSON (/nhl/rows/venues): the club choice of the venue map
// on a franchise's page (components/VenueMapLazy.tsx). It is the same for every club of the league, so it is worked out once here and not again for each of
// the league's team pages (the addresses of a hundred clubs' venues were most of a team page's first render). Kept like the pages (drawn on its first
// request, then a month); the language is the route's, since the venue facts and addresses are worded in it. No query is read.
export const revalidate = 2592000;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"teams":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; league: string }> }) {
  const { locale: tag, league: lg } = await params;
  if (!isLeague(lg)) return missing();
  const { say } = speaker(isLocale(tag) ? tag : DEFAULT_LOCALE);
  try {
    const teams = await leagueVenueTeams(lg, say);
    if (!teams.length) return missing();
    return new Response(JSON.stringify({ teams }), { headers: JSON_HEADERS });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"teams":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

import { ApiError } from "@/lib/api/client";
import { getAbbrs, getBrands, getSummary, getTeam, getTeamStandings } from "@/lib/data";
import { franchiseSeasonRows, standLines } from "@/lib/franchiseRows";
import { speaker } from "@/lib/i18n/speaker";
import { isLeague } from "@/lib/leagues";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { STAND_HEAD } from "@/lib/standLines";
import { teamOf } from "@/lib/teamSlugs";

// The older seasons of a franchise's standings table as JSON (/nhl/team/montreal-canadiens/rows/standings): what "Show all" under the table on the
// franchise page loads (components/StandingsTable.tsx), so the page itself carries only the newest seasons. Kept like the page (drawn on its first
// request, then a day); the language is the route's, and only the labels of the seasons that are not in the standings depend on it. No query is read.
export const revalidate = 2592000;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"lines":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; league: string; franchise: string }> }) {
  const { locale: tag, league: lg, franchise } = await params;
  if (!isLeague(lg)) return missing();
  const { say } = speaker(isLocale(tag) ? tag : DEFAULT_LOCALE);
  try {
    const at = await teamOf(lg, franchise);
    if (!at) return missing();
    const [t, rows, brands, abbrs, summary] = await Promise.all([getTeam(lg, at.f), getTeamStandings(lg, at.f), getBrands(), getAbbrs(lg), getSummary()]);
    if (!t) return missing();
    const { withGames, idle, bare, tableRows } = await franchiseSeasonRows(lg, at.f, t, rows, summary.seasons, say);
    const { lines } = standLines(at.f, tableRows, new Set(t.titles), idle, bare, withGames, brands, abbrs, rows);
    return new Response(JSON.stringify({ lines: lines.slice(STAND_HEAD) }), { headers: JSON_HEADERS });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"lines":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

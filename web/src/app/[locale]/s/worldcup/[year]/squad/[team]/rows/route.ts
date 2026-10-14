import { ApiError } from "@/lib/api/client";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { getPositions } from "@/lib/positionData";
import { positionName, resolveLeague } from "@/lib/positions";
import { getSquads, tournamentOfYear } from "@/lib/soccer";
import { isTeamSlug, isYearSeg } from "@/lib/soccerPath";
import { squadLine } from "@/lib/soccerSquad";

// One team's squad at a tournament as JSON (/worldcup/2022/squad/argentina/rows): what a closed list on the tournament page loads when it is
// opened (components/LazySquad.tsx), so the page itself holds no squads. Kept like the page (an hour, drawn on its first request); the language
// is the route's, like the page's, and only the position names depend on it. No query is read.
export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"lines":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; year: string; team: string }> }) {
  const { locale: tag, year, team } = await params;
  if (!isYearSeg(year) || !isTeamSlug(team)) return missing();
  const locale = isLocale(tag) ? tag : DEFAULT_LOCALE;
  try {
    const t = await tournamentOfYear(Number(year));
    if (!t) return missing();
    const [squads, positions] = await Promise.all([getSquads(t.tournament_id), getPositions()]);
    const mine = squads.filter((s) => s.team_slug === team);
    if (!mine.length) return missing();
    const name = (code: string) => positionName(code, resolveLeague(code, ["soccer"], positions), positions, locale);
    return new Response(JSON.stringify({ lines: mine.map((s) => squadLine(s, name)) }), { headers: JSON_HEADERS });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"lines":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

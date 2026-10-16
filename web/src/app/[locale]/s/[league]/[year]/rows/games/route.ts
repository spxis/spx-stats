import { ApiError } from "@/lib/api/client";
import { isLeague } from "@/lib/leagues";
import { seasonGamesView } from "@/lib/seasonGamesData";
import { parseSeasonSeg } from "@/lib/slug";

// A season's games and clubs as JSON (/mlb/2025/rows/games): what the week strip and the calendar of games on the season page fetch when it opens
// (components/SeasonGamesData.tsx), so the page itself carries none of them. Kept like the page (drawn on its first request, then a day); nothing in it
// depends on the language. No query is read.
export const revalidate = 2592000;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"view":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; league: string; year: string }> }) {
  const { league: lg, year } = await params;
  const ys = isLeague(lg) ? parseSeasonSeg(lg, year) : null;
  if (!isLeague(lg) || !ys || !ys.canonical) return missing();
  try {
    const view = await seasonGamesView(lg, ys.y);
    return view ? new Response(JSON.stringify({ view }), { headers: JSON_HEADERS }) : missing();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"view":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

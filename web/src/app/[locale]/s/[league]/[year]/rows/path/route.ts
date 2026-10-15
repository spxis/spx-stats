import { ApiError } from "@/lib/api/client";
import { speaker } from "@/lib/i18n/i18n";
import { isLeague } from "@/lib/leagues";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { seasonPathView } from "@/lib/seasonPathData";
import { parseSeasonSeg } from "@/lib/slug";

// What a season's path-to-the-title diagram draws, as JSON (/mlb/2025/rows/path): the season page's diagram fetches it when the reader gets near
// (components/PlayoffPathLazy.tsx), so the page itself carries none of it. Kept like the page (drawn on its first request, then a day); the words are in the
// route's language. No query is read.
export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"view":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; league: string; year: string }> }) {
  const { locale: tag, league: lg, year } = await params;
  const ys = isLeague(lg) ? parseSeasonSeg(lg, year) : null;
  if (!isLeague(lg) || !ys || !ys.canonical) return missing();
  try {
    const view = await seasonPathView(lg, ys.y, speaker(isLocale(tag) ? tag : DEFAULT_LOCALE));
    return view ? new Response(JSON.stringify({ view }), { headers: JSON_HEADERS }) : missing();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"view":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

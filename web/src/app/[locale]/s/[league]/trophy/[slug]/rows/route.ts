import { ApiError } from "@/lib/api/client";
import { codeOfSlug, trophyHead, trophyLines, TROPHY_HEAD } from "@/lib/awardTrophy";
import { logoFor } from "@/lib/brand";
import { getBrands } from "@/lib/data";
import { isLeague } from "@/lib/leagues";
import { getPlayerPaths } from "@/lib/playerLinks";
import { getLeagueTrophyRows } from "@/lib/trophyData";

// The older winners of one trophy as JSON (/nhl/trophy/hart/rows): what "Show all" under the winners table of the trophy's page loads (components/TrophyWinners.tsx),
// so the page itself carries only the newest. `logos` is the whole list the lines point into. Kept like the page (drawn on its first request, then a day).
// Nothing in it depends on the language. No query is read.
export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"lines":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; league: string; slug: string }> }) {
  const { league: lg, slug } = await params;
  const code = isLeague(lg) ? codeOfSlug(lg, slug) : null;
  if (!code) return missing();
  try {
    const [rows, brands, player] = await Promise.all([getLeagueTrophyRows(lg), getBrands(), getPlayerPaths()]);
    const mine = rows.filter((r) => r.award_code === code);
    if (!mine.length) return missing();
    const all = trophyLines(mine, { player: (id, name) => player(id, name, lg), logo: (f, y) => logoFor(brands, f, y) });
    const head = trophyHead(all, TROPHY_HEAD);
    return new Response(JSON.stringify({ lines: all.lines.slice(head.lines.length), logos: all.logos }), { headers: JSON_HEADERS });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"lines":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

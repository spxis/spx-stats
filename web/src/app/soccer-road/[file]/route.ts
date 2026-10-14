import { speaker } from "@/lib/i18n/i18n";
import { isLocale } from "@/lib/locale";
import { getTournamentMatches, tournamentOfYear } from "@/lib/soccer";
import { roadChartFor } from "@/lib/soccerRoadChart";

// One tournament's road to the final as a file (/soccer-road/2022.fr.svg), which the tournament page fetches when the figure comes into view instead of carrying
// the drawing in its HTML (components/RoadArt.tsx; lib/soccerRoadChart.ts draws it). Written in the reader's language, the way the page's own text is, with kyogijo's
// rules left to the page (components/kyogijo-road.css), so the drawing follows the page's light and dark. Drawn on its first request, then kept like the page is
// (a day). No query is read; a name that is no tournament with a road is a 404.
export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const FILE = /^(\d{4})\.(en|fr|ja)\.svg$/;
const missing = () => new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = FILE.exec((await params).file);
  if (!m || !isLocale(m[2])) return missing();
  const t = await tournamentOfYear(Number(m[1]));
  if (!t) return missing();
  const chart = roadChartFor(await getTournamentMatches(t.tournament_id), t.year, t.league, speaker(m[2]));
  if (!chart) return missing();
  return new Response(chart.svg, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}

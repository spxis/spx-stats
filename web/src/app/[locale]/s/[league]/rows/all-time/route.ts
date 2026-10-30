import { ApiError } from "@/lib/api/client";
import { getAllTimeList } from "@/lib/allTimeData";
import { isLeague } from "@/lib/leagues";

// Every franchise of a league's all-time table as JSON (/nhl/rows/all-time): what "Show all" under the table, the full lists under the bars and the charts of
// the all-time page load (components/AllTimeTable.tsx, AllTimeBars.tsx, AllTimeChartLazy.tsx), so the page itself carries only the first few. `logos` is the list the
// lines point into. Kept like the page (drawn on its first request, then kept). Nothing in it depends on the language. No query is read.
export const revalidate = 2592000;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"lines":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; league: string }> }) {
  const { league: lg } = await params;
  if (!isLeague(lg)) return missing();
  try {
    const list = await getAllTimeList(lg);
    if (!list.lines.length) return missing();
    return new Response(JSON.stringify(list), { headers: JSON_HEADERS });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"lines":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

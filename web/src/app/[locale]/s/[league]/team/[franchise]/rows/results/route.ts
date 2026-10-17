import { ApiError } from "@/lib/api/client";
import { isLeague } from "@/lib/leagues";
import { resultHeatPacked } from "@/lib/resultHeatData";
import { teamOf } from "@/lib/teamSlugs";

// What a franchise's GitHub-style results graph draws, as JSON (/nhl/team/carolina-hurricanes/rows/results): the
// section on the franchise page fetches it when the reader gets near (components/ResultHeatLazy.tsx), so the page
// itself carries none of it. Kept like the page (drawn on its first request, then a day). Nothing in it depends on
// the language. No query is read.
export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"view":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; league: string; franchise: string }> }) {
  const { league: lg, franchise } = await params;
  if (!isLeague(lg)) return missing();
  try {
    const at = await teamOf(lg, franchise);
    if (!at) return missing();
    const view = await resultHeatPacked(lg, at.f);
    return view ? new Response(JSON.stringify({ view }), { headers: JSON_HEADERS }) : missing();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"view":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

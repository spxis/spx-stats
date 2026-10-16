import { ApiError } from "@/lib/api/client";
import { compareView } from "@/lib/compareView";
import { isLeague } from "@/lib/leagues";
import { teamOf } from "@/lib/teamSlugs";

// What a franchise's Compare menu lists, as JSON (/nhl/team/montreal-canadiens/rows/compare): every other club of the league, grouped as the franchise's
// division and conference were in its latest season. The menu fetches it the first time it is opened (components/CompareMenu.tsx), so the page carries no
// list of clubs. Kept like the page (drawn on its first request, then a day). Nothing in it depends on the language. No query is read.
export const revalidate = 2592000;
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
    const view = await compareView(lg, at.f, null);
    return view ? new Response(JSON.stringify({ view }), { headers: JSON_HEADERS }) : missing();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"view":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

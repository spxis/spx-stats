import { ApiError } from "@/lib/api/client";
import { getLineageLeague } from "@/lib/lineageData";
import { packLineage } from "@/lib/lineageWire";

// One league's franchises and the names they played under as JSON (/teams/lineage/rows/nhl): what the diagram on /teams/lineage draws (components/FranchiseLineage.tsx), fetched for
// the league the address names, so the page itself carries none of them. Kept like the page (drawn on its first request, then a day). Nothing in it depends on the language. No query is read.
export const revalidate = 2592000;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"data":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; league: string }> }) {
  const { league: lg } = await params;
  try {
    const data = await getLineageLeague(lg);
    return data ? new Response(JSON.stringify({ data: packLineage(lg, data) }), { headers: JSON_HEADERS }) : missing();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"data":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

import { ApiError } from "@/lib/api/client";
import { getCountriesData, trendData, trendInitial } from "@/lib/countriesData";

// Each offered country's share of every league's players by decade as JSON (/countries/rows/trend): what the trend chart on /countries loads when the reader gets
// near it (components/CountryTrend.tsx), so the page itself does not carry the decades of fourteen countries. Kept like the page. Nothing in it depends on the
// language. No query is read.
export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  try {
    const d = await getCountriesData();
    if (!d) return new Response('{"data":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });
    return new Response(JSON.stringify({ initial: trendInitial(d), data: trendData(d) }), { headers: JSON_HEADERS });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"data":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

import { ApiError } from "@/lib/api/client";
import { getTeam } from "@/lib/data";
import { franchiseCountryView } from "@/lib/franchiseCountryData";
import { speaker } from "@/lib/i18n/i18n";
import { isLeague } from "@/lib/leagues";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { teamOf } from "@/lib/teamSlugs";

// What a franchise's "Where the players come from" section draws, as JSON (/nhl/team/montreal-canadiens/rows/countries): the section on the franchise page
// fetches it when the reader gets near (components/FranchiseCountriesLazy.tsx), so the page itself carries none of it. Kept like the page (drawn on its first
// request, then a day). Only the club's fallback name depends on the language. No query is read.
export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"view":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; league: string; franchise: string }> }) {
  const { locale: tag, league: lg, franchise } = await params;
  if (!isLeague(lg)) return missing();
  const { say } = speaker(isLocale(tag) ? tag : DEFAULT_LOCALE);
  try {
    const at = await teamOf(lg, franchise);
    if (!at) return missing();
    const t = await getTeam(lg, at.f);
    if (!t) return missing();
    const view = await franchiseCountryView(lg, at.f, t.names.at(-1)?.name || say("team.fallback", { id: at.f }));
    if (!view) return missing();
    return new Response(JSON.stringify({ view }), { headers: JSON_HEADERS });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"view":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

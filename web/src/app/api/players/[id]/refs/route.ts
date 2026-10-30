import { ApiError } from "@/lib/api/client";
import { getPersonRow, getPlayerRecord } from "@/lib/people";
import { buildRefs } from "@/lib/playerBoardData";

// What the player page's board compares a player with, as JSON (/api/players/8449/refs): for every league and stat group the player has, the league's figures of each season
// he played (api.stat_reference, packed as lib/playerBoard.ts RefPack: the percentile points, averages and best season totals). The board fetches it as soon as it is
// drawn, so the page itself does not carry the 30 to 50 KB. Kept like the pages (drawn on its first request, then a day, and refreshed with the stat views). Nothing in it
// depends on the language. No query is read. A player with no figures gets an empty list, and the board hides what needs them.
export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"refs":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,9}$/.test(id)) return missing();
  try {
    const [person, record] = await Promise.all([getPersonRow(Number(id)), getPlayerRecord(Number(id))]);
    if (!person) return missing();
    return new Response(JSON.stringify({ refs: await buildRefs(record, person.position) }), { headers: JSON_HEADERS });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"refs":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

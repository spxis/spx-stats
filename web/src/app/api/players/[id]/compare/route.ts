import { ApiError } from "@/lib/api/client";
import { comparePlayer } from "@/lib/playerCompareData";

// What the player page's Compare window draws for one person, as JSON (/api/players/8449/compare): the facts, the statistics board's data and the position
// names. The window fetches it when it is opened, for the page's player and for the one chosen, so no player page carries the other's data.
// Kept like the pages (drawn on its first request, then a day). Nothing in it depends on the language. No query is read.
export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"player":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,9}$/.test(id)) return missing();
  try {
    const player = await comparePlayer(Number(id));
    return player ? new Response(JSON.stringify({ player }), { headers: JSON_HEADERS }) : missing();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"player":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

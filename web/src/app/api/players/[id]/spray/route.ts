import { ApiError } from "@/lib/api/client";
import { getPlayerSpray } from "@/lib/playerSprayData";

// What the player page's spray section draws from for one person, as JSON (/api/players/8449/spray): one row for each season, role and side the batter hit from, the
// located batted balls still packed (lib/battedBall.ts unpacks them). The section fetches it when it comes into view. Kept like the pages (drawn on its first request,
// then a day, and refreshed when core.batted_ball_player_hand is released). Nothing in it depends on the language. No query is read.
export const revalidate = 86400;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response('{"spray":null}', { status: 404, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,9}$/.test(id)) return missing();
  try {
    const spray = await getPlayerSpray(Number(id));
    return spray ? new Response(JSON.stringify({ spray }), { headers: JSON_HEADERS }) : missing();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.error(e);
    return new Response('{"spray":null}', { status: 502, headers: { ...JSON_HEADERS, "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}

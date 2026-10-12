import { respond } from "@/lib/apiResponse";
import { listPlayers } from "@/lib/listApi";

/**
 * GET /api/players: the players index, read-only JSON. Unknown parameters are ignored; a bad one is a 400 that names it.
 *   league=nhl|nba|mlb|nfl|cfl   q=<words of a name, accents ignored>   position=<as the archive spells it, e.g. Goaltender>
 *   sort=name|league|position|years|seasons|awards, each .asc or .desc, up to three, e.g. seasons.desc,name  (default name.asc)
 *   limit=1..200 (50)   offset=n   after=<page.next of the previous page>   fields=name,leagues,... (id is always there)
 * Response: { data: [{ id, name, position, leagues, first_season, last_season, seasons, awards, url }], page: { limit, offset, sort, next, total } }.
 * Page with offset (total is counted) or follow page.next with after= (keyset: steady while the data changes, total is null; sort=league needs offset).
 * Cached an hour. 429 and 502 carry Retry-After.
 */
export const GET = (request: Request) => respond(() => listPlayers(new URL(request.url).searchParams));

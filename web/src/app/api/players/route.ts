import { respond } from "@/lib/apiResponse";
import { listPlayers } from "@/lib/listApi";

/**
 * GET /api/players: the players index, read-only JSON. Unknown parameters are ignored; a bad one is a 400 that names it.
 *   league=nhl|nba|mlb|nfl|cfl   q=<words of a name, accents ignored>   position=<a position code, e.g. LW, G, SS, QB (older words such as Goaltender are read as their codes); matches the main position or any other the player holds>
 *   nat=<two-letter country code, e.g. CA>: keeps players whose country is it (born there; the nationality's country when no birthplace country is known)
 *   from=<year> to=<year>   whole years 1800..2100, from not after to: keeps players who played in any season from..to (first..last season overlaps it); either alone leaves the other end open
 *   letter=<a letter, A to Z; accents are ignored, so É is E>: keeps players whose LAST name starts with it (the last word of the name, a trailing Jr, Sr, II, III or IV set aside); letter_by=last|first (last) takes the first name instead. It combines with every filter above.
 *   sort=name|league|position|years|seasons|awards, each .asc or .desc, up to three, e.g. seasons.desc,name  (default name.asc)
 *   limit=1..200 (50)   offset=n   after=<page.next of the previous page>   fields=name,leagues,... (id is always there)
 * Response: { data: [{ id, name, position (the main one's code), positions (every code, the main one first), leagues, first_season, last_season, seasons, awards, country (capitals ISO code of the birth country, else of the nationality; null when unknown), url }], page: { limit, offset, sort, next, total } }.
 * Page with offset (total is counted) or follow page.next with after= (keyset: steady while the data changes, total is null; sort=league needs offset).
 * Cached an hour. 429 and 502 carry Retry-After.
 */
export const GET = (request: Request) => respond(() => listPlayers(new URL(request.url).searchParams));

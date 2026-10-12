import { respond } from "@/lib/apiResponse";
import { listTeams } from "@/lib/listApi";

/**
 * GET /api/teams: every franchise ever, read-only JSON. Unknown parameters are ignored; a bad one is a 400 that names it.
 *   league=nhl|nba|mlb|nfl|cfl   q=<words of any name the team has had, accents ignored>   status=all|active|defunct (all)
 *   sort=name|league|first|last|seasons|titles|share, each .asc or .desc, up to three, e.g. titles.desc,name  (default name.asc)
 *   limit=1..200 (50)   offset=n   after=<page.next of the previous page>   fields=name,league,... (id is always there)
 * Response: { data: [{ id, league, name, former_names, first_season, last_season, seasons, titles, share, active, logo, url }], page: { limit, offset, sort, next, total } }.
 * Page with offset (total is counted) or follow page.next with after= (keyset, total is null). Cached an hour. 429 and 502 carry Retry-After.
 */
export const GET = (request: Request) => respond(() => listTeams(new URL(request.url).searchParams));

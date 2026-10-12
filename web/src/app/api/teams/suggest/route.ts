import { respond } from "@/lib/apiResponse";
import { suggestTeams } from "@/lib/listApi";

/**
 * GET /api/teams/suggest?q=<text>: up to 10 franchises for autocomplete (limit=1..10, league=nhl|...), by current or former name: names that start
 * with the text first, then names with a word that starts with it, then names that contain it (from 3 characters); clubs still playing first within a group.
 * Response: { data: [{ id, name, league, first_season, last_season, active, matched, logo, subtitle, url }] }; matched is the former name that was found, if it was one.
 */
export const GET = (request: Request) => respond(() => suggestTeams(new URL(request.url).searchParams));

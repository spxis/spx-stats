import { respond } from "@/lib/apiResponse";
import { suggestPlayers } from "@/lib/listApi";

/**
 * GET /api/players/suggest?q=<text>: up to 10 players for autocomplete (limit=1..10, league=nhl|...). Names that start with the text first, then
 * names with a word that starts with it, then names that contain it (from 3 characters); accents and case are ignored.
 * Response: { data: [{ id, name, league, leagues, position, positions, first_season, last_season, subtitle, url }] }.
 */
export const GET = (request: Request) => respond(() => suggestPlayers(new URL(request.url).searchParams));

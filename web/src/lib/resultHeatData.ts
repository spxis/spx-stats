import "server-only";
import { z } from "zod";
import { ApiError, rows } from "./api/client";
import { getTeam, getTeamGames } from "./data";
import { heatGamesFromFranchise, heatGamesFromRows, packHeat, type PackedHeat, type SeasonGames } from "./resultHeat";

/** How many seasons are read at once when the franchise view is not on the server. Each read is `year=eq.` so the games view does not scan every league. */
const BATCH = 8;

/** One season of a club's games, as api.franchise_season_games gives it: the club's name that season and its games as short arrays (see SeasonGames). */
const seasonRow = z.object({
  year: z.number(),
  own: z.string().nullable(),
  games: z.array(z.tuple([
    z.number(), z.string(), z.string(), z.string(), z.number(), z.number().nullable(), z.number().nullable(), z.number(), z.string().nullable(),
  ])),
});

/**
 * The seasons of a franchise with their regular-season and playoff games: one request (about one row for each season the club played),
 * where the games view needed one for each season. 404 until migration 166 is on the server.
 */
async function franchiseSeasons(lg: string, f: number): Promise<SeasonGames[] | null> {
  try {
    return await rows("franchise_season_games", `league=eq.${lg}&franchise_id=eq.${f}&select=year,own,games&order=year`, seasonRow);
  } catch (e) {
    if (!(e instanceof ApiError) || !e.message.endsWith(": 404")) throw e;
    return null;
  }
}

/**
 * One franchise's regular-season and playoff results, packed for the kept JSON route. Null when the club has no
 * such game. Read from api.franchise_season_games in one request; until that view exists, each season is its own
 * `getTeamGames` read (year=eq).
 */
export async function resultHeatPacked(lg: string, f: number): Promise<PackedHeat | null> {
  const seasons = await franchiseSeasons(lg, f);
  if (seasons) {
    const games = heatGamesFromFranchise(lg, seasons);
    return games.length ? packHeat(lg, f, games) : null;
  }
  const team = await getTeam(lg, f);
  if (!team) return null;
  const years = [...new Set([...team.seasons.map((s) => s[0]), ...team.unrecorded.map((s) => s[0])])].sort((a, b) => a - b);
  if (!years.length) return null;
  const parts = [];
  for (let i = 0; i < years.length; i += BATCH) {
    parts.push(...await Promise.all(years.slice(i, i + BATCH).map((y) => getTeamGames(lg, y, f))));
  }
  const games = heatGamesFromRows(lg, f, parts.flat());
  return games.length ? packHeat(lg, f, games) : null;
}

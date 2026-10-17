import "server-only";
import { getTeam, getTeamGames } from "./data";
import { heatGamesFromRows, packHeat, type PackedHeat } from "./resultHeat";

/** How many seasons are read at once. Each read is `year=eq.` so the games view does not scan every league. */
const BATCH = 8;

/**
 * One franchise's regular-season and playoff results, packed for the kept JSON route. Null when the club has no
 * such game. Each season is its own `getTeamGames` read (year=eq).
 */
export async function resultHeatPacked(lg: string, f: number): Promise<PackedHeat | null> {
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

import { leagueInfo } from "./leagues.ts";

/**
 * A league that has ended: its final champion is the last one it will have. Worked out from what the site knows, not from a list of names: the league carries the defunct flag
 * (`closed`, lib/leagues.ts), or its last season is more than one season older than the newest season of any league in the archive. A league that is between seasons (its newest
 * season is the last played, or the one before, while the archive already holds the next) is still playing.
 */
export function leagueEnded(league: string, lastSeason: number | null, newestSeason: number): boolean {
  if (leagueInfo(league)?.closed) return true;
  return lastSeason != null && lastSeason < newestSeason - 1;
}

import { z } from "zod";

/**
 * The people who played in more than one league as api.player_league_pack gives them (migration 186): for each, the leagues and in each the seasons
 * they played and the newest. Read in one request instead of api.player_multi_league whole and api.person_season_teams for each of them.
 */
const ints = z.array(z.number());

export const playerLeaguePackSchema = z.object({
  leagues: z.array(z.string()), person_id: ints, league_count: ints, league: ints, seasons: ints, last: ints,
});
export type PlayerLeaguePack = z.infer<typeof playerLeaguePackSchema>;

export interface PlayerLeagues { person_id: number; leagues: string[]; stats: Map<string, { seasons: number; last: number }> }

/** The people of api.player_multi_league in order of person_id, each with the count primaryLeague ranks the leagues by. */
export function peopleFromPack(p: PlayerLeaguePack): PlayerLeagues[] {
  const n = p.person_id.length;
  if (p.league_count.length !== n) throw new Error("player_league_pack: the columns are not the same length");
  const out: PlayerLeagues[] = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    const leagues: string[] = [];
    const stats = new Map<string, { seasons: number; last: number }>();
    for (let k = 0; k < p.league_count[i]!; k++, at++) {
      const lg = p.leagues[p.league[at]!];
      if (lg === undefined || p.seasons[at] === undefined || p.last[at] === undefined) throw new Error(`player_league_pack: person ${p.person_id[i]} points at a league that is not there`);
      leagues.push(lg);
      stats.set(lg, { seasons: p.seasons[at]!, last: p.last[at]! });
    }
    out.push({ person_id: p.person_id[i]!, leagues, stats });
  }
  return out;
}

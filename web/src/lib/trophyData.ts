import "server-only";
import { cache } from "react";
import { checkRows, rows } from "./api/client";
import { leagueAwardsPacked } from "./awardPackRead";
import { orElse } from "./api/soften";
import { trophyInfoSchema, trophyRowSchema } from "./api/trophies";
import { dedupe, type TrophyInfo, type TrophyRow } from "./awardTrophy";
import { isLeague, LEAGUE_CODES } from "./leagues";

/**
 * What the trophy pages read, only through `api` views, each league's winners in one read tagged like the rest of the awards (`api:awards:<league>`),
 * so a release that changes a league's awards refreshes its trophy pages with the rest. The doubles of two sources are folded (lib/awardTrophy.ts).
 */

/** Every award (a trophy) the archive holds, by league then code. A page does not fail for a view that is empty or not loaded yet. */
export const getTrophyList = cache(async (): Promise<TrophyInfo[]> =>
  orElse(rows("award_list", "select=league,code,name,kind,description&order=league,code", trophyInfoSchema), []));

/** Every winner of every award of one league, newest season first, each once. Empty for a league that has none. */
export const getLeagueTrophyRows = cache(async (lg: string): Promise<TrophyRow[]> => {
  if (!isLeague(lg)) return [];
  const list = await orElse((async () => {
    const packed = await leagueAwardsPacked(lg);
    return packed ? checkRows("award_league_pack", packed, trophyRowSchema)
      : rows("awards", `league=eq.${lg}&select=year,award_code,award,kind,winner,note,franchise_id,person_id&order=year.desc,award_code,winner`, trophyRowSchema);
  })(), []);
  return dedupe(list);
});

/** Every league's winners (the leagues with awards), by league. */
export const getAllTrophyRows = cache(async (): Promise<Map<string, TrophyRow[]>> => {
  const list = await Promise.all(LEAGUE_CODES.map(async (lg) => [lg, await getLeagueTrophyRows(lg)] as const));
  return new Map(list.filter(([, r]) => r.length > 0));
});

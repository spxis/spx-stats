import "server-only";
import { cache } from "react";
import { ApiError, rows } from "./api/client";
import { canFallBack } from "./api/soften";
import { leaderRowSchema, leaderTables, type LeaderData } from "./clubLeaderRows";

/**
 * The club leaders of a CFL club season (api.team_season_leader, migration 175), or null: for any other league, when nothing is listed, while the view is missing
 * (a 404, before the migration and the data release) and when a read fails softly. The section is an extra on the club's page.
 */
export const getClubLeaders = cache(async (league: string, teamSeasonId: number): Promise<LeaderData | null> => {
  if (league !== "cfl") return null;
  try {
    const found = await rows("team_season_leader", `team_season_id=eq.${teamSeasonId}&select=team_season_id,category,ord,name,person_id,stats,source_key`, leaderRowSchema);
    return found.length ? leaderTables(found) : null;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    if (!canFallBack(e)) throw e;
    return null;
  }
});

import "server-only";
import { cache } from "react";
import type { z } from "zod";
import { ApiError, rows, viewMissing } from "./client";
import { standingPackSchema, standingsFromPack, type PackedStanding } from "../standingPack";

/**
 * Reads a precomputed copy of a live view (migration 036). The copy is missing until that migration has run, and PostgREST
 * answers 404 for a missing view, so then the live view is read instead.
 */
async function fromIndex<S extends z.ZodType>(index: string, live: string, query: string, schema: S): Promise<z.infer<S>[]> {
  try {
    return await rows(index, query, schema);
  } catch (e) {
    if (!(e instanceof ApiError) || !e.message.endsWith(": 404")) throw e;
    return rows(live, query, schema);
  }
}

/** Rows of api.team_seasons, from api.team_season_index. */
export const teamSeasonRows = <S extends z.ZodType>(query: string, schema: S) => fromIndex("team_season_index", "team_seasons", query, schema);

/** Rows of api.standings, from api.standing_index. */
export const standingRows = <S extends z.ZodType>(query: string, schema: S) => fromIndex("standing_index", "standings", query, schema);

/**
 * Every club season of a league (year, team_id, franchise_id, team, gp, w, l, t, otl, pts, pf, pa, conference) ordered by year then team_id, once for a page, from
 * api.standing_league_pack (migration 182). Null while that is a 404, so the reader asks for the rows of api.standing_index as before.
 */
export const leagueStandings = cache(async (lg: string): Promise<PackedStanding[] | null> => {
  try {
    const [pack] = await rows("standing_league_pack", `league=eq.${lg}&select=league,teams,conferences,standings&order=league`, standingPackSchema);
    return pack ? standingsFromPack(pack) : [];
  } catch (e) {
    if (!viewMissing(e)) throw e;
    return null;
  }
});

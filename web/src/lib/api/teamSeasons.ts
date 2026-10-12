import "server-only";
import type { z } from "zod";
import { ApiError, rows } from "./client";

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

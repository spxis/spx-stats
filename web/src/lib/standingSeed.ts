import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";

const seedSchema = z.object({ franchise_id: z.number().int(), seed: z.number().int() });

/**
 * The playoff seeds a source states for one season, by franchise (api.standing_seed, migration 192: a row only where a seed is stated, never derived). Empty
 * for a league and year with none, while the view is missing (a 404, before the migration is on production) and when the read fails: the brackets are then
 * drawn without seed tags, so a season page never depends on it.
 */
export const getStandingSeeds = cache(async (lg: string, year: number): Promise<ReadonlyMap<number, number>> => {
  try {
    const list = await rows("standing_seed", `league=eq.${lg}&year=eq.${year}&select=franchise_id,seed`, seedSchema);
    return new Map(list.map((r) => [r.franchise_id, r.seed]));
  } catch {
    return new Map();
  }
});

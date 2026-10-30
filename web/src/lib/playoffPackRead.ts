import "server-only";
import { cache } from "react";
import { rows, viewMissing } from "./api/client";
import type { PlayoffTotals } from "./allTime";
import { playoffPackSchema, playoffTotalsFromPack } from "./playoffPack";

/**
 * Each franchise's playoff record in a league, once for a page, from api.playoff_franchise_pack (migration 188). Null while that is a 404, so the reader adds up the
 * league's playoff games as before.
 */
export const leaguePlayoffTotals = cache(async (lg: string): Promise<PlayoffTotals[] | null> => {
  try {
    const [pack] = await rows("playoff_franchise_pack", `league=eq.${lg}&select=league,franchises&order=league`, playoffPackSchema);
    return pack ? playoffTotalsFromPack(pack) : [];
  } catch (e) {
    if (!viewMissing(e)) throw e;
    return null;
  }
});

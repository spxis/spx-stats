import "server-only";
import { cache } from "react";
import { rows, viewMissing } from "./api/client";
import { awardPackSchema, awardSourceSchema, awardsFromPack, type AwardSources, type PackedAward } from "./awardPack";

/**
 * The winners of a league (year, award_code, award, kind, winner, note, franchise_id, person_id) newest season first then by award_code and winner, once for a page, from
 * api.award_league_pack (migration 183). Null while that is a 404, so the reader asks for api.awards as before.
 */
export const leagueAwardsPacked = cache(async (lg: string): Promise<PackedAward[] | null> => {
  try {
    const [pack] = await rows("award_league_pack", `league=eq.${lg}&select=*&order=league`, awardPackSchema);
    return pack ? awardsFromPack(pack) : [];
  } catch (e) {
    if (!viewMissing(e)) throw e;
    return null;
  }
});

/** The winners counted by source in every league, from api.award_league_pack (the counts alone, not the winners); null while that is a 404. */
export const awardPacks = cache(async (): Promise<AwardSources[] | null> => {
  try {
    return await rows("award_league_pack", "select=league,source_name,source_count&order=league", awardSourceSchema);
  } catch (e) {
    if (!viewMissing(e)) throw e;
    return null;
  }
});

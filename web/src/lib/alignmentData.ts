import "server-only";
import { cache } from "react";
import { checkRows, rows, viewMissing } from "./api/client";
import { alignmentFromPack, alignmentPackSchema } from "./alignmentPack";
import { standingSchema } from "./api/schemas";
import type { StandingRow } from "./api/types";
import { isOutsideConference } from "./leagues";
import { alignmentChangeSchema, alignmentSchema, type AlignmentChangeRow, type AlignmentRow } from "./alignment";

/**
 * Alignment is read from views a database may not have yet (db/migrations/028_api_alignment.sql): a missing view, or
 * one with no rows, just means the pages draw without it.
 */

/** Every club of a league with the conference and division it sat in, each season it had any. */
export const getAlignment = cache(async (lg: string): Promise<AlignmentRow[]> => {
  // api.alignment_pack (migration 184): the league's rows in one request of numbers; while it is a 404, api.alignment is read as before.
  let list: AlignmentRow[];
  try {
    const [pack] = await rows("alignment_pack", `league=eq.${lg}&select=*&order=league`, alignmentPackSchema);
    list = checkRows("alignment_pack", pack ? alignmentFromPack(pack) : [], alignmentSchema);
  } catch (e) {
    if (!viewMissing(e)) throw e;
    list = await rows("alignment", `league=eq.${lg}&select=*&order=year,conference,division,team`, alignmentSchema);
  }
  return list.filter((r) => !isOutsideConference(lg, r.conference));
});

/** The seasons in which a club's conference or division differs from its season before. */
export const getAlignmentChanges = cache(async (lg: string): Promise<AlignmentChangeRow[]> =>
  (await rows("alignment_changes", `league=eq.${lg}&select=*&order=year,team`, alignmentChangeSchema)).filter((r) => !isOutsideConference(lg, r.from_conference) && !isOutsideConference(lg, r.to_conference)));

/** One season's alignment, or none when the view is missing: the playoff bracket then has no conferences to show. */
export const getSeasonAlignment = cache(async (lg: string, year: number): Promise<AlignmentRow[]> =>
  (await rows("alignment", `league=eq.${lg}&year=eq.${year}&select=*`, alignmentSchema).catch(() => [])).filter((r) => !isOutsideConference(lg, r.conference)));

/** One club's places, season by season. */
export const getTeamAlignment = cache(async (lg: string, f: number): Promise<AlignmentRow[]> =>
  rows("alignment", `league=eq.${lg}&franchise_id=eq.${f}&select=*&order=year`, alignmentSchema));

/**
 * A season's table as it stood after the games of a date (api.standings_as_of, worked out from the final scores).
 * null when the database has no such function, so the page can say so and show the final table.
 */
export const getStandingsAsOf = cache(async (lg: string, year: number, date: string): Promise<StandingRow[] | null> =>
  rows(
    "rpc/standings_as_of",
    `p_league=${encodeURIComponent(lg)}&p_year=${year}&p_date=${encodeURIComponent(date)}`,
    standingSchema,
  ).catch(() => null));

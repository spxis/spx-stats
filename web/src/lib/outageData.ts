import "server-only";
import { cache } from "react";
import { rows } from "./api/client";
import { seasonCoachSchema, seasonOutageSchema, seasonRosterSchema, teamIdentitySchema } from "./api/schemas";
import type { SeasonCoachRow, SeasonOutageRow, SeasonRosterRow, SeasonSummaryRow, TeamIdentityRow } from "./api/types";

/*
 * Reads for the page of a season that was not played. Every read here is an extra: the views come from migration 057, so a
 * database that does not have them yet (or a read that fails) just leaves that part of the page out.
 */

/** The article on why a season was not played; null when there is none (or the view is not there yet). */
export const getOutage = cache(async (lg: string, y: number): Promise<SeasonOutageRow | null> =>
  (await rows("season_outage", `league=eq.${lg}&year=eq.${y}&select=*`, seasonOutageSchema).catch(() => []))[0] ?? null);

/** Each club's city and nickname in a season. */
export const getIdentities = cache(async (lg: string, y: number): Promise<TeamIdentityRow[]> =>
  rows("team_season_identity", `league=eq.${lg}&year=eq.${y}&select=*`, teamIdentitySchema).catch(() => []));

/** Every player of every club's season, with their career span in the league. */
export const getSeasonRoster = cache(async (lg: string, y: number): Promise<SeasonRosterRow[]> =>
  rows("season_roster", `league=eq.${lg}&year=eq.${y}&select=*`, seasonRosterSchema).catch(() => []));

/** The head coaches of a season, club by club, in the order they held the job. */
export const getHeadCoaches = cache(async (lg: string, y: number): Promise<SeasonCoachRow[]> =>
  rows("team_season_staff", `league=eq.${lg}&year=eq.${y}&role=eq.head_coach&select=franchise_id,person_id,name,first_on,last_on,ord&order=ord`, seasonCoachSchema).catch(() => []));

/** The seasons either side of a year the league did not play: the last one before with games, the first one after with games. */
export function neighbours(seasons: readonly SeasonSummaryRow[], lg: string, y: number): { before: SeasonSummaryRow | null; after: SeasonSummaryRow | null } {
  const played = seasons.filter((s) => s.league === lg && s.games > 0);
  return {
    before: played.filter((s) => s.year < y).sort((a, b) => b.year - a.year)[0] ?? null,
    after: played.filter((s) => s.year > y).sort((a, b) => a.year - b.year)[0] ?? null,
  };
}

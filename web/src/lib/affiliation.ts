import "server-only";
import { cache } from "react";
import { ApiError, rows as readRows } from "./api/client";
import { affiliationSchema, type Affiliation } from "./affiliationView";

/**
 * The NHL club(s) each minor-league club was affiliated with, season by season (api.team_season_affiliation, migration 160, AHL first). A view the database does not
 * have yet (404: the migration or the data release has not reached production) reads as no rows, so the sections that use it draw nothing; any other failure throws.
 */
async function rows(query: string): Promise<Affiliation[]> {
  try {
    return await readRows("team_season_affiliation", query, affiliationSchema);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return [];
    throw e;
  }
}

/** Every season of one minor-league club: its affiliations, oldest first. */
export const getClubAffiliations = cache((league: string, franchise: number): Promise<Affiliation[]> =>
  /^[a-z]{2,8}$/.test(league) && Number.isInteger(franchise) ? rows(`league=eq.${league}&franchise_id=eq.${franchise}&order=year.asc,position.asc`) : Promise.resolve([]));

/** Every club of a league in one season, with the NHL club(s) it was affiliated with. */
export const getSeasonAffiliations = (league: string, year: number): Promise<Affiliation[]> =>
  /^[a-z]{2,8}$/.test(league) && Number.isInteger(year) ? rows(`league=eq.${league}&year=eq.${year}&order=franchise_id.asc,position.asc`) : Promise.resolve([]);

/** Every minor-league club season that had this NHL franchise as a parent, oldest first. */
export const getFarmClubs = cache((parentFranchise: number): Promise<Affiliation[]> =>
  Number.isInteger(parentFranchise) ? rows(`parent_franchise_id=eq.${parentFranchise}&order=year.asc,franchise_id.asc`) : Promise.resolve([]));

import "server-only";
import { z } from "zod";
import { ApiError, rows } from "./api/client";
import { groupTeams, idFilter, type TeamRow } from "./playerTeamModel";

const teamSchema = z.object({ person_id: z.number(), franchise_id: z.number(), league: z.string().nullable(), first_year: z.number(), last_year: z.number(), seasons: z.number() });

const missing = (e: unknown): null => {
  if (e instanceof ApiError && e.status != null && e.status >= 400 && e.status < 500) return null;
  throw e;
};

/**
 * The teams of the players of one page of the list (api.player_teams, migration 098), each player's in the order he played for them: one read for
 * the whole page. Null while the view is missing, so the page draws no Teams column and offers no team choice.
 */
export async function getPlayerTeams(ids: readonly number[]): Promise<Map<number, TeamRow[]> | null> {
  if (!ids.length) return new Map();
  const found = await rows("player_teams", `${idFilter(ids)}&select=person_id,franchise_id,league,first_year,last_year,seasons&order=person_id,first_year`, teamSchema).catch(missing);
  return found && groupTeams(found);
}

/** Whether the database has api.player_teams and api.player_team_search (migration 098): the team choice and the Teams column wait for them. Kept like any read. */
export async function playerTeamsReady(): Promise<boolean> {
  const view = await rows("player_team_search", "select=person_id&franchise_id=eq.0&limit=1", z.object({ person_id: z.number() })).catch(missing);
  return view !== null;
}

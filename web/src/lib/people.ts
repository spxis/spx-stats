import "server-only";
import { cache } from "react";
import { rows } from "./api/client";
import { leagueAwardSchema, personAwardSchema, personSchema, personTeamSchema, teamAwardSchema } from "./api/people";
import type { LeagueAwardRow, PersonAwardRow, PersonRow, PersonTeamRow, TeamAwardRow } from "./api/people";
import { isLeague } from "./leagues";

export interface PersonData {
  person: PersonRow;
  awards: PersonAwardRow[];
  teams: PersonTeamRow[];
}

/** One person with their awards and teams; null when there is no such person (or the people views are not loaded yet). */
export const getPerson = cache(async (id: number): Promise<PersonData | null> => {
  const q = `person_id=eq.${id}`;
  const [people, awards, teams] = await Promise.all([
    rows("people", `${q}&select=*`, personSchema),
    rows("person_awards", `${q}&select=*&order=year.desc,award`, personAwardSchema),
    rows("person_teams", `${q}&select=*&order=from_year`, personTeamSchema),
  ]);
  return people[0] ? { person: people[0], awards, teams } : null;
});

/** Awards a franchise and its players won, newest first. A page does not fail because this view is empty or missing. */
export const getTeamAwards = cache(async (lg: string, f: number): Promise<TeamAwardRow[]> => {
  if (!isLeague(lg)) return [];
  return rows("team_awards", `league=eq.${lg}&franchise_id=eq.${f}&select=*&order=year.desc,award_code`, teamAwardSchema).catch(() => []);
});

/** Every award of a league that is not the championship, for the awards-by-season table. */
export const getLeagueAwards = cache(async (lg: string): Promise<LeagueAwardRow[]> => {
  if (!isLeague(lg)) return [];
  return rows("awards", `league=eq.${lg}&kind=neq.championship&select=year,award_code,award,kind,winner,person_id,franchise_id&order=year.desc,award_code,winner`, leagueAwardSchema).catch(() => []);
});

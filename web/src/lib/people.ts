import "server-only";
import { cache } from "react";
import { rows } from "./api/client";
import { leagueAwardSchema, personAwardSchema, personSchema, personTeamSchema, teamAwardSchema } from "./api/people";
import { personResumeSchema, personSeasonTeamSchema, personStatSchema, personTotalSchema } from "./api/player";
import type { PersonResumeRow, PersonSeasonTeamRow, PersonStatRow, PersonTotalRow } from "./api/player";
import type { LeagueAwardRow, PersonAwardRow, PersonRow, PersonTeamRow, TeamAwardRow } from "./api/people";
import { isLeague } from "./leagues";

export interface PersonData {
  person: PersonRow;
  awards: PersonAwardRow[];
  teams: PersonTeamRow[];
}

/** One person; null when there is no such person. A failed read throws ApiError. */
export const getPersonRow = cache(async (id: number): Promise<PersonRow | null> => (await rows("people", `person_id=eq.${id}&select=*`, personSchema))[0] ?? null);

/** One person with their awards and teams; null when there is no such person. A failed read throws ApiError. */
export const getPerson = cache(async (id: number): Promise<PersonData | null> => {
  const q = `person_id=eq.${id}`;
  const [person, awards, teams] = await Promise.all([
    getPersonRow(id),
    rows("person_awards", `${q}&select=*&order=year.desc,award`, personAwardSchema),
    rows("person_teams", `${q}&select=*&order=from_year`, personTeamSchema),
  ]);
  return person ? { person, awards, teams } : null;
});

/** Awards a franchise and its players won, newest first. A page does not fail because this view is empty or missing; null means the fetch failed. */
export const getTeamAwards = cache(async (lg: string, f: number): Promise<TeamAwardRow[] | null> => {
  if (!isLeague(lg)) return [];
  return rows("team_awards", `league=eq.${lg}&franchise_id=eq.${f}&select=*&order=year.desc,award_code`, teamAwardSchema).catch(() => null);
});

/** Every award of a league that is not the championship, for the awards-by-season table. */
export const getLeagueAwards = cache(async (lg: string): Promise<LeagueAwardRow[]> => {
  if (!isLeague(lg)) return [];
  return rows("awards", `league=eq.${lg}&kind=neq.championship&select=year,award_code,award,kind,winner,person_id,franchise_id&order=year.desc,award_code,winner`, leagueAwardSchema).catch(() => []);
});

export interface PlayerRecord {
  seasonTeams: PersonSeasonTeamRow[];
  stats: PersonStatRow[];
  totals: PersonTotalRow[];
  resume: PersonResumeRow[];
}

/** A player's seasons, stats, career totals and resume. A page does not fail because these views are empty or not loaded yet. */
export const getPlayerRecord = cache(async (id: number): Promise<PlayerRecord> => {
  const q = `person_id=eq.${id}`;
  const [seasonTeams, stats, totals, resume] = await Promise.all([
    rows("person_season_teams", `${q}&select=*&order=year,league`, personSeasonTeamSchema).catch(() => []),
    rows("person_stats", `${q}&select=*&order=year,league,stat_group`, personStatSchema).catch(() => []),
    rows("person_career_totals", `${q}&select=*`, personTotalSchema).catch(() => []),
    rows("person_resume", `${q}&select=*&order=start_year.nullslast,name`, personResumeSchema).catch(() => []),
  ]);
  return { seasonTeams, stats, totals, resume };
});

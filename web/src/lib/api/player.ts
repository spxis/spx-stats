import { z } from "zod";

/* Rows of the player views (db/migrations/032_api_player.sql). */

export interface PersonSeasonTeamRow {
  person_id: number;
  team_season_id: number;
  league: string;
  year: number;
  season_label: string;
  franchise_id: number;
  team: string | null;
  played_regular: boolean;
  played_playoffs: boolean;
  team_made_playoffs: boolean;
  team_champion: boolean;
}

/** Counting stats only (rates are worked out where shown). */
export type StatNumbers = Record<string, number>;

export interface PersonStatRow {
  person_id: number;
  league: string;
  year: number;
  team_season_id: number;
  franchise_id: number;
  team: string | null;
  phase: string;
  stat_group: string;
  games_played: number | null;
  games_started: number | null;
  stats: StatNumbers;
}

export interface PersonTotalRow {
  person_id: number;
  league: string;
  phase: string;
  stat_group: string;
  seasons: number;
  team_seasons: number;
  games_played: number | null;
  stats: StatNumbers;
}

export interface PersonResumeRow {
  person_id: number;
  kind: string;
  name: string;
  level: string | null;
  league: string | null;
  start_year: number | null;
  end_year: number | null;
  detail: string | null;
  club_qid: string | null;
  source: string;
}

const int = z.number();
const intN = z.number().nullable();
const str = z.string();
const strN = z.string().nullable();
const stats = z.record(z.string(), z.number());

export const personSeasonTeamSchema = z.object({
  person_id: int, team_season_id: int, league: str, year: int, season_label: str, franchise_id: int, team: strN,
  played_regular: z.boolean(), played_playoffs: z.boolean(), team_made_playoffs: z.boolean(), team_champion: z.boolean(),
}) satisfies z.ZodType<PersonSeasonTeamRow>;

export const personStatSchema = z.object({
  person_id: int, league: str, year: int, team_season_id: int, franchise_id: int, team: strN, phase: str, stat_group: str,
  games_played: intN, games_started: intN, stats,
}) satisfies z.ZodType<PersonStatRow>;

export const personTotalSchema = z.object({
  person_id: int, league: str, phase: str, stat_group: str, seasons: int, team_seasons: int, games_played: intN, stats,
}) satisfies z.ZodType<PersonTotalRow>;

export const personResumeSchema = z.object({
  person_id: int, kind: str, name: str, level: strN, league: strN, start_year: intN, end_year: intN, detail: strN, club_qid: strN, source: str,
}) satisfies z.ZodType<PersonResumeRow>;

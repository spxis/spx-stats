import { z } from "zod";

/* Rows of the people views (db/migrations/026_api_people.sql). Declared against hand-written row types, like the rest of the api. */

export interface PersonRow {
  person_id: number;
  name: string;
  kind: string;
  birth_date: string | null;
  death_date: string | null;
  birth_place: string | null;
  birth_country_code: string | null;
  birth_lat: number | null;
  birth_lon: number | null;
  nationality_code: string | null;
  height_cm: number | null;
  position: string | null;
  /** Every position the player holds, as codes (ref.position), the main one first (api.people, migrations 049 and 061); absent before 049. */
  positions?: string[] | null;
  hall_of_fame_year: number | null;
  debut: string | null;
  final: string | null;
  award_count: number;
  championship_count: number;
  seasons_played: number;
  first_season: number | null;
  last_season: number | null;
  leagues: string[] | null;
}

export interface PersonAwardRow {
  person_id: number;
  league: string;
  year: number;
  award: string;
  award_code: string;
  kind: string;
  note: string | null;
  team: string | null;
  franchise_id: number | null;
  source: string;
}

export interface PersonTeamRow {
  person_id: number;
  league: string;
  franchise_id: number;
  team: string | null;
  from_year: number;
  to_year: number;
}

export interface TeamAwardRow {
  league: string;
  franchise_id: number;
  year: number;
  award: string;
  winner: string | null;
  person_id: number | null;
  kind: string;
  award_code: string;
}

/** Awards of a league's seasons, as the awards view gives them, for the awards-by-season table. */
export interface LeagueAwardRow {
  year: number;
  award_code: string;
  award: string;
  kind: string;
  winner: string | null;
  person_id: number | null;
  franchise_id: number | null;
}

const int = z.number();
const intN = z.number().nullable();
const str = z.string();
const strN = z.string().nullable();

export const personSchema = z.object({
  person_id: int, name: str, kind: str, birth_date: strN, death_date: strN, birth_place: strN, birth_country_code: strN,
  birth_lat: intN, birth_lon: intN, nationality_code: strN, height_cm: intN, position: strN, positions: z.array(str).nullable().optional(), hall_of_fame_year: intN,
  debut: strN, final: strN, award_count: int, championship_count: int, seasons_played: int, first_season: intN, last_season: intN,
  leagues: z.array(str).nullable(),
}) satisfies z.ZodType<PersonRow>;

export const personAwardSchema = z.object({
  person_id: int, league: str, year: int, award: str, award_code: str, kind: str, note: strN, team: strN, franchise_id: intN, source: str,
}) satisfies z.ZodType<PersonAwardRow>;

export const personTeamSchema = z.object({
  person_id: int, league: str, franchise_id: int, team: strN, from_year: int, to_year: int,
}) satisfies z.ZodType<PersonTeamRow>;

export const teamAwardSchema = z.object({
  league: str, franchise_id: int, year: int, award: str, winner: strN, person_id: intN, kind: str, award_code: str,
}) satisfies z.ZodType<TeamAwardRow>;

export const leagueAwardSchema = z.object({
  year: int, award_code: str, award: str, kind: str, winner: strN, person_id: intN, franchise_id: intN,
}) satisfies z.ZodType<LeagueAwardRow>;

/** One row of `api.player_index` (db/migrations/034_player_index.sql, `positions` from 050, `country` from 063), the players list. */
export const playerIndexSchema = z.object({
  person_id: int, name: str, position: strN, positions: z.array(str).nullable().optional(), leagues: z.array(str).nullable(), first_season: intN, last_season: intN, seasons_played: int, award_count: int,
  /** Capitals ISO code of the birth country, else of the nationality (migration 063); absent until that migration has run. */
  country: strN.optional(),
});
export type PlayerIndexRow = z.infer<typeof playerIndexSchema>;

/**
 * Row types of the read-only `api` schema, written by hand from the views' columns
 * (db/migrations/015_api.sql, 018_team_brand.sql, 022_team_location.sql).
 * schemas.ts holds the Zod schema for each, checked against these at compile time.
 *
 * PostgREST sends integers, bigints and numerics as JSON numbers, dates as ISO strings.
 */

export interface SeasonSummaryRow {
  league: string;
  year: number;
  label: string;
  games: number;
  finals: number;
  playoff_finals: number;
  teams: number;
  champion: string | null;
  champion_note: string | null;
  champion_source: string | null;
  champion_franchise: number | null;
}

export interface TotalsRow {
  games: number;
  finals: number;
  lines: number;
  confirmed: number;
  issues: number;
  award_winners: number;
  franchises: number;
  seasons: number;
  refreshed_at: string;
}

export interface GamesBySourceRow {
  league: string;
  source: string;
  source_name: string;
  games: number;
}

export interface QualityRow {
  kind: "check" | "issue" | (string & {});
  source: string;
  entity: string;
  what: string;
  resolution: string | null;
  n: number;
}

export interface GameRow {
  league: string;
  year: number;
  game_id: number;
  game_date: string;
  phase: "regular" | "playoffs" | "preseason" | "all_star" | (string & {});
  status: string;
  away_id: number;
  away: string | null;
  away_score: number | null;
  home_id: number;
  home: string | null;
  home_score: number | null;
  overtime: boolean | null;
  source: string;
  /** 1 confirmed by a second source, -1 disputed, null unchecked. */
  checked: number | null;
  away_f: number | null;
  home_f: number | null;
}

export interface StandingRow {
  league: string;
  year: number;
  team_id: number;
  franchise_id: number;
  team: string | null;
  gp: number | null;
  w: number | null;
  l: number | null;
  t: number | null;
  otl: number | null;
  pts: number | null;
  pf: number | null;
  pa: number | null;
  home: string | null;
  road: string | null;
  pct: number | null;
  basis: "published" | "scores" | (string & {});
  source: string | null;
  /** Where the club sat that season (db/migrations/028); absent from a database that has not got the columns yet. */
  conference?: string | null;
  conference_short?: string | null;
  division?: string | null;
  division_short?: string | null;
}

export interface AwardRow {
  league: string;
  year: number;
  award_code: string;
  award: string;
  kind: string;
  winner: string | null;
  note: string | null;
  source: string;
  franchise_id: number | null;
  /** The person who won it, once the people views are loaded (absent before). */
  person_id?: number | null;
}

export interface TeamSeasonRow {
  league: string;
  year: number;
  franchise_id: number;
  team: string | null;
  w: number | null;
  l: number | null;
  t: number | null;
  otl: number | null;
  champion: boolean;
}

export interface FranchiseNameRow {
  league: string;
  franchise_id: number;
  name: string;
  name_from: string | null;
  name_to: string | null;
}

export interface SourceRow {
  code: string;
  name: string;
  licence: string | null;
  attribution: string | null;
  url: string | null;
  notes: string | null;
}

export interface TeamAbbrRow {
  league: string;
  franchise_id: number;
  valid_from: string | null;
  valid_to: string | null;
  abbreviation: string;
}

export interface TeamBrandRow {
  league: string;
  franchise_id: number;
  brand_from: string | null;
  brand_to: string | null;
  primary_hex: string | null;
  secondary_hex: string | null;
  logo_url: string | null;
  logo_licence: string | null;
  logo_page: string | null;
  source: string;
  home_venue: string | null;
  latitude: number | null;
  longitude: number | null;
}

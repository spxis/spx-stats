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

export interface SeasonNoteRow {
  league: string;
  year: number;
  franchise_id: number | null;
  kind: string;
  games_planned: number | null;
  games_usual: number | null;
  note_en: string;
  note_fr: string | null;
  note_ja: string | null;
  source: string;
  source_url: string | null;
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

/** A season the league did not play, and why (api.season_outage, db/migrations/057_season_outage.sql). */
export interface SeasonOutageRow {
  league: string;
  year: number;
  kind: string;
  stopped_on: string | null;
  cancelled_on: string | null;
  resumed_on: string | null;
  games_cancelled: number | null;
  note_en: string;
  note_fr: string | null;
  note_ja: string | null;
  source: string;
  source_url: string | null;
}

/** A season whose championship was not awarded, and why (api.title_not_awarded, db/migrations/060_title_not_awarded.sql). */
export interface TitleNotAwardedRow {
  league: string;
  year: number;
  award: string;
  reason_en: string;
  reason_fr: string | null;
  reason_ja: string | null;
  source: string;
  source_url: string | null;
}

/** A club's city and nickname in one season (api.team_season_identity, migration 057). */
export interface TeamIdentityRow {
  league: string;
  year: number;
  franchise_id: number;
  team_season_id: number;
  location: string | null;
  nickname: string | null;
  team: string | null;
  region: string | null;
  country_code: string | null;
}

/** A player of a club's season with their career span in that league (api.season_roster, migration 057). */
export interface SeasonRosterRow {
  league: string;
  year: number;
  franchise_id: number;
  team_season_id: number;
  person_id: number;
  name: string;
  position: string | null;
  games_played: number | null;
  first_season: number | null;
  last_season: number | null;
  seasons_played: number;
}

/** A club's head coach in a season (api.team_season_staff, role head_coach). */
export interface SeasonCoachRow {
  franchise_id: number;
  person_id: number;
  name: string;
  first_on: string | null;
  last_on: string | null;
  ord: number;
}

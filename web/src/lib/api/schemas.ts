import { z } from "zod";
import type {
  AwardRow,
  FranchiseNameRow,
  GameRow,
  GamesBySourceRow,
  QualityRow,
  SeasonSummaryRow,
  SourceRow,
  StandingRow,
  SeasonCoachRow,
  SeasonNoteRow,
  TitleNotAwardedRow,
  SeasonOutageRow,
  SeasonRosterRow,
  TeamAbbrRow,
  TeamBrandRow,
  TeamIdentityRow,
  TeamSeasonRow,
  TotalsRow,
} from "./types";

const int = z.number();
const intN = z.number().nullable();
const str = z.string();
const strN = z.string().nullable();

// Every schema is declared against its hand-written row type, so a column added to one and
// not the other fails the type check.
export const seasonSummarySchema = z.object({
  league: str, year: int, label: str, games: int, finals: int, playoff_finals: int, teams: int,
  champion: strN, champion_note: strN, champion_source: strN, champion_franchise: intN,
}) satisfies z.ZodType<SeasonSummaryRow>;

export const totalsSchema = z.object({
  games: int, finals: int, lines: int, confirmed: int, issues: int, award_winners: int,
  franchises: int, seasons: int, refreshed_at: str,
}) satisfies z.ZodType<TotalsRow>;

export const gamesBySourceSchema = z.object({
  league: str, source: str, source_name: str, games: int,
}) satisfies z.ZodType<GamesBySourceRow>;

export const qualitySchema = z.object({
  kind: str, source: str, entity: str, what: str, resolution: strN, n: int,
}) satisfies z.ZodType<QualityRow>;

export const gameSchema = z.object({
  league: str, year: int, game_id: int, game_date: str, phase: str, status: str,
  away_id: int, away: strN, away_score: intN, home_id: int, home: strN, home_score: intN,
  overtime: z.boolean().nullable(), source: str, checked: intN, away_f: intN, home_f: intN,
  starts_at: z.string().nullable().optional(),
  nhl_id: z.number().int().nullable().optional(),
  nfl_week: z.number().int().nullable().optional(),
  retro_box: z.string().nullable().optional(),
}) satisfies z.ZodType<GameRow>;

export const standingSchema = z.object({
  league: str, year: int, team_id: int, franchise_id: int, team: strN,
  gp: intN, w: intN, l: intN, t: intN, otl: intN, pts: intN, pf: intN, pa: intN,
  home: strN, road: strN, pct: intN, basis: str, source: strN,
  conference: strN.optional(), conference_short: strN.optional(), division: strN.optional(), division_short: strN.optional(),
}) satisfies z.ZodType<StandingRow>;

export const awardSchema = z.object({
  league: str, year: int, award_code: str, award: str, kind: str, winner: strN, note: strN,
  source: str, franchise_id: intN, person_id: z.number().nullish(),
}) satisfies z.ZodType<AwardRow>;

export const teamSeasonSchema = z.object({
  league: str, year: int, franchise_id: int, team: strN, w: intN, l: intN, t: intN, otl: intN,
  champion: z.boolean(),
}) satisfies z.ZodType<TeamSeasonRow>;

export const franchiseNameSchema = z.object({
  league: str, franchise_id: int, name: str, name_from: strN, name_to: strN,
}) satisfies z.ZodType<FranchiseNameRow>;

export const sourceSchema = z.object({
  code: str, name: str, licence: strN, attribution: strN, url: strN, notes: strN,
}) satisfies z.ZodType<SourceRow>;

// Colours go into inline styles and logos into <img src>: anything that is not a plain hex
// colour or an https URL is dropped to null rather than trusted.
const hex = z.string().regex(/^[0-9A-Fa-f]{6}$/).nullable().catch(null);
const httpsUrl = z.string().refine((u) => u.startsWith("https://")).nullable().catch(null);
/** A logo is an https URL (Wikimedia Commons) or one of our own files under /team-logos/ (SportsLogos.Net marks, served from the site, never hotlinked). */
const logoUrl = z.string().refine((u) => u.startsWith("https://") || /^\/team-logos\/[A-Za-z0-9_\/.-]+$/.test(u)).nullable().catch(null);

export const teamAbbrSchema = z.object({
  league: str, franchise_id: int, valid_from: strN, valid_to: strN, abbreviation: str,
}) satisfies z.ZodType<TeamAbbrRow>;

export const seasonNoteSchema = z.object({
  league: str, year: int, franchise_id: intN, kind: str, games_planned: intN, games_usual: intN,
  note_en: str, note_fr: strN, note_ja: strN, source: str, source_url: httpsUrl,
}) satisfies z.ZodType<SeasonNoteRow>;

export const seasonOutageSchema = z.object({
  league: str, year: int, kind: str, stopped_on: strN, cancelled_on: strN, resumed_on: strN, games_cancelled: intN,
  note_en: str, note_fr: strN, note_ja: strN, source: str, source_url: httpsUrl,
}) satisfies z.ZodType<SeasonOutageRow>;

export const titleNotAwardedSchema = z.object({
  league: str, year: int, award: str, reason_en: str, reason_fr: strN, reason_ja: strN, source: str, source_url: httpsUrl,
}) satisfies z.ZodType<TitleNotAwardedRow>;

export const teamIdentitySchema = z.object({
  league: str, year: int, franchise_id: int, team_season_id: int, location: strN, nickname: strN, team: strN, region: strN, country_code: strN,
}) satisfies z.ZodType<TeamIdentityRow>;

export const seasonRosterSchema = z.object({
  league: str, year: int, franchise_id: int, team_season_id: int, person_id: int, name: str, position: strN, games_played: intN,
  first_season: intN, last_season: intN, seasons_played: int,
}) satisfies z.ZodType<SeasonRosterRow>;

export const seasonCoachSchema = z.object({
  franchise_id: int, person_id: int, name: str, first_on: strN, last_on: strN, ord: int,
}) satisfies z.ZodType<SeasonCoachRow>;

export const teamBrandSchema = z.object({
  league: str, franchise_id: int, brand_from: strN, brand_to: strN,
  primary_hex: hex, secondary_hex: hex, logo_url: logoUrl, logo_licence: strN, logo_page: strN,
  source: str, home_venue: strN, latitude: intN, longitude: intN,
}) satisfies z.ZodType<TeamBrandRow>;

/** Just the one column the sources page counts award winners by. */
export const awardSourceSchema = z.object({ source: str });

/** The columns of a playoff game that fix the shape of a season's bracket (who met whom, when, how it went), without names or sources. */
export const playoffShapeSchema = z.object({
  game_id: int, year: int, game_date: str, status: str, away_score: intN, home_score: intN, away_f: intN, home_f: intN,
});

/** A franchise's team seasons: the ids the games view can be read by quickly (its franchise columns are worked out row by row, so filtering on them scans every game), and the season each is for. */
export const teamSeasonIdSchema = z.object({ team_season_id: int, franchise_id: int, year: int });

/** The columns of a game the head-to-head pages use. The franchises are added from the team-season ids, so the view never works them out per row; the verification lookup (`checked`) is left out. */
export const pairGameSchema = z.object({
  game_id: int, year: int, game_date: str, phase: str, status: str,
  away_id: int, away: strN, away_score: intN, home_id: int, home: strN, home_score: intN,
  overtime: z.boolean().nullable(), source: str,
});

/** The same without the club names, for a club's whole history (the group pages), with the franchises as the view works them out for just these rows. */
export const teamGameSchema = z.object({
  game_id: int, year: int, game_date: str, phase: str, status: str,
  away_score: intN, home_score: intN, overtime: z.boolean().nullable(), away_f: intN, home_f: intN,
});

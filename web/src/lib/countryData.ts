import "server-only";
import { cache } from "react";
import { z } from "zod";
import { flag } from "@johnmorrisdotca/hata/load";
import { ApiError, rows } from "./api/client";
import type { FranchiseCount, LeagueCount, SeasonCount, TeamSeasonCount } from "./countryModel";
import { HATA_SHAPE, type FlagShape } from "./flagSvg";

/**
 * The reads behind the country pages (api.country_team_season, country_season, country_league, country_franchise: migration 068).
 * Until that migration is on the database the views answer 4xx; every read then gives null and the page leaves its country section out,
 * so a missing view is never a "Couldn't load". A busy database (5xx) is still an ApiError, which the pages' guard turns into the note.
 */
const missing = (e: unknown): null => {
  if (e instanceof ApiError && e.status != null && e.status >= 400 && e.status < 500) return null;
  throw e;
};

const teamSeasonSchema = z.object({ league: z.string(), year: z.number(), franchise_id: z.number(), team_season_id: z.number(), country: z.string(), players: z.number() });
const seasonSchema = z.object({ league: z.string(), year: z.number(), country: z.string(), players: z.number(), season_players: z.number(), season_known: z.number() });
const leagueSchema = z.object({
  league: z.string(), country: z.string(), players: z.number(), first_year: z.number(), last_year: z.number(),
  first_person_id: z.number().nullable(), first_name: z.string().nullable(), league_players: z.number(), league_known: z.number(),
});
const franchiseSchema = z.object({ league: z.string(), franchise_id: z.number(), stat_group: z.string(), country: z.string(), players: z.number(), seasons: z.number(), stats: z.record(z.string(), z.number()) });

const lg = (league: string) => `league=eq.${encodeURIComponent(league)}`;

/** One club season's players by country; null while the views are missing. */
export const getClubSeasonCountries = cache(async (teamSeasonId: number): Promise<TeamSeasonCount[] | null> =>
  rows("country_team_season", `team_season_id=eq.${teamSeasonId}&select=league,year,franchise_id,team_season_id,country,players`, teamSeasonSchema).catch(missing));

/** Every club's players by country in one league season. */
export const getLeagueSeasonClubs = cache(async (league: string, year: number): Promise<TeamSeasonCount[] | null> =>
  rows("country_team_season", `${lg(league)}&year=eq.${year}&select=league,year,franchise_id,team_season_id,country,players`, teamSeasonSchema).catch(missing));

/** One franchise's players by country, every season it played. */
export const getFranchiseSeasons = cache(async (league: string, franchise: number): Promise<TeamSeasonCount[] | null> =>
  rows("country_team_season", `${lg(league)}&franchise_id=eq.${franchise}&select=league,year,franchise_id,team_season_id,country,players&order=year`, teamSeasonSchema).catch(missing));

/** Distinct players of each country per league season (one league, or every league; one season; one country). */
export const getSeasonCounts = cache(async (league?: string, country?: string, year?: number): Promise<SeasonCount[] | null> => {
  const q = [league ? lg(league) : "", year != null ? `year=eq.${year}` : "", country ? `country=eq.${country}` : "", "select=league,year,country,players,season_players,season_known", "order=league,year"].filter(Boolean).join("&");
  return rows("country_season", q, seasonSchema).catch(missing);
});

/** All-time players of each country per league, with the first player. */
export const getLeagueCounts = cache(async (league?: string, country?: string): Promise<LeagueCount[] | null> => {
  const q = [league ? lg(league) : "", country ? `country=eq.${country}` : "", "select=league,country,players,first_year,last_year,first_person_id,first_name,league_players,league_known"].filter(Boolean).join("&");
  return rows("country_league", q, leagueSchema).catch(missing);
});

/** A franchise's stat groups by country (all-time players, and the added-up regular-season stats). */
export const getFranchiseCountries = cache(async (league: string, franchise: number): Promise<FranchiseCount[] | null> =>
  rows("country_franchise", `${lg(league)}&franchise_id=eq.${franchise}&select=league,franchise_id,stat_group,country,players,seasons,stats`, franchiseSchema).catch(missing));

/** Every franchise of a league: who was on the club by country (stat group all). */
export const getLeagueFranchises = cache(async (league: string): Promise<FranchiseCount[] | null> =>
  rows("country_franchise", `${lg(league)}&stat_group=eq.all&select=league,franchise_id,stat_group,country,players,seasons,stats`, franchiseSchema).catch(missing));

/**
 * Hata's flags for the first `limit` of these countries (pass them biggest first), as the SVG text the client components draw with FlagIcon.
 * Some flags are big drawings (Spain's is 110 kB) and a page draws each one several times, so the small countries go without: their names stand alone.
 * A code Hata has no flag for is left out.
 */
export async function flagsFor(codes: Iterable<string>, limit = 16, shape: FlagShape = "rect"): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all([...new Set(codes)].slice(0, limit).map(async (c) => {
    const svg = await flag(c.toUpperCase(), HATA_SHAPE[shape]).catch(() => null);
    if (svg) out[c] = svg;
  }));
  return out;
}

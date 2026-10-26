import "server-only";
import { cache } from "react";
import { z } from "zod";
import { EUROPE_TOP_LEAGUES } from "./europePath";
import { standingSchema, rows } from "./soccer";

/**
 * The European club leagues, read from the api views of migrations 139 and 155 and the soccer views of 066 and 078 (docs/soccer-europe.md). Like lib/mls.ts, every
 * function returns [] when the archive holds none yet (a production that has not had the data release) and throws ApiError when it cannot be read.
 */

const text = z.string();
const nText = z.string().nullable();
const num = z.number();
const nNum = z.number().nullable();

export const leagueSeasonSchema = z.object({
  tournament_id: text, league: text, league_name: text, league_short: text, system_key: text, tier: num, country_code: nText, year: num, name: text,
  team_count: nNum, complete: z.boolean(), note: nText, start_date: nText, end_date: nText, matches: num, playoff_matches: num, goals: num,
  champion_id: nText, champion: nText, champion_slug: nText, runner_up_id: nText, runner_up: nText, runner_up_slug: nText, has_table: z.boolean(), source: nText,
});
export type LeagueSeason = z.infer<typeof leagueSeasonSchema>;

export const clubSchema = z.object({
  team_id: text, slug: text, name: text, country_code: nText, wikidata_id: nText, first_year: num, last_year: num, seasons: num, titles: num, best_tier: num,
  latest_name: nText, system_key: text,
});
export type EuropeClub = z.infer<typeof clubSchema>;

export const clubSeasonSchema = z.object({
  tournament_id: text, league: text, year: num, system_key: text, tier: num, team_id: text, team_slug: text, team_name: text, country_code: nText, complete: z.boolean(), matches: num,
});
export type ClubSeason = z.infer<typeof clubSeasonSchema>;

export const clubMoveSchema = z.object({
  team_id: text, team_slug: text, system_key: text, from_year: num, from_league: text, from_tier: num, to_year: nNum, to_league: nText, to_tier: nNum, move: nText,
});
export type ClubMove = z.infer<typeof clubMoveSchema>;

export const euroMatchSchema = z.object({
  match_id: num, match_date: text, stage_key: text, stage_order: num, home_team_id: text, home: text, home_slug: text, home_goals: num,
  away_team_id: text, away: text, away_slug: text, away_goals: num, extra_time: z.boolean(), shootout: z.boolean(), home_penalties: nNum, away_penalties: nNum, winner_team_id: nText,
});
export type EuroMatch = z.infer<typeof euroMatchSchema>;

const TOURNAMENT = /^[a-z0-9_]+\d{4}$/;
const LEAGUE = /^[a-z0-9_]+$/;
const CLUB = /^C-[a-z0-9-]+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Every season of every division (a few hundred small rows): the soccer page, the chips, a division's page and a club's page all read from this one list. */
export const getEuropeSeasons = cache(() => rows("soccer_league_seasons", "order=league.asc,year.asc", leagueSeasonSchema));

/** A season shows something worth a page: results or a league table. A division listed only by its clubs (matches not built yet) has no page of its own. */
export const hasContent = (s: LeagueSeason): boolean => s.matches > 0 || s.has_table;

export async function getEuropeLeague(code: string): Promise<LeagueSeason[]> {
  return LEAGUE.test(code) ? (await getEuropeSeasons()).filter((s) => s.league === code) : [];
}

export const getEuropeSeason = cache(async (code: string, year: number): Promise<LeagueSeason | null> =>
  (await getEuropeLeague(code)).find((s) => s.year === year) ?? null);

export const getEuropeMatches = cache((tournament: string) =>
  TOURNAMENT.test(tournament)
    ? rows("soccer_matches",
        `select=match_id,match_date,stage_key,stage_order,home_team_id,home,home_slug,home_goals,away_team_id,away,away_slug,away_goals,extra_time,shootout,home_penalties,away_penalties,winner_team_id&tournament_id=eq.${tournament}&order=match_date.asc,match_id.asc`,
        euroMatchSchema)
    : Promise.resolve([]));

export const getEuropeStandings = cache((tournament: string) =>
  TOURNAMENT.test(tournament)
    ? rows("soccer_standings", `tournament_id=eq.${tournament}&stage_key=eq.league&order=position.asc`, standingSchema) : Promise.resolve([]));

/** The steps clubs of one division took at the end of one season (from_*), and into it (to_*). */
export const getMovesFrom = cache((league: string, year: number) =>
  LEAGUE.test(league) ? rows("soccer_club_moves", `from_league=eq.${league}&from_year=eq.${year}`, clubMoveSchema) : Promise.resolve([]));
export const getMovesInto = cache((league: string, year: number) =>
  LEAGUE.test(league) ? rows("soccer_club_moves", `to_league=eq.${league}&to_year=eq.${year}`, clubMoveSchema) : Promise.resolve([]));

export interface EuropeTop { code: string; name: string; short: string; first: number; last: number; seasons: number; champion: string | null; championYear: number | null }

/** The five top divisions that have something to show (results or a table), in the order of EUROPE_TOP_LEAGUES; none while the archive holds none of them. */
export const getEuropeTops = cache(async (): Promise<EuropeTop[]> => {
  const all = (await getEuropeSeasons()).filter(hasContent);
  return EUROPE_TOP_LEAGUES.flatMap((code) => {
    const list = all.filter((s) => s.league === code);
    if (!list.length) return [];
    const won = list.filter((s) => s.champion).at(-1);
    return [{ code, name: list[0].league_name, short: list[0].league_short, first: list[0].year, last: list.at(-1)!.year, seasons: list.length, champion: won?.champion ?? null, championYear: won?.year ?? null }];
  });
});

export const europeClubBySlug = cache(async (slug: string): Promise<EuropeClub | null> =>
  SLUG.test(slug) ? ((await rows("soccer_clubs", `slug=eq.${slug}`, clubSchema))[0] ?? null) : null);

export const getEuropeClubSeasons = cache((team: string) =>
  CLUB.test(team) ? rows("soccer_club_seasons", `team_id=eq.${team}&order=year.asc`, clubSeasonSchema) : Promise.resolve([]));
export const getEuropeClubMoves = cache((team: string) =>
  CLUB.test(team) ? rows("soccer_club_moves", `team_id=eq.${team}&order=from_year.asc`, clubMoveSchema) : Promise.resolve([]));
export const getEuropeClubStandings = cache((team: string) =>
  CLUB.test(team) ? rows("soccer_standings", `team_id=eq.${team}&stage_key=eq.league&order=year.asc`, standingSchema) : Promise.resolve([]));

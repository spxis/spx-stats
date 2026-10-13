import "server-only";
import { cache } from "react";
import { z } from "zod";
import { matchSchema, rows, standingSchema, teamMatchSchema, type Match } from "./soccer";

/**
 * Major League Soccer, read from the api views of migration 076 and the soccer views of 066 (docs/mls.md). Like lib/soccer.ts, every function
 * returns [] / null when the archive holds no MLS yet (a production that has not had the data release) and throws ApiError when it cannot be read.
 */

const text = z.string();
const nText = z.string().nullable();
const num = z.number();
const nNum = z.number().nullable();

export const seasonSchema = z.object({
  tournament_id: text, year: num, name: text, start_date: nText, end_date: nText, team_count: nNum, complete: z.boolean(),
  champion_id: nText, champion: nText, champion_slug: nText, runner_up_id: nText, runner_up: nText, runner_up_slug: nText,
  shield_id: nText, shield: nText, shield_slug: nText,
  final_match_id: nNum, final_date: nText, final_home_goals: nNum, final_away_goals: nNum, final_home_id: nText, final_extra_time: z.boolean().nullable(),
  final_shootout: z.boolean().nullable(), final_home_penalties: nNum, final_away_penalties: nNum, final_venue: nText, final_city: nText, final_attendance: nNum,
  regular_matches: num, playoff_matches: num, regular_goals: num, avg_attendance: nNum, expected_regular: nNum, source: nText,
});
export type Season = z.infer<typeof seasonSchema>;

export const seasonTeamSchema = z.object({
  tournament_id: text, year: num, team_id: text, team_slug: text, team_name: text, conference: nText, venue_name: nText, venue_city: nText,
  venue_wikidata_id: nText, performance: nText, final_position: nNum,
  overall_position: nNum, played: nNum, wins: nNum, shootout_wins: nNum, draws: nNum, losses: nNum, goals_for: nNum, goals_against: nNum,
  goal_difference: nNum, points: nNum, shield: z.boolean(), champion: z.boolean(),
});
export type SeasonTeam = z.infer<typeof seasonTeamSchema>;

export const clubSchema = z.object({
  team_id: text, slug: text, name: text, country_code: nText, wikidata_id: nText, first_year: num, last_year: num, seasons: num, cups: num, shields: num,
  finals_lost: num, latest_name: nText,
});
export type Club = z.infer<typeof clubSchema>;

export const clubNameSchema = z.object({ team_id: text, name: text, from_year: num, to_year: num });
export type ClubName = z.infer<typeof clubNameSchema>;

export const allTimeSchema = z.object({
  team_id: text, seasons: num, played: num, won: num, drawn: num, lost: num, goals_for: num, goals_against: num, points: nNum,
});
export type AllTime = z.infer<typeof allTimeSchema>;

export const leaderSchema = z.object({
  tournament_id: text, year: num, category: z.enum(["goals", "assists", "shutouts", "award"]), label: text, rank: num, player_name: text,
  team_id: nText, team_name: nText, team_slug: nText, value: nNum, wikidata_id: nText,
});
export type Leader = z.infer<typeof leaderSchema>;

const SEASON = /^mls\d{4}$/;
const CLUB = /^C-[a-z0-9-]+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const getMlsSeasons = cache(() => rows("mls_seasons", "order=year.asc", seasonSchema));

export const mlsSeasonOfYear = cache(async (year: number): Promise<Season | null> => (await getMlsSeasons()).find((s) => s.year === year) ?? null);

export const getMlsSeasonTeams = cache((tournament: string) =>
  SEASON.test(tournament) ? rows("mls_season_teams", `tournament_id=eq.${tournament}&order=team_name.asc`, seasonTeamSchema) : Promise.resolve([]));

export const getMlsMatches = cache((tournament: string) =>
  SEASON.test(tournament) ? rows("soccer_matches", `tournament_id=eq.${tournament}&order=match_date.asc,match_id.asc`, matchSchema) : Promise.resolve([]));

export const getMlsStandings = cache((tournament: string) =>
  SEASON.test(tournament)
    ? rows("soccer_standings", `tournament_id=eq.${tournament}&order=stage_number.asc,group_name.asc,position.asc`, standingSchema) : Promise.resolve([]));

export const getMlsLeaders = cache((tournament: string) =>
  SEASON.test(tournament) ? rows("mls_leaders", `tournament_id=eq.${tournament}&order=category.asc,label.asc,rank.asc,player_name.asc`, leaderSchema) : Promise.resolve([]));

export const getMlsClubs = cache(() => rows("mls_clubs", "order=name.asc", clubSchema));
export const getMlsAllTime = cache(() => rows("mls_alltime", "order=team_id.asc", allTimeSchema));

export const mlsClubBySlug = cache(async (slug: string): Promise<Club | null> =>
  SLUG.test(slug) ? ((await rows("mls_clubs", `slug=eq.${slug}`, clubSchema))[0] ?? null) : null);

export const getMlsClubNames = cache((team: string) =>
  CLUB.test(team) ? rows("mls_club_names", `team_id=eq.${team}&order=from_year.asc`, clubNameSchema) : Promise.resolve([]));

export const getMlsClubSeasons = cache((team: string) =>
  CLUB.test(team) ? rows("mls_season_teams", `team_id=eq.${team}&order=year.asc`, seasonTeamSchema) : Promise.resolve([]));

export const getMlsClubMatches = cache((team: string) =>
  CLUB.test(team) ? rows("soccer_team_matches", `team_id=eq.${team}&league=eq.mls&order=match_date.asc,match_id.asc`, teamMatchSchema) : Promise.resolve([]));

export const getMlsMatch = cache(async (matchId: number): Promise<Match | null> =>
  Number.isInteger(matchId) && matchId > 0 && matchId < 1e9 ? ((await rows("soccer_matches", `match_id=eq.${matchId}&league=eq.mls`, matchSchema))[0] ?? null) : null);

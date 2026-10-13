import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";

/**
 * The World Cup, read from the api views of migration 066 (docs/soccer.md). Every function returns [] / null when the archive holds no
 * soccer yet (a production that has not had the data release), and throws ApiError when it cannot be read, like the rest of lib/api.
 */

const text = z.string();
const nText = z.string().nullable();
const num = z.number();
const nNum = z.number().nullable();

export const tournamentSchema = z.object({
  tournament_id: text, league: text, year: num, name: text, host_names: z.array(text), host_team_ids: z.array(text),
  start_date: nText, end_date: nText, team_count: nNum,
  winner_team_id: nText, winner: nText, winner_slug: nText, winner_flag: nText,
  runner_up_team_id: nText, runner_up: nText, runner_up_slug: nText, runner_up_flag: nText,
  third_team_id: nText, third: nText, fourth_team_id: nText, fourth: nText,
  final_match_id: nNum, final_home: nText, final_away: nText, final_home_goals: nNum, final_away_goals: nNum,
  final_extra_time: z.boolean().nullable(), final_shootout: z.boolean().nullable(), final_home_penalties: nNum, final_away_penalties: nNum,
  matches: num, goals: num, top_goals: nNum, top_scorers: z.array(text).nullable(), top_person_ids: z.array(nNum).nullable(), source: nText,
});
export type Tournament = z.infer<typeof tournamentSchema>;

export const tournamentTeamSchema = z.object({
  tournament_id: text, league: text, year: num, team_id: text, team: text, team_slug: text, flag_code: nText, performance: nText,
  final_position: nNum, is_host: z.boolean(), group_name: nText, played: num, won: num, drawn: num, lost: num, goals_for: num, goals_against: num,
  managers: z.array(text).nullable(),
});
export type TournamentTeam = z.infer<typeof tournamentTeamSchema>;

export const matchSchema = z.object({
  match_id: num, source_key: text, league: text, year: num, tournament_id: text, stage_key: text, stage_order: num, group_name: nText, match_number: nNum,
  match_date: text, kickoff_local: nText, utc_offset: nText,
  home_team_id: text, home: text, home_slug: text, home_flag: nText, home_goals: num,
  away_team_id: text, away: text, away_slug: text, away_flag: nText, away_goals: num,
  home_goals_90: nNum, away_goals_90: nNum, extra_time: z.boolean(), shootout: z.boolean(), home_penalties: nNum, away_penalties: nNum,
  winner_team_id: nText, is_replay: z.boolean(), venue_name: nText, venue_city: nText, venue_country: nText, venue_wikidata_id: nText, venue_id: nNum,
  lineup_players: num, goal_rows: num, source: nText, checked: nNum,
});
export type Match = z.infer<typeof matchSchema>;

export const standingSchema = z.object({
  tournament_id: text, league: text, year: num, stage_number: num, stage_key: text, group_name: text, position: num, team_id: text, team: text,
  team_slug: text, flag_code: nText, played: nNum, wins: nNum, draws: nNum, losses: nNum, goals_for: nNum, goals_against: nNum, goal_difference: nNum,
  points: nNum, advanced: z.boolean().nullable(),
});
export type Standing = z.infer<typeof standingSchema>;

export const topScorerSchema = z.object({
  tournament_id: text, league: text, year: num, person_id: nNum, player: text, team_id: text, team: text, team_slug: text, flag_code: nText,
  goals: num, penalties: num, matches_scored_in: num,
});
export type TopScorer = z.infer<typeof topScorerSchema>;

export const awardSchema = z.object({
  tournament_id: text, league: text, year: num, award: text, award_order: num, person_id: num, player: text, team_id: nText, team: nText, team_slug: nText, shared: z.boolean(),
});
export type Award = z.infer<typeof awardSchema>;

export const teamSchema = z.object({
  team_id: text, name: text, slug: text, fifa_code: nText, flag_code: nText, country_code: nText, federation: nText, region: nText, confederation: nText,
  continues_team_id: nText, has_men: z.boolean(), has_women: z.boolean(), wikidata_men: nText, wikidata_women: nText, tournaments: num,
});
export type SoccerTeam = z.infer<typeof teamSchema>;

export const teamRecordSchema = z.object({
  team_id: text, league: text, tournaments: num, played: num, won: num, drawn: num, lost: num, goals_for: num, goals_against: num,
});
export type TeamRecord = z.infer<typeof teamRecordSchema>;

export const teamMatchSchema = z.object({
  match_id: num, league: text, year: num, tournament_id: text, stage_key: text, stage_order: num, group_name: nText, match_date: text,
  team_id: text, opponent_id: text, opponent: text, opponent_slug: text, opponent_flag: nText, is_home: z.boolean(), gf: num, ga: num, result: z.enum(["w", "d", "l"]),
  extra_time: z.boolean(), shootout: z.boolean(), pens_for: nNum, pens_against: nNum, won_match: z.boolean().nullable(),
  venue_name: nText, venue_city: nText, venue_country: nText,
});
export type TeamMatch = z.infer<typeof teamMatchSchema>;

export const lineupSchema = z.object({
  match_id: num, team_id: text, team: text, person_id: num, player: text, shirt_number: nNum, position_name: nText, position_code: nText,
  starter: z.boolean(), substitute: z.boolean(), off_at: nText, on_at: nText,
});
export type Lineup = z.infer<typeof lineupSchema>;

export const scorerSchema = z.object({
  match_id: num, tournament_id: text, league: text, year: num, team_id: text, team: text, team_slug: text, flag_code: nText, person_id: nNum, scorer_name: text,
  minute_label: text, minute: nNum, stoppage: nNum, period: nText, own_goal: z.boolean(), penalty: z.boolean(),
});
export type Goal = z.infer<typeof scorerSchema>;

export const cardSchema = z.object({
  booking_id: text, match_id: num, team_id: text, team: text, person_id: num, player: text, shirt_number: nNum, minute_label: text, minute: nNum,
  stoppage: nNum, period: nText, yellow_card: z.boolean(), red_card: z.boolean(), second_yellow: z.boolean(), sending_off: z.boolean(),
});
export type Card = z.infer<typeof cardSchema>;

export const substitutionSchema = z.object({
  substitution_id: text, match_id: num, team_id: text, team: text, person_id: num, player: text, shirt_number: nNum, minute_label: text, minute: nNum,
  stoppage: nNum, period: nText, going_off: z.boolean(), coming_on: z.boolean(),
});
export type Substitution = z.infer<typeof substitutionSchema>;

export const shootoutSchema = z.object({
  kick_id: text, match_id: num, team_id: text, team: text, person_id: num, player: text, shirt_number: nNum, converted: z.boolean(),
});
export type Kick = z.infer<typeof shootoutSchema>;

export const staffSchema = z.object({
  match_id: num, role: z.enum(["manager", "referee"]), team_id: nText, team: nText, person_id: num, name: text, country: nText, flag_code: nText,
});
export type Staff = z.infer<typeof staffSchema>;

export const squadSchema = z.object({
  tournament_id: text, league: text, year: num, team_id: text, team: text, team_slug: text, person_id: num, player: text, birth_date: nText,
  shirt_number: nNum, position_name: nText, position_code: nText, played: num, started: num, goals: num, yellow: num, red: num,
});
export type Squad = z.infer<typeof squadSchema>;

export const personSchema = z.object({ person_id: num, name: text, kind: text, birth_date: nText, nationality_code: nText, tournaments: num, managed: num });
export type SoccerPerson = z.infer<typeof personSchema>;

export const playerTournamentSchema = z.object({
  person_id: num, tournament_id: text, league: text, year: num, team_id: text, team: text, team_slug: text, shirt_number: nNum, position_code: nText,
  played: num, started: num, goals: num, yellow: num, red: num,
});
export type PlayerTournament = z.infer<typeof playerTournamentSchema>;

const TOURNAMENT = /^(?:wc|wwc)\d{4}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const id = (n: number) => Number.isInteger(n) && n > 0 && n < 1e9;

export const getTournaments = cache(() => rows("soccer_tournaments", "order=year.asc", tournamentSchema));

export const tournamentOfYear = cache(async (year: number): Promise<Tournament | null> =>
  (await getTournaments()).find((t) => t.year === year) ?? null);

export const getTournamentTeams = cache((tournament: string) =>
  TOURNAMENT.test(tournament) ? rows("soccer_tournament_teams", `tournament_id=eq.${tournament}&order=team.asc`, tournamentTeamSchema) : Promise.resolve([]));

export const getTournamentMatches = cache((tournament: string) =>
  TOURNAMENT.test(tournament) ? rows("soccer_matches", `tournament_id=eq.${tournament}&order=match_date.asc,match_id.asc`, matchSchema) : Promise.resolve([]));

export const getStandings = cache((tournament: string) =>
  TOURNAMENT.test(tournament)
    ? rows("soccer_standings", `tournament_id=eq.${tournament}&order=stage_number.asc,group_name.asc,position.asc`, standingSchema) : Promise.resolve([]));

export const getTopScorers = cache((tournament: string) =>
  TOURNAMENT.test(tournament)
    ? rows("soccer_top_scorers", `tournament_id=eq.${tournament}&order=goals.desc,player.asc&limit=40`, topScorerSchema) : Promise.resolve([]));

export const getAwards = cache((tournament: string) =>
  TOURNAMENT.test(tournament) ? rows("soccer_awards", `tournament_id=eq.${tournament}&order=award_order.asc,player.asc`, awardSchema) : Promise.resolve([]));

export const getSquads = cache((tournament: string) =>
  TOURNAMENT.test(tournament)
    ? rows("soccer_squads", `tournament_id=eq.${tournament}&order=team.asc,shirt_number.asc.nullslast,player.asc`, squadSchema) : Promise.resolve([]));

export const getSoccerTeams = cache(() => rows("soccer_teams", "order=name.asc", teamSchema));
export const getTeamRecords = cache(() => rows("soccer_team_records", "order=team_id.asc", teamRecordSchema));

export const teamBySlug = cache(async (slug: string): Promise<SoccerTeam | null> =>
  SLUG.test(slug) ? ((await rows("soccer_teams", `slug=eq.${slug}`, teamSchema))[0] ?? null) : null);

export const getTeamMatches = cache((team: string) =>
  /^[A-Z]-[a-z0-9-]+$/.test(team) ? rows("soccer_team_matches", `team_id=eq.${team}&order=match_date.asc,match_id.asc`, teamMatchSchema) : Promise.resolve([]));

export const getTeamTournaments = cache((team: string) =>
  /^[A-Z]-[a-z0-9-]+$/.test(team) ? rows("soccer_tournament_teams", `team_id=eq.${team}&order=year.asc`, tournamentTeamSchema) : Promise.resolve([]));

export const getMatch = cache(async (matchId: number): Promise<Match | null> =>
  id(matchId) ? ((await rows("soccer_matches", `match_id=eq.${matchId}`, matchSchema))[0] ?? null) : null);

/** Everything on one match page, read together. */
export async function getMatchDetail(matchId: number) {
  const q = `match_id=eq.${matchId}`;
  const [lineups, goals, cards, subs, kicks, staff] = await Promise.all([
    rows("soccer_lineups", `${q}&order=team.asc,starter.desc,shirt_number.asc.nullslast`, lineupSchema),
    rows("soccer_scorers", `${q}&order=minute.asc.nullslast,stoppage.asc.nullslast`, scorerSchema),
    rows("soccer_cards", `${q}&order=minute.asc.nullslast,stoppage.asc.nullslast`, cardSchema),
    rows("soccer_substitutions", `${q}&order=minute.asc.nullslast,stoppage.asc.nullslast`, substitutionSchema),
    rows("soccer_shootout", `${q}&order=kick_id.asc`, shootoutSchema),
    rows("soccer_match_staff", `${q}`, staffSchema),
  ]);
  return { lineups, goals, cards, subs, kicks, staff };
}

export const soccerPerson = cache(async (personId: number): Promise<SoccerPerson | null> =>
  id(personId) ? ((await rows("soccer_people", `person_id=eq.${personId}`, personSchema))[0] ?? null) : null);

export const getPlayerTournaments = cache((personId: number) =>
  id(personId) ? rows("soccer_player_tournaments", `person_id=eq.${personId}&order=year.asc`, playerTournamentSchema) : Promise.resolve([]));

export const getPlayerGoals = cache((personId: number) =>
  id(personId) ? rows("soccer_scorers", `person_id=eq.${personId}&order=year.asc,match_id.asc`, scorerSchema) : Promise.resolve([]));

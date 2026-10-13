import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import { standingRows } from "./api/teamSeasons";
import { gameSchema, playoffShapeSchema, standingSchema } from "./api/schemas";
import { getFranchiseSeasons } from "./h2hData";
import type { GameRow, StandingRow } from "./api/types";

/** Every playoff game of a season, in the order played. */
export const getPlayoffGames = cache(async (lg: string, y: number): Promise<GameRow[]> =>
  rows("games", `league=eq.${lg}&year=eq.${y}&phase=eq.playoffs&select=*&order=game_date,game_id`, gameSchema));

/** The team-season ids of two franchises in a league. a and b are validated integers. */
const getTeamSeasonIds = cache(async (lg: string, a: number, b: number): Promise<[number[], number[]]> => {
  const list = await getFranchiseSeasons(lg, [a, b]);
  const of = (f: number) => list.filter((r) => r.franchise_id === f).map((r) => r.team_season_id);
  return [of(a), of(b)];
});

/**
 * Every playoff game, before season `before`, of each season in which two franchises met in the playoffs, grouped by season (newest first,
 * each in the order played). The games between the two are whole rows; the others are only the columns that fix the shape of the bracket,
 * which is all the round of a series needs. Three small reads, none of which scans the league's games:
 * - The games view works out each game's franchises row by row (a correlated lookup), so asking it for `away_f` and `home_f` reads every
 *   game of the league first (20 seconds when the cache is cold, and a statement timeout when the database is busy). Asking by team-season id
 *   (`away_id`, `home_id`) uses the indexes on those columns instead, one direction at a time so the two indexes can be combined.
 * - The rest of each season's playoffs comes in one request for all the seasons, not one request each, which a small database cannot
 *   answer in parallel, and without the names and the per-row verification lookup.
 */
export const getPastMeetingGames = cache(async (lg: string, a: number, b: number, before: number): Promise<Map<number, GameRow[]>> => {
  const [ia, ib] = await getTeamSeasonIds(lg, a, b);
  const out = new Map<number, GameRow[]>();
  if (!ia.length || !ib.length) return out;
  const side = (x: number[], y: number[]) =>
    rows("games", `league=eq.${lg}&year=lt.${before}&phase=eq.playoffs&away_id=in.(${x.join(",")})&home_id=in.(${y.join(",")})&select=*&order=game_date,game_id`, gameSchema);
  const pair = (await Promise.all([side(ia, ib), side(ib, ia)])).flat();
  const years = [...new Set(pair.map((g) => g.year))].sort((p, q) => q - p);
  if (!years.length) return out;
  const whole = new Map(pair.map((g) => [g.game_id, g]));
  const shape = await rows("games", `league=eq.${lg}&phase=eq.playoffs&year=in.(${years.join(",")})&select=game_id,year,game_date,status,away_score,home_score,away_f,home_f&order=year,game_date,game_id`, playoffShapeSchema);
  for (const y of years) out.set(y, []);
  for (const s of shape) {
    const g: GameRow = whole.get(s.game_id) ?? { ...s, league: lg, phase: "playoffs", away_id: 0, away: null, home_id: 0, home: null, overtime: null, source: "", checked: null };
    out.get(s.year)?.push(g);
  }
  return out;
});

/** A season's standings, for the records of the two teams and where each stood. */
export const getSeasonStandings = cache(async (lg: string, y: number): Promise<StandingRow[]> =>
  standingRows(`league=eq.${lg}&year=eq.${y}&select=*`, standingSchema));

const finalsSchema = z.object({ year: z.number(), game_date: z.string(), away: z.string().nullable(), away_f: z.number().nullable(), home: z.string().nullable(), home_f: z.number().nullable() });

/** Just the teams of every playoff game of a league, to find who a champion beat in its final (the league page's Final column). */
export const getLeaguePlayoffTeams = cache(async (lg: string) =>
  rows("games", `league=eq.${lg}&phase=eq.playoffs&select=year,game_date,away,away_f,home,home_f&order=year,game_date,game_id`, finalsSchema));

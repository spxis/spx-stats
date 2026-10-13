import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import { standingRows } from "./api/teamSeasons";
import { gameSchema, playoffShapeSchema, standingSchema } from "./api/schemas";
import { getFranchiseSeasons, limited, slicesOf } from "./h2hData";
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

const champSchema = z.object({ year: z.number(), champion_franchise: z.number() });
const clubSchema = z.object({ year: z.number(), team_id: z.number(), franchise_id: z.number(), team: z.string().nullable() });
const identitySchema = z.object({ team_season_id: z.number(), franchise_id: z.number(), team: z.string().nullable() });
const champGameSchema = z.object({ year: z.number(), game_date: z.string(), away_id: z.number(), home_id: z.number() });

/** Champion team seasons asked for in one request, by direction. */
const CHAMPS_PER_SLICE = 40;

export interface FinalsGame { year: number; game_date: string; away: string | null; away_f: number | null; home: string | null; home_f: number | null }

/**
 * The playoff games of each season's champion with the teams of both sides (enough to find who a champion beat in its final: the league
 * page's Final column and a season's champion note), for a whole league or, with `year`, one season. The games view works out the club
 * names and franchises row by row, and its `phase` has no index, so asking it for the playoff games of a league reads every game the
 * league ever played first (seconds when the cache is cold, a statement timeout when the database is busy). So this reads only the
 * champions' own games by team-season id (`away_id`, `home_id`: the indexes on those columns answer them, one direction at a time) with
 * no names, a few seasons per request, and names the clubs from the standings (a precomputed copy). The standings list only the clubs of
 * the league's own table, so an opponent outside it (a challenger from another league in the first Stanley Cup finals) is named by one
 * more small read of those team seasons by id.
 */
export const getLeaguePlayoffTeams = cache(async (lg: string, year?: number): Promise<FinalsGame[]> => {
  const only = year == null ? "" : `&year=eq.${year}`;
  const [champs, clubs] = await Promise.all([
    rows("season_summary", `league=eq.${lg}${only}&champion_franchise=not.is.null&select=year,champion_franchise&order=year`, champSchema),
    standingRows(`league=eq.${lg}${only}&select=year,team_id,franchise_id,team&order=year,team_id`, clubSchema),
  ]);
  const champOf = new Map(champs.map((c) => [c.year, c.champion_franchise]));
  const club = new Map<number, { franchise_id: number; team: string | null }>(clubs.map((c) => [c.team_id, c]));
  const ids = clubs.filter((c) => champOf.get(c.year) === c.franchise_id).map((c) => c.team_id);
  // A champion from outside the league's own table (the 1925 Victoria Cougars) is not in the standings: find its team season directly.
  const listed = new Set(clubs.filter((c) => champOf.get(c.year) === c.franchise_id).map((c) => c.year));
  const missing = [...champOf].filter(([y]) => !listed.has(y));
  const found = await limited(missing.map(([y, f]) => () =>
    rows("team_season_identity", `league=eq.${lg}&year=eq.${y}&franchise_id=eq.${f}&select=team_season_id,franchise_id,team`, identitySchema)), 3);
  for (const r of found.flat()) {
    club.set(r.team_season_id, r);
    ids.push(r.team_season_id);
  }
  if (!ids.length) return [];
  const jobs = slicesOf(ids, CHAMPS_PER_SLICE).flatMap((slice) =>
    (["away_id", "home_id"] as const).map((side) => () =>
      rows("games", `league=eq.${lg}&phase=eq.playoffs&${side}=in.(${slice.join(",")})&select=year,game_date,away_id,home_id&order=game_id`, champGameSchema)));
  const games = (await limited(jobs, 2)).flat();
  const unnamed = [...new Set(games.flatMap((g) => [g.away_id, g.home_id]))].filter((id) => !club.has(id));
  for (const slice of slicesOf(unnamed, 100)) {
    for (const r of await rows("team_season_identity", `team_season_id=in.(${slice.join(",")})&select=team_season_id,franchise_id,team&order=team_season_id`, identitySchema)) club.set(r.team_season_id, r);
  }
  return games.map((g) => {
    const away = club.get(g.away_id), home = club.get(g.home_id);
    return { year: g.year, game_date: g.game_date, away: away?.team ?? null, away_f: away?.franchise_id ?? null, home: home?.team ?? null, home_f: home?.franchise_id ?? null };
  });
});

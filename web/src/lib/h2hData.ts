import "server-only";
import { cache } from "react";
import { rows } from "./api/client";
import { pairGameSchema, teamGameSchema, teamSeasonIdSchema } from "./api/schemas";
import type { GameRow } from "./api/types";

/*
 * How the head-to-head pages read games. The games view works out each game's franchises (and the club names and the verification
 * lookup) row by row, so asking it for `home_f` or `away_f` reads every game of the league first (20 seconds for baseball with a cold
 * cache, and a statement timeout when the database is busy). So these read by team-season id instead (`away_id`, `home_id`: the indexes
 * on those columns answer them), ask only for the columns the page uses, and read the history in slices of seasons: a slice is one
 * request of at most a page, a long history is not one query sorted again for every page, and no one request runs long enough to time out.
 */

export interface FranchiseSeason { team_season_id: number; franchise_id: number; year: number }

/** The team seasons (id and season) of some franchises in a league. The franchise ids are validated integers. */
export const getFranchiseSeasons = cache(async (lg: string, fs: readonly number[]): Promise<FranchiseSeason[]> =>
  rows("team_season_identity", `league=eq.${lg}&franchise_id=in.(${fs.join(",")})&select=team_season_id,franchise_id,year`, teamSeasonIdSchema));

/** Runs the jobs at most `limit` at a time (the database is small: a long history is a few slices, not a request for every season at once), keeping their order. */
async function limited<T>(jobs: readonly (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out = new Array<T>(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) {
      const i = next++;
      out[i] = await jobs[i]();
    }
  }));
  return out;
}

const SLICES_AT_ONCE = 4;
const slicesOf = <T,>(list: readonly T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

/** Seasons per slice of a pair's history: they meet a few times a season, so thirty seasons are well under a page. */
const PAIR_SLICE = 30;
/** Games one club plays in a season with its playoffs, roughly, by league: a slice holds about a page of them. */
const SEASON_GAMES = { nhl: 100, nba: 100, mlb: 175, nfl: 22, cfl: 22 } as const;

const PAIR_COLS = "game_id,year,game_date,phase,status,away_id,away,away_score,home_id,home,home_score,overtime,source";
const TEAM_COLS = "game_id,year,game_date,phase,status,away_score,home_score,overtime,away_f,home_f";

/**
 * Every regular-season and playoff game two franchises played each other, in slices of seasons (the seasons both played), each slice one
 * request that holds the ids of both clubs' seasons on both sides: a game is only ever between the two clubs of one season, so the slice
 * returns exactly their meetings, whichever of them was at home. The page then filters by season, part of the season and venue.
 * a and b are validated integers.
 */
export const getPairHistory = cache(async (lg: string, a: number, b: number): Promise<GameRow[]> => {
  const seasons = await getFranchiseSeasons(lg, [a, b]);
  const franchise = new Map(seasons.map((s) => [s.team_season_id, s.franchise_id]));
  const idsOf = (f: number) => {
    const by = new Map<number, number[]>();
    for (const s of seasons) if (s.franchise_id === f) by.set(s.year, [...(by.get(s.year) ?? []), s.team_season_id]);
    return by;
  };
  const [ya, yb] = [idsOf(a), idsOf(b)];
  const years = [...ya.keys()].filter((y) => yb.has(y)).sort((p, q) => p - q);
  const slices = await limited(slicesOf(years, PAIR_SLICE).map((ys) => async () => {
    const ids = ys.flatMap((y) => [...ya.get(y)!, ...yb.get(y)!]).join(",");
    const list = await rows("games", `league=eq.${lg}&phase=in.(regular,playoffs)&away_id=in.(${ids})&home_id=in.(${ids})&select=${PAIR_COLS}&order=game_date,game_id`, pairGameSchema);
    return list.map((g): GameRow => ({ ...g, league: lg, checked: null, away_f: franchise.get(g.away_id) ?? null, home_f: franchise.get(g.home_id) ?? null }));
  }), SLICES_AT_ONCE);
  return slices.flat();
});

/**
 * Every regular-season and playoff game a franchise played, in slices of seasons, for its record against a group of clubs. The rows carry
 * the franchises and scores but not the club names (a longest history is a few dozen pages as whole rows).
 */
export const getTeamHistory = cache(async (lg: string, f: number): Promise<GameRow[]> => {
  const seasons = (await getFranchiseSeasons(lg, [f])).sort((p, q) => p.year - q.year);
  const size = Math.max(1, Math.floor(900 / (SEASON_GAMES[lg as keyof typeof SEASON_GAMES] ?? 100)));
  const slices = await limited(slicesOf(seasons, size).map((ss) => async () => {
    const ids = ss.map((s) => s.team_season_id).join(",");
    const list = await rows("games", `league=eq.${lg}&phase=in.(regular,playoffs)&or=(away_id.in.(${ids}),home_id.in.(${ids}))&select=${TEAM_COLS}&order=game_date,game_id`, teamGameSchema);
    return list.map((g): GameRow => ({ ...g, league: lg, away_id: 0, away: null, home_id: 0, home: null, source: "", checked: null }));
  }), SLICES_AT_ONCE);
  return slices.flat();
});

/** The games of one season's phase between two franchises, in the order played (the whole rows the series page lists). a and b are validated integers. */
export const getPairGames = cache(async (lg: string, y: number, a: number, b: number, phase: "playoffs" | "regular"): Promise<GameRow[]> => {
  const seasons = (await getFranchiseSeasons(lg, [a, b])).filter((s) => s.year === y);
  if (!seasons.some((s) => s.franchise_id === a) || !seasons.some((s) => s.franchise_id === b)) return [];
  const franchise = new Map(seasons.map((s) => [s.team_season_id, s.franchise_id]));
  const ids = seasons.map((s) => s.team_season_id).join(",");
  const list = await rows("games", `league=eq.${lg}&year=eq.${y}&phase=eq.${phase}&away_id=in.(${ids})&home_id=in.(${ids})&select=${PAIR_COLS}&order=game_date,game_id`, pairGameSchema);
  return list.map((g): GameRow => ({ ...g, league: lg, checked: null, away_f: franchise.get(g.away_id) ?? null, home_f: franchise.get(g.home_id) ?? null }));
});

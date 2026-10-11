import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import { gameSchema, standingSchema } from "./api/schemas";
import type { GameRow, StandingRow } from "./api/types";

/** Every playoff game of a season, in the order played. */
export const getPlayoffGames = cache(async (lg: string, y: number): Promise<GameRow[]> =>
  rows("games", `league=eq.${lg}&year=eq.${y}&phase=eq.playoffs&select=*&order=game_date,game_id`, gameSchema));

const pairFilter = (a: number, b: number) => `or=(and(away_f.eq.${a},home_f.eq.${b}),and(away_f.eq.${b},home_f.eq.${a}))`;

/** The games of one season's phase between two franchises, in the order played. a and b are validated integers. */
export const getPairGames = cache(async (lg: string, y: number, a: number, b: number, phase: "playoffs" | "regular"): Promise<GameRow[]> =>
  rows("games", `league=eq.${lg}&year=eq.${y}&phase=eq.${phase}&${pairFilter(a, b)}&select=*&order=game_date,game_id`, gameSchema));

const yearsSchema = z.object({ year: z.number() });

/** The seasons in which two franchises played each other in the playoffs, newest first. a and b are validated integers. */
export const getPairPlayoffYears = cache(async (lg: string, a: number, b: number): Promise<number[]> => {
  const list = await rows("games", `league=eq.${lg}&phase=eq.playoffs&${pairFilter(a, b)}&select=year&order=year.desc`, yearsSchema);
  return [...new Set(list.map((g) => g.year))];
});

/** A season's standings, for the records of the two teams and where each stood. */
export const getSeasonStandings = cache(async (lg: string, y: number): Promise<StandingRow[]> =>
  rows("standings", `league=eq.${lg}&year=eq.${y}&select=*`, standingSchema));

const finalsSchema = z.object({ year: z.number(), game_date: z.string(), away: z.string().nullable(), away_f: z.number().nullable(), home: z.string().nullable(), home_f: z.number().nullable() });

/** Just the teams of every playoff game of a league, to find who a champion beat in its final (the league page's Final column). */
export const getLeaguePlayoffTeams = cache(async (lg: string) =>
  rows("games", `league=eq.${lg}&phase=eq.playoffs&select=year,game_date,away,away_f,home,home_f&order=year,game_date,game_id`, finalsSchema));

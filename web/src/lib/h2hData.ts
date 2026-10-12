import "server-only";
import { cache } from "react";
import { rows } from "./api/client";
import { gameSchema } from "./api/schemas";
import type { GameRow } from "./api/types";

/**
 * Every regular-season and playoff game two franchises played each other: the games one hosted and the games the
 * other hosted, asked for together (two requests at once, a few pages each for the busiest pairs). The page then
 * filters by season, part of the season and venue. a and b are validated integers.
 */
export const getPairHistory = cache(async (lg: string, a: number, b: number): Promise<GameRow[]> => {
  const side = (home: number, away: number) =>
    rows("games", `league=eq.${lg}&phase=in.(regular,playoffs)&home_f=eq.${home}&away_f=eq.${away}&select=*&order=game_date,game_id`, gameSchema);
  const [x, y] = await Promise.all([side(a, b), side(b, a)]);
  return [...x, ...y];
});

/** Every regular-season and playoff game a franchise played, for its record against a group of clubs (a few dozen pages for the longest histories). */
export const getTeamHistory = cache(async (lg: string, f: number): Promise<GameRow[]> => {
  const side = (col: "home_f" | "away_f") =>
    rows("games", `league=eq.${lg}&phase=in.(regular,playoffs)&${col}=eq.${f}&select=*&order=game_date,game_id`, gameSchema);
  const [x, y] = await Promise.all([side("home_f"), side("away_f")]);
  return [...x, ...y];
});

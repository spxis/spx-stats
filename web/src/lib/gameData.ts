import "server-only";
import { cache } from "react";
import { rows } from "./api/client";
import { gameSchema, pairGameSchema } from "./api/schemas";
import { teamIndexSchema } from "./api/teams";
import type { GameRow } from "./api/types";

/*
 * How a game's page reads the archive. It is a kept page drawn on a visit (nothing is drawn at build), so it asks for little and asks the cheap way:
 * the games view works out each game's franchises row by row, so a read that filters on `away_f` or `home_f` scans the league; these filter on the
 * league and the game id, or on the two clubs' ids in the season (`away_id`, `home_id`, which have indexes), and ask only for the columns the page uses.
 */

/** One game: all of its columns, with the franchises of both sides (a single row, so the per-row work is nothing). Null when the league has no such game. `lg` is in the query so the cache tag is the league's. */
export const getGame = cache(async (lg: string, id: number): Promise<GameRow | null> =>
  (await rows("games", `league=eq.${lg}&game_id=eq.${id}&select=*`, gameSchema))[0] ?? null);

const COLS = "game_id,year,game_date,phase,status,away_id,away,away_score,home_id,home,home_score,overtime,source";

/**
 * Every game either of two clubs played in a season (their ids in that season), both clubs together, in the order played: the records going in, the games
 * either side of the page's game and the season's meetings of the pair all come from this one read. The ids are validated integers and are sorted, so the
 * pages of the same two clubs share the answer.
 */
export const getClubGames = cache(async (lg: string, year: number, x: number, y: number) => {
  const [a, b] = x < y ? [x, y] : [y, x];
  return rows("games", `league=eq.${lg}&year=eq.${year}&or=(away_id.in.(${a},${b}),home_id.in.(${a},${b}))&select=${COLS}&order=game_date,game_id`, pairGameSchema);
});

/** The teams index rows of some franchises of a league (first and last season, seasons played, titles, the names they have had): one read for both clubs. */
export const getFranchiseRows = cache(async (lg: string, fs: readonly number[]) =>
  rows("team_index", `league=eq.${lg}&franchise_id=in.(${[...fs].sort((p, q) => p - q).join(",")})&select=league,franchise_id,name,former_names,first_season,last_season,seasons,titles,share,active`, teamIndexSchema)
    .catch(() => []));

import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import { latestFinals, summarizeGames, type FinalGameRow, type GameSeasonRow, type VenueGames } from "./venueGames";
import { tenanciesOf, type PeriodRow, type Tenancy } from "./venueTenancy";

/* What the archive says about who played at each venue and what was played there. The views come with migration 083 and the tables behind them with a data
   release; until both are on the server, or if they cannot be read, everything here is empty and the pages show what they showed before. */

const period = z.object({
  wikidata_id: z.string(), franchise_id: z.number(), league: z.string(), valid_from: z.string().nullable(), valid_to: z.string().nullable(), last_season: z.number(), league_last: z.number(),
});

/** Every club's tenancy of every venue, by the venue's Wikidata id (upper case). */
export const getTenancies = cache(async (): Promise<Map<string, Tenancy[]>> => {
  try {
    const list: PeriodRow[] = await rows("venue_home_period", "select=wikidata_id,franchise_id,league,valid_from,valid_to,last_season,league_last&order=wikidata_id,valid_from", period);
    return tenanciesOf(list);
  } catch {
    return new Map();
  }
});

const total = z.object({ wikidata_id: z.string(), games: z.number() });

/** Games played at each venue in all, by the venue's Wikidata id (upper case). */
export const getGameTotals = cache(async (): Promise<Map<string, number>> => {
  try {
    return new Map((await rows("venue_game_total", "select=wikidata_id,games&order=wikidata_id", total)).map((r) => [r.wikidata_id.toUpperCase(), r.games]));
  } catch {
    return new Map();
  }
});

const season = z.object({
  league: z.string(), year: z.number(), games: z.number(), regular_games: z.number(), playoff_games: z.number(), final_games: z.number(), first_date: z.string(), last_date: z.string(),
});
const final = z.object({
  game_id: z.number(), game_date: z.string(), league: z.string(), year: z.number(), round_label: z.string().nullable(),
  home_franchise_id: z.number(), away_franchise_id: z.number(), home_score: z.number().nullable(), away_score: z.number().nullable(),
});

export interface VenueGameData { games: VenueGames; finals: FinalGameRow[] }

/** How many finals a venue page lists. */
export const FINALS_SHOWN = 10;

/** The games played at one venue: counts by league and season, and its most recent finals. Null when the archive holds none (or the views are not there yet). */
export const getVenueGames = cache(async (wid: string, order: readonly string[]): Promise<VenueGameData | null> => {
  if (!/^Q[1-9]\d{0,14}$/i.test(wid)) return null;
  const id = wid.toUpperCase();
  try {
    const list: GameSeasonRow[] = await rows(
      "venue_game_season", `wikidata_id=eq.${id}&select=league,year,games,regular_games,playoff_games,final_games,first_date,last_date&order=year,league`, season);
    const games = summarizeGames(list, order);
    if (!games) return null;
    const finals: FinalGameRow[] = games.finals
      ? await rows("venue_final_game", `wikidata_id=eq.${id}&select=game_id,game_date,league,year,round_label,home_franchise_id,away_franchise_id,home_score,away_score&order=game_date.desc&limit=${FINALS_SHOWN}`, final).catch(() => [])
      : [];
    return { games, finals: latestFinals(finals, FINALS_SHOWN) };
  } catch {
    return null;
  }
});

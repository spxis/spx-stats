import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import { orElse } from "./api/soften";
import type { CupFinalGameRow, CupFinalRow, CupSeriesRow } from "./cupRows";

const seriesRow = z.object({
  year: z.number(), seq: z.number(), kind: z.string(),
  winner_name: z.string(), winner_league: z.string().nullable(), winner_franchise: z.number().nullable(),
  loser_name: z.string().nullable(), loser_league: z.string().nullable(), loser_franchise: z.number().nullable(),
  format: z.string().nullable(), score: z.string().nullable(),
}) satisfies z.ZodType<CupSeriesRow>;

const finalRow = z.object({
  year: z.number(), first_day: z.string().nullable(), last_day: z.string().nullable(), format: z.string().nullable(),
  team1_name: z.string(), team1_league: z.string().nullable(), team1_franchise: z.number().nullable(),
  team2_name: z.string(), team2_league: z.string().nullable(), team2_franchise: z.number().nullable(),
  team1_games: z.number().nullable(), team2_games: z.number().nullable(), winner_side: z.number().nullable(),
}) satisfies z.ZodType<CupFinalRow>;

const gameRow = z.object({
  year: z.number(), game_no: z.number(), played_on: z.string().nullable(), team1_score: z.number().nullable(), team2_score: z.number().nullable(),
  overtime_periods: z.number(), home_side: z.number().nullable(), venue_name: z.string().nullable(), venue_city: z.string().nullable(),
}) satisfies z.ZodType<CupFinalGameRow>;

/**
 * Every Stanley Cup series, final and final game up to the end of the mixed-league finals (1926): api.cup_series, api.cup_final, api.cup_final_game, about a
 * hundred small rows each. A view that is not on the server yet (a 4xx) reads as an empty list, so the page just draws without the section; a database failure still fails the page.
 */
export const getCupHistory = cache(async () => {
  const [series, finals, games] = await Promise.all([
    orElse(rows("cup_series", "select=year,seq,kind,winner_name,winner_league,winner_franchise,loser_name,loser_league,loser_franchise,format,score&year=lte.1926&order=year,seq", seriesRow), []),
    orElse(rows("cup_final", "select=year,first_day,last_day,format,team1_name,team1_league,team1_franchise,team2_name,team2_league,team2_franchise,team1_games,team2_games,winner_side&year=lte.1926&order=year", finalRow), []),
    orElse(rows("cup_final_game", "select=year,game_no,played_on,team1_score,team2_score,overtime_periods,home_side,venue_name,venue_city&year=lte.1926&order=year,game_no", gameRow), []),
  ]);
  return { series, finals, games };
});

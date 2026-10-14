import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import { standingRows, teamSeasonRows } from "./api/teamSeasons";
import { franchiseNameSchema } from "./api/schemas";
import { abbrFor } from "./abbr";
import { buildAllTime } from "./allTime";
import { getAbbrs } from "./data";

const int = z.number(), intN = z.number().nullable();
const standSchema = z.object({ year: int, franchise_id: int, team: z.string().nullable(), gp: intN, w: intN, l: intN, t: intN, otl: intN, pf: intN, pa: intN });
const gameSchema = z.object({ year: int, away_f: intN, home_f: intN, away_score: intN, home_score: intN });
const champSchema = z.object({ year: int, franchise_id: int });

/**
 * Every franchise of a league added up: four list requests (the league's team seasons, its playoff games, its title
 * seasons and the franchise names), each kept a day by the API client. Same rows the team pages add up.
 */
export const getAllTime = cache(async (lg: string) => {
  const q = `league=eq.${lg}`;
  const [stand, games, champs, names, abbrs] = await Promise.all([
    standingRows(`${q}&select=year,franchise_id,team,gp,w,l,t,otl,pf,pa&order=year,franchise_id`, standSchema),
    rows("games", `${q}&phase=eq.playoffs&select=year,away_f,home_f,away_score,home_score&order=game_id`, gameSchema),
    teamSeasonRows(`${q}&champion=is.true&select=year,franchise_id&order=year`, champSchema),
    rows("franchise_names", `${q}&select=*&order=franchise_id,name_from`, franchiseNameSchema),
    getAbbrs(lg),
  ]);
  return buildAllTime({
    stand, games, champs, names,
    abbr: (f, year, name) => abbrFor(abbrs, f, year, name),
  });
});

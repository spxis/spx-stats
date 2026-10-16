import "server-only";
import { cache } from "react";
import { z } from "zod";
import { ApiError, rows } from "./api/client";
import { pairPath } from "./h2h";
import type { HeatCell, HeatOpp, OpponentHeatView } from "./opponentHeat";
import { getLeagueClubs, getPaths } from "./teamSlugs";

/**
 * The reads behind a team page's record-against-each-opponent heat map: one franchise's rows of api.team_opponent_season (migration 125), one row
 * per opponent, season and part of the season, added up by the database. Until that migration is on the database the view answers 4xx: then there
 * is no view and the route says so (the section shows its "Couldn't load" note).
 */
const schema = z.object({
  league: z.string(), year: z.number(), franchise_id: z.number(), opponent_franchise_id: z.number(), phase: z.string(),
  gp: z.number(), w: z.number(), l: z.number(), t: z.number(), otl: z.number(), pf: z.number(), pa: z.number(),
});

const getRows = cache(async (f: number) =>
  rows("team_opponent_season", `franchise_id=eq.${f}&select=league,year,franchise_id,opponent_franchise_id,phase,gp,w,l,t,otl,pf,pa&order=league,opponent_franchise_id,year,phase`, schema));

/** The heat map's data for a franchise; null when the view is missing (4xx) or the club has no finished games. A busy database throws an ApiError. */
export async function opponentHeatView(lg: string, f: number): Promise<OpponentHeatView | null> {
  let list;
  try {
    list = await getRows(f);
  } catch (e) {
    if (e instanceof ApiError && e.status != null && e.status >= 400 && e.status < 500) return null;
    throw e;
  }
  if (!list.length) return null;
  // The page's league first, then the others in the order they appear.
  const leagues = [...new Set(list.map((r) => r.league))].sort((a, b) => Number(b === lg) - Number(a === lg));
  const [paths, ...clubs] = await Promise.all([getPaths(), ...leagues.map((l) => getLeagueClubs(l))]);
  const names = new Map(leagues.map((l, i) => [l, new Map(clubs[i].map((c) => [c.f, c.name]))]));
  const opps: HeatOpp[] = [];
  const at = new Map<string, number>();
  const cells: HeatCell[] = [];
  for (const r of list) {
    if (r.phase !== "regular" && r.phase !== "playoffs") continue;
    const key = `${r.league}:${r.opponent_franchise_id}`;
    let i = at.get(key);
    if (i === undefined) {
      i = opps.length;
      at.set(key, i);
      opps.push({
        f: r.opponent_franchise_id, lg: r.league, name: names.get(r.league)?.get(r.opponent_franchise_id) ?? null,
        href: paths.team(r.league, r.opponent_franchise_id), pair: pairPath(paths, r.league, f, r.opponent_franchise_id).path,
      });
    }
    cells.push([i, r.year, r.phase === "playoffs" ? 1 : 0, r.gp, r.w, r.l, r.t, r.otl, r.pf, r.pa]);
  }
  return cells.length ? { lg, leagues, opps, cells } : null;
}

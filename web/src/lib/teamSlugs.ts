import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import { buildSlugs, makePaths, parsePair, resolveFranchise, resolveTeamSeason, tableOf } from "./slug";

const nameRow = z.object({ league: z.string(), franchise_id: z.number(), name: z.string(), name_from: z.string().nullable(), name_to: z.string().nullable() });
const seasonRow = z.object({ league: z.string(), year: z.number(), franchise_id: z.number(), team: z.string().nullable() });

/** Every league's team addresses, built from the franchise names and each season's team name (kept an hour like the rest). */
export const getSlugs = cache(async () => {
  const [names, seasons] = await Promise.all([
    rows("franchise_names", "select=league,franchise_id,name,name_from,name_to&order=league,franchise_id,name_from", nameRow),
    rows("team_seasons", "select=league,year,franchise_id,team&order=league,year,franchise_id", seasonRow),
  ]);
  return buildSlugs(names, seasons);
});

/** Address builders for server code: `paths.team(lg, f)`, `paths.teamSeason(lg, f, year)`. */
export const getPaths = cache(async () => makePaths(tableOf(await getSlugs())));

/** The franchise a team address means and the address it should have; null when there is no such team. */
export async function teamOf(lg: string, seg: string): Promise<{ f: number; path: string } | null> {
  const [slugs, paths] = await Promise.all([getSlugs(), getPaths()]);
  const f = resolveFranchise(slugs.leagues[lg], seg);
  return f == null ? null : { f, path: paths.team(lg, f) };
}

/** The same for a team's season: the franchise, and the address that season's name gives it. */
export async function teamSeasonOf(lg: string, y: number, seg: string): Promise<{ f: number; path: string } | null> {
  const [slugs, paths] = await Promise.all([getSlugs(), getPaths()]);
  const f = resolveTeamSeason(slugs.leagues[lg], y, seg);
  return f == null ? null : { f, path: paths.teamSeason(lg, f, y) };
}

/** The two franchises of a series address and its meeting number; null when either team is unknown. */
export async function pairOf(lg: string, y: number, seg: string): Promise<{ a: number; b: number; meeting: number } | null> {
  const p = parsePair(seg);
  if (!p) return null;
  const L = (await getSlugs()).leagues[lg];
  const a = resolveTeamSeason(L, y, p.a), b = resolveTeamSeason(L, y, p.b);
  return a == null || b == null || a === b ? null : { a, b, meeting: p.meeting };
}

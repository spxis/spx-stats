import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import { teamSeasonRows } from "./api/teamSeasons";
import { comparePath } from "./compare";
import { pairPath, parseH2hSegment } from "./h2h";
import { buildSlugs, franchiseNamed, makePaths, parsePair, resolveFranchise, resolveTeamSeason, tableOf } from "./slug";

const nameRow = z.object({ league: z.string(), franchise_id: z.number(), name: z.string(), name_from: z.string().nullable(), name_to: z.string().nullable() });
const seasonRow = z.object({ league: z.string(), year: z.number(), franchise_id: z.number(), team: z.string().nullable() });

/** Every league's team addresses, built from the franchise names and each season's team name (kept an hour like the rest). */
export const getSlugs = cache(async () => {
  const [names, seasons] = await Promise.all([
    rows("franchise_names", "select=league,franchise_id,name,name_from,name_to&order=league,franchise_id,name_from", nameRow),
    teamSeasonRows("select=league,year,franchise_id,team&order=league,year,franchise_id", seasonRow),
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

/** The franchise that has worn a club name in a league (a champion the database holds by name only); null when none has. */
export async function franchiseOfName(lg: string, name: string | null | undefined): Promise<number | null> {
  return franchiseNamed((await getSlugs()).leagues[lg], name);
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

/** The two franchises of a head-to-head address (in alphabetical order) and the address that pair should have; null when either is unknown. */
export async function h2hOf(lg: string, seg: string): Promise<{ a: number; b: number; path: string } | null> {
  const p = parseH2hSegment(seg);
  if (!p) return null;
  const [slugs, paths] = await Promise.all([getSlugs(), getPaths()]);
  const L = slugs.leagues[lg];
  const x = resolveFranchise(L, p.a), y = resolveFranchise(L, p.b);
  return x == null || y == null || x === y ? null : pairPath(paths, lg, x, y);
}

/** The two franchises of a comparison address (in alphabetical order) and the address that comparison should have; null when either is unknown. */
export async function compareOf(lg: string, seg: string): Promise<{ a: number; b: number; path: string } | null> {
  const p = parseH2hSegment(seg);
  if (!p) return null;
  const [slugs, paths] = await Promise.all([getSlugs(), getPaths()]);
  const L = slugs.leagues[lg];
  const x = resolveFranchise(L, p.a), y = resolveFranchise(L, p.b);
  return x == null || y == null || x === y ? null : comparePath(paths, lg, x, y);
}

export interface Club { f: number; name: string; alt: string[]; first: number; last: number; active: boolean }

/** A league's franchises with a season on record, for the opponent picker: the clubs still playing first, then the former ones, each by name. */
export async function getLeagueClubs(lg: string): Promise<Club[]> {
  const L = (await getSlugs()).leagues[lg];
  if (!L) return [];
  const all = [...L.clubs].filter(([, c]) => c.last > 0);
  const latest = Math.max(0, ...all.map(([, c]) => c.last));
  return all
    .map(([f, c]) => ({ f, ...c, active: c.last === latest }))
    .sort((x, y) => Number(y.active) - Number(x.active) || x.name.localeCompare(y.name));
}

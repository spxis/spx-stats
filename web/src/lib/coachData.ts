import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import { teamSeasonRows } from "./api/teamSeasons";
import { brandFor, teamTone } from "./brand";
import { getBrands } from "./data";
import type { CoachLeague } from "./coachWire";
import { buildCareers, type Rec, type StaffRow } from "./coachMoves";
import { LEAGUES } from "./leagues";

const LEAGUE_CODES = LEAGUES.map((l) => l.code);   // staff are kept for the leagues of the menu
import { getPlayerPaths } from "./playerLinks";
import { getPaths } from "./teamSlugs";

const staffSchema = z.object({ person_id: z.number(), name: z.string(), kind: z.string(), franchise_id: z.number(), year: z.number(), first_on: z.string().nullable() });
const seasonSchema = z.object({ year: z.number(), franchise_id: z.number(), team: z.string().nullable(), w: z.number().nullable(), l: z.number().nullable(), t: z.number().nullable(), otl: z.number().nullable() });
const idSchema = z.object({ person_id: z.number() });
const CHUNK = 150;

export type { CoachLeague } from "./coachWire";

/**
 * The head coaches of one league who held the job with two or more franchises (api.team_season_staff and api.team_seasons, both
 * kept a day). A coach has a page of his own only if he played; the others have none, and their bands go to the club instead.
 */
export const getCoachLeague = cache(async (lg: string): Promise<CoachLeague | null> => {
  if (!LEAGUE_CODES.some((c) => c === lg)) return null;
  const [brands, paths, playerPath] = await Promise.all([getBrands(), getPaths(), getPlayerPaths()]);
  const [staff, seasons] = await Promise.all([
    rows("team_season_staff", `league=eq.${lg}&role=eq.head_coach&select=person_id,name,kind,franchise_id,year,first_on&order=person_id,year,first_on,franchise_id`, staffSchema),
    teamSeasonRows(`league=eq.${lg}&select=year,franchise_id,team,w,l,t,otl`, seasonSchema),
  ]);
  const names: string[] = [""];
  const nameAt = new Map<string, number>();
  const results = new Map<string, Rec>();
  const index = new Map<string, number>([["", 0]]);
  for (const s of seasons) {
    results.set(`${s.franchise_id}:${s.year}`, { w: s.w ?? 0, l: s.l ?? 0, t: s.t ?? 0, otl: s.otl ?? 0 });
    const team = s.team ?? "";
    if (!index.has(team)) { index.set(team, names.length); names.push(team); }
    nameAt.set(`${s.franchise_id}:${s.year}`, index.get(team)!);
  }
  // A club's name in a season the archive has no team season for (the season under way, say): that of the nearest season it has.
  const years = new Map<number, number[]>();
  for (const s of seasons) years.set(s.franchise_id, [...(years.get(s.franchise_id) ?? []), s.year]);
  const nameIndex = (f: number, y: number) => {
    const exact = nameAt.get(`${f}:${y}`);
    if (exact != null) return exact;
    const near = (years.get(f) ?? []).sort((a, b) => Math.abs(a - y) - Math.abs(b - y) || b - a)[0];
    return near == null ? 0 : nameAt.get(`${f}:${near}`) ?? 0;
  };
  const careers = buildCareers(staff as StaffRow[], results, nameIndex, () => null);

  // Which of them have a page: those who played and are in the players list.
  const kind = new Map(staff.map((s) => [s.person_id, s.kind]));
  const ids = careers.filter((c) => kind.get(c.id) === "player").map((c) => c.id);
  const known = new Set<number>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    for (const r of await rows("player_index", `person_id=in.(${ids.slice(i, i + CHUNK).join(",")})&select=person_id`, idSchema)) known.add(r.person_id);
  }
  for (const c of careers) c.href = known.has(c.id) ? playerPath(c.id, c.name, lg) : null;

  const clubs: CoachLeague["clubs"] = {};
  for (const c of careers) for (const s of c.stints) clubs[s.f] ??= { href: paths.team(lg, s.f), tone: teamTone(brandFor(brands, s.f)) };
  return { names, clubs, careers };
});

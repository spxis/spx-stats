import "server-only";
import { cache } from "react";
import { z } from "zod";
import { teamSeasonRows } from "./api/teamSeasons";
import { OUTSIDE_CONFERENCE, type LeagueCode } from "./leagues";

/** The leagues that also file outside opponents (see OUTSIDE_CONFERENCE), each with the name of its pseudo conference. */
const WITH_OUTSIDERS = Object.entries(OUTSIDE_CONFERENCE) as [LeagueCode, string][];

/**
 * The franchises of a league that are teams of it: those with a team season in a real conference. An outside opponent (an FCS team that played
 * a college football team of the division) has team seasons only in the pseudo conference, so it is not here. A program that moved up (Liberty) is
 * a member from the start of its archive: its earlier seasons stay on its page. null for a league that has no outsiders, so nothing is filtered.
 */
export const getMembers = cache(async (lg: string): Promise<ReadonlySet<number> | null> => {
  const pseudo = OUTSIDE_CONFERENCE[lg as LeagueCode];
  if (!pseudo) return null;
  const all = await teamSeasonRows(`league=eq.${lg}&conference=neq.${encodeURIComponent(pseudo)}&select=franchise_id`, z.object({ franchise_id: z.number() }));
  return new Set(all.map((r) => r.franchise_id));
});

/** Every league with outsiders and its members, for a list that spans leagues (the teams list, the search, the sitemap). */
export const getAllMembers = cache(async (): Promise<ReadonlyMap<string, ReadonlySet<number>>> =>
  new Map(await Promise.all(WITH_OUTSIDERS.map(async ([lg]) => [lg, (await getMembers(lg)) ?? new Set<number>()] as const))));

/** Whether a row of a list of teams of any league is a team of its league: a team of a league with no outsiders always is. */
export const isMemberRow = (members: ReadonlyMap<string, ReadonlySet<number>>, league: string, franchise: number): boolean =>
  members.get(league)?.has(franchise) ?? !members.has(league);

/** The PostgREST filter that keeps a league's members and every other league's rows, for a read of api.team_index. Empty when no league has outsiders. */
export async function memberFilter(): Promise<string> {
  const all = await getAllMembers();
  if (!all.size) return "";
  const parts = [...all].map(([lg, ids]) => `and(league.eq.${lg},franchise_id.in.(${[...ids].sort((a, b) => a - b).join(",")}))`);
  const others = `league.not.in.(${[...all.keys()].join(",")})`;
  return `or=(${others},${parts.join(",")})`;
}

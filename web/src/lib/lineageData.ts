import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import { teamSeasonRows } from "./api/teamSeasons";
import { buildFranchises } from "./lineage";
import { getMembers } from "./leagueMembers";
import { LEAGUES } from "./leagues";
import type { LineageLeague } from "./lineageWire";
import { getPaths } from "./teamSlugs";

const seasonSchema = z.object({
  league: z.string(), year: z.number(), franchise_id: z.number(), team: z.string().nullable(),
  w: z.number().nullable(), l: z.number().nullable(), t: z.number().nullable(), otl: z.number().nullable(), champion: z.boolean().nullable(),
});
const indexSchema = z.object({
  league: z.string(), franchise_id: z.number(), first_season: z.number().nullable(), last_season: z.number().nullable(),
  seasons: z.number(), titles: z.number(), active: z.boolean(),
});

/** One league's franchises with their stretches under one name, from the team seasons and the team index (both kept a day). */
export const getLineageLeague = cache(async (lg: string): Promise<LineageLeague | null> => {
  if (!LEAGUES.some((l) => l.code === lg)) return null;
  const [allSeasons, allIndex, paths, members] = await Promise.all([
    teamSeasonRows(`league=eq.${lg}&select=league,year,franchise_id,team,w,l,t,otl,champion&order=franchise_id,year`, seasonSchema),
    rows("team_index", `league=eq.${lg}&select=league,franchise_id,first_season,last_season,seasons,titles,active&order=franchise_id`, indexSchema),
    getPaths(),
    getMembers(lg),
  ]);
  const isMember = (f: number) => members == null || members.has(f);
  const seasons = allSeasons.filter((s) => isMember(s.franchise_id));
  const index = allIndex.filter((i) => isMember(i.franchise_id));
  const franchises = buildFranchises(seasons, index, paths.team);
  // Franchises with no season in the archive (the six Stanley Cup challengers, for one) are left out of the diagram.
  return { franchises, omitted: index.length - franchises.length };
});

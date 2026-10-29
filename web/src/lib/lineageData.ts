import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import { teamSeasonRows } from "./api/teamSeasons";
import { buildFranchises, type Franchise } from "./lineage";
import { getAllMembers, isMemberRow } from "./leagueMembers";
import { getPaths } from "./teamSlugs";

const seasonSchema = z.object({
  league: z.string(), year: z.number(), franchise_id: z.number(), team: z.string().nullable(),
  w: z.number().nullable(), l: z.number().nullable(), t: z.number().nullable(), otl: z.number().nullable(), champion: z.boolean().nullable(),
});
const indexSchema = z.object({
  league: z.string(), franchise_id: z.number(), first_season: z.number().nullable(), last_season: z.number().nullable(),
  seasons: z.number(), titles: z.number(), active: z.boolean(),
});

export interface LineageData {
  franchises: Franchise[];
  /** Franchises with no season in the archive, by league (the six Stanley Cup challengers, for one): left out of the diagram. */
  omitted: Record<string, number>;
}

/** Every franchise with its stretches under one name, from the team seasons and the team index (both kept a day). */
export const getLineage = cache(async (): Promise<LineageData> => {
  const [allSeasons, allIndex, paths, members] = await Promise.all([
    teamSeasonRows("select=league,year,franchise_id,team,w,l,t,otl,champion&order=league,franchise_id,year", seasonSchema),
    rows("team_index", "select=league,franchise_id,first_season,last_season,seasons,titles,active&order=league,franchise_id", indexSchema),
    getPaths(),
    getAllMembers(),
  ]);
  const seasons = allSeasons.filter((s) => isMemberRow(members, s.league, s.franchise_id));
  const index = allIndex.filter((i) => isMemberRow(members, i.league, i.franchise_id));
  const franchises = buildFranchises(seasons, index, paths.team);
  const kept = new Set(franchises.map((f) => `${f.league}|${f.f}`));
  const omitted: Record<string, number> = {};
  for (const i of index) if (!kept.has(`${i.league}|${i.franchise_id}`)) omitted[i.league] = (omitted[i.league] ?? 0) + 1;
  return { franchises, omitted };
});

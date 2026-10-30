import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows, viewMissing } from "./api/client";
import { namePackSchema, nameRowsFromPack, type NamePackRow } from "./namePack";

const nameRow = z.object({ league: z.string(), franchise_id: z.number(), name: z.string(), name_from: z.string().nullable(), name_to: z.string().nullable() });
export type FranchiseNameRow = z.infer<typeof nameRow>;

/**
 * Every club's names and runs of seasons under one name (api.franchise_name_pack, migration 177: one request), shared by everything that reads them in
 * a page. Null while the view is a 404; the readers below then ask for api.franchise_names and api.team_season_name_run as they did before.
 */
export const getNamePack = cache(async (): Promise<NamePackRow[] | null> => {
  try {
    return await rows("franchise_name_pack", "select=league,franchise_id,names,runs&order=league,franchise_id", namePackSchema);
  } catch (e) {
    if (viewMissing(e)) return null;
    throw e;
  }
});

/**
 * Every name every franchise of every league has worn, in one read that the address table (teamSlugs.ts) and the venue pages
 * (venueMap.ts) share. The venue list used to read the table again for each league, eleven requests.
 */
export const getFranchiseNameRows = cache(async (): Promise<FranchiseNameRow[]> => {
  const pack = await getNamePack();
  if (pack) return nameRowsFromPack(pack).map((r) => nameRow.parse(r));
  return rows("franchise_names", "select=league,franchise_id,name,name_from,name_to&order=league,franchise_id,name_from", nameRow);
});

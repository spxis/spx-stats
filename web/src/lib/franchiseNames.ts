import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";

const nameRow = z.object({ league: z.string(), franchise_id: z.number(), name: z.string(), name_from: z.string().nullable(), name_to: z.string().nullable() });
export type FranchiseNameRow = z.infer<typeof nameRow>;

/**
 * Every name every franchise of every league has worn (api.franchise_names), in one read that the address table (teamSlugs.ts) and the venue pages
 * (venueMap.ts) share. The venue list used to read the table again for each league, eleven requests.
 */
export const getFranchiseNameRows = cache(async (): Promise<FranchiseNameRow[]> =>
  rows("franchise_names", "select=league,franchise_id,name,name_from,name_to&order=league,franchise_id,name_from", nameRow));

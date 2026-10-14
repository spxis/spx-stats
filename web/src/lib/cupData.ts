import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import type { CupFinalist, CupTitle } from "./cup";

const titleRow = z.object({
  year: z.number(), team: z.string(), league: z.string().nullable(), club: z.string(), franchise: z.number().nullable(), city: z.string().nullable(), wins: z.number(),
});

/**
 * Every Stanley Cup title won outside an NHL season (api.cup_title, migration 087). Until that view is on the server, or if a read fails,
 * this is an empty list: the pages simply show no title before the NHL instead of failing.
 */
export const getCupTitles = cache(async (): Promise<CupTitle[]> => {
  try {
    return await rows("cup_title", "select=year,team,league,club,franchise,city,wins&order=year,club", titleRow);
  } catch {
    return [];
  }
});

const finalistRow = z.object({ year: z.number(), team: z.string(), league: z.string().nullable(), club: z.string(), franchise: z.number().nullable(), city: z.string().nullable() });

/** The clubs that lost a final outside an NHL season (api.cup_finalist), or an empty list while the view is not on the server. */
export const getCupFinalists = cache(async (): Promise<CupFinalist[]> => {
  try {
    return await rows("cup_finalist", "select=year,team,league,club,franchise,city&order=year,club", finalistRow);
  } catch {
    return [];
  }
});

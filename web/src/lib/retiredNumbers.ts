import "server-only";
import { cache } from "react";
import { z } from "zod";
import { ApiError, rows as readRows } from "./api/client";

const retiredSchema = z.object({
  retired_number_id: z.number(),
  league: z.string(),
  franchise_id: z.number().nullable(),
  jersey_number: z.number(),
  person_id: z.number().nullable(),
  name: z.string().nullable(),
  honor_name: z.string().nullable(),
  retired_on: z.string().nullable(),
  tenure_text: z.string().nullable(),
  league_wide: z.boolean(),
  source: z.string().nullable(),
});
export type RetiredNumber = z.infer<typeof retiredSchema>;

/**
 * Retired numbers for a franchise, plus league-wide retirements of that league.
 * Empty when the view is missing (migration 130 not on that database) or there are none.
 * A transient failure still throws so a kept page keeps its last good copy.
 */
export const getRetiredNumbers = cache(async (lg: string, f: number): Promise<RetiredNumber[]> => {
  try {
    const list = await readRows(
      "retired_number",
      `or=(franchise_id.eq.${f},and(league.eq.${lg},franchise_id.is.null))&select=*&order=jersey_number,name`,
      retiredSchema,
    );
    return list
      .filter((r) => r.league === lg && (r.franchise_id === f || r.franchise_id == null))
      .sort((a, b) => (a.retired_on ? 0 : 1) - (b.retired_on ? 0 : 1) || (a.retired_on ?? "").localeCompare(b.retired_on ?? "") || a.jersey_number - b.jersey_number);
  } catch (e) {
    if (e instanceof ApiError && e.status != null && e.status >= 400 && e.status < 500) return [];
    throw e;
  }
});

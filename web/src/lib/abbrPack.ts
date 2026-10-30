import { z } from "zod";
import type { TeamAbbrRow } from "./api/types.ts";

/** The rows of one league of api.team_abbr as api.team_abbr_pack gives them (migration 187): parallel arrays instead of a row with its column names for each era. */
const strN = z.string().nullable();

export const abbrPackSchema = z.object({
  league: z.string(), franchise_id: z.array(z.number()), valid_from: z.array(strN), valid_to: z.array(strN), abbreviation: z.array(z.string()),
});
export type AbbrPack = z.infer<typeof abbrPackSchema>;

/** The rows of api.team_abbr of the league ordered by franchise_id, valid_from (none first), valid_to and abbreviation. */
export function abbrsFromPack(p: AbbrPack): TeamAbbrRow[] {
  const n = p.franchise_id.length;
  if ([p.valid_from, p.valid_to, p.abbreviation].some((c) => c.length !== n)) throw new Error(`team_abbr_pack: the ${p.league} columns are not the same length`);
  return p.franchise_id.map((f, i) => ({ league: p.league, franchise_id: f, valid_from: p.valid_from[i]!, valid_to: p.valid_to[i]!, abbreviation: p.abbreviation[i]! }));
}

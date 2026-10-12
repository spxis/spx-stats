import { z } from "zod";

/** One row of `api.team_index` (db/migrations/037_team_index.sql), the teams list: a franchise in a league. */
export const teamIndexSchema = z.object({
  league: z.string(),
  franchise_id: z.number(),
  name: z.string(),
  former_names: z.array(z.string()),
  first_season: z.number().nullable(),
  last_season: z.number().nullable(),
  seasons: z.number(),
  titles: z.number(),
  share: z.number().nullable(),
  active: z.boolean(),
});
export type TeamIndexRow = z.infer<typeof teamIndexSchema>;

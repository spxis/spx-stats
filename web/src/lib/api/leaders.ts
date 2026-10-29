import { z } from "zod";
import { standingSchema } from "./schemas";

/** The columns of a standings row that team leaders are worked out from. */
export const leaderStandingSchema = standingSchema.pick({
  year: true, team_id: true, franchise_id: true, team: true, gp: true, w: true, l: true, t: true, otl: true, pts: true, pf: true, pa: true, conference: true,
});
export type LeaderStanding = z.infer<typeof leaderStandingSchema>;

/** One club-season of one player, with its counting stats. */
export const leaderStatSchema = z.object({
  person_id: z.number(), franchise_id: z.number(), stat_group: z.string(), stats: z.record(z.string(), z.number()),
});
export type LeaderStat = z.infer<typeof leaderStatSchema>;

export const personNameSchema = z.object({ person_id: z.number(), name: z.string() });

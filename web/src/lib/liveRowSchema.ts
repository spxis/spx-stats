import { z } from "zod";
import { LIVE_STATES, type LiveRow, type LiveSource } from "./liveScores.ts";

/** Reads a `live_score` row from Turso. Apart from liveScores.ts, which a Client Component imports, so zod stays out of the browser. */
const flag = z.number().int().transform((n) => n !== 0);
const maybe = z.number().int().nullable();

export const liveRowSchema = z.object({
  game_id: z.number().int(),
  status: z.enum(LIVE_STATES),
  home_score: maybe,
  away_score: maybe,
  overtime: maybe.transform((n) => (n === null ? null : n !== 0)),
  period: z.string().nullable(),
  disputed: flag,
  ready: flag,
  n_sources: z.number().int(),
  n_agree: z.number().int(),
  confirm_agree: z.number().int(),
  confirm_differ: z.number().int(),
  sources: z.string().transform((s, ctx): LiveSource[] => {
    try {
      return z.array(z.object({ s: z.string(), h: z.number().int(), a: z.number().int(), at: z.string() })).parse(JSON.parse(s));
    } catch {
      ctx.addIssue({ code: "custom", message: "sources" });
      return z.NEVER;
    }
  }),
  fetched_at: z.string(),
}) satisfies z.ZodType<LiveRow, unknown>;

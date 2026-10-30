import { z } from "zod";
import type { PlayoffTotals } from "./allTime.ts";

/**
 * The playoff record of each franchise of one league as api.playoff_franchise_pack gives it (migration 188): 8 numbers each in one flat list (franchise_id, games,
 * wins, losses, ties, for, against, seasons played). The all-time page adds these up from the league's playoff games otherwise (5,123 games, 6 requests, in the NHL).
 */
const NUMBERS = 8;

export const playoffPackSchema = z.object({ league: z.string(), franchises: z.array(z.number()) });
export type PlayoffPack = z.infer<typeof playoffPackSchema>;

/** The franchises' records, ordered by franchise_id. */
export function playoffTotalsFromPack(p: PlayoffPack): PlayoffTotals[] {
  const s = p.franchises;
  if (s.length % NUMBERS) throw new Error(`playoff_franchise_pack: ${p.league} holds ${s.length} numbers, not a whole number of franchises`);
  const out: PlayoffTotals[] = [];
  for (let i = 0; i < s.length; i += NUMBERS) {
    out.push({ f: s[i]!, gp: s[i + 1]!, w: s[i + 2]!, l: s[i + 3]!, t: s[i + 4]!, pf: s[i + 5]!, pa: s[i + 6]!, years: s[i + 7]! });
  }
  return out;
}

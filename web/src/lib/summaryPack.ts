import { z } from "zod";
import type { SeasonSummaryRow } from "./api/types.ts";

/** Every season of api.season_summary, a league to a row, as api.season_summary_pack gives them (migration 178): the rows without their column names repeated. */
const strN = z.string().nullable();
const numN = z.number().nullable();

export const summaryPackSchema = z.object({
  league: z.string(),
  seasons: z.array(z.tuple([z.number(), z.string(), z.number(), z.number(), z.number(), z.number(), strN, strN, strN, numN])),
});
export type SummaryPackRow = z.infer<typeof summaryPackSchema>;

/** The rows of api.season_summary by league and year. */
export function summaryRowsFromPack(packs: readonly SummaryPackRow[]): SeasonSummaryRow[] {
  const out: SeasonSummaryRow[] = [];
  for (const p of packs) {
    for (const s of p.seasons) {
      out.push({
        league: p.league, year: s[0], label: s[1], games: s[2], finals: s[3], playoff_finals: s[4], teams: s[5],
        champion: s[6], champion_note: s[7], champion_source: s[8], champion_franchise: s[9],
      });
    }
  }
  return out;
}

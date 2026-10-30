import { z } from "zod";
import type { AlignmentRow } from "./alignment.ts";

/**
 * The rows of one league of api.alignment as api.alignment_pack gives them (migration 184): six numbers for each club season in one flat list, with the
 * conference, division and club names once. Read in one request instead of one a thousand rows.
 */
const NUMBERS = 6;
const strs = z.array(z.string().nullable());

export const alignmentPackSchema = z.object({
  league: z.string(), conferences: strs, conference_shorts: strs, divisions: strs, division_shorts: strs, teams: z.array(z.string()), seasons: z.array(z.number().nullable()),
});
export type AlignmentPack = z.infer<typeof alignmentPackSchema>;

/** The rows of api.alignment of the league ordered by year, conference, division, team and team_id. */
export function alignmentFromPack(p: AlignmentPack): AlignmentRow[] {
  const s = p.seasons;
  if (s.length % NUMBERS) throw new Error(`alignment_pack: ${p.league} holds ${s.length} numbers, not a whole number of rows`);
  const at = <T>(list: readonly T[], i: number | null, what: string): T | null => {
    if (i == null) return null;
    if (i >= list.length) throw new Error(`alignment_pack: ${p.league} points at ${what} ${i}, which is not there`);
    return list[i]!;
  };
  const out: AlignmentRow[] = [];
  for (let i = 0; i < s.length; i += NUMBERS) {
    out.push({
      league: p.league, year: s[i]!, conference: at(p.conferences, s[i + 1]!, "conference"), division: at(p.divisions, s[i + 2]!, "division"), franchise_id: s[i + 3]!,
      team: at(p.teams, s[i + 4]!, "club name"), conference_short: at(p.conference_shorts, s[i + 1]!, "conference"), division_short: at(p.division_shorts, s[i + 2]!, "division"),
      team_id: s[i + 5]!,
    });
  }
  return out;
}

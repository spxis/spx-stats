import { z } from "zod";

/**
 * The winners of one league of api.awards as api.award_league_pack gives them (migration 183): parallel arrays, each award's code, name and kind once, and the
 * winners counted by source. Read in one request instead of one a thousand rows.
 */
const strN = z.string().nullable();
const intN = z.number().nullable();

export const awardPackSchema = z.object({
  league: z.string(), dict_code: z.array(z.string()), dict_award: z.array(z.string()), dict_kind: z.array(strN),
  year: z.array(z.number()), dict: z.array(z.number()), winner: z.array(strN), note: z.array(strN), franchise_id: z.array(intN), person_id: z.array(intN),
  source_name: z.array(strN), source_count: z.array(z.number()),
});
export type AwardPack = z.infer<typeof awardPackSchema>;

/** Only the counts of winners by source of a league's pack. */
export const awardSourceSchema = awardPackSchema.pick({ league: true, source_name: true, source_count: true });
export type AwardSources = z.infer<typeof awardSourceSchema>;

/** The columns of api.awards that the trophy pages and the awards tables take. */
export interface PackedAward {
  year: number; award_code: string; award: string; kind: string | null; winner: string | null; note: string | null; franchise_id: number | null; person_id: number | null;
}

/** The winners of the league, newest season first then by award_code, winner, source, franchise_id, person_id and note: the order of the reads. */
export function awardsFromPack(p: AwardPack): PackedAward[] {
  const n = p.year.length;
  if ([p.dict, p.winner, p.note, p.franchise_id, p.person_id].some((c) => c.length !== n)) throw new Error(`award_league_pack: the ${p.league} columns are not the same length`);
  const out: PackedAward[] = [];
  for (let i = 0; i < n; i++) {
    const d = p.dict[i]!;
    const code = p.dict_code[d], award = p.dict_award[d];
    if (code === undefined || award === undefined) throw new Error(`award_league_pack: ${p.league} points at award ${d}, which is not there`);
    out.push({ year: p.year[i]!, award_code: code, award, kind: p.dict_kind[d] ?? null, winner: p.winner[i]!, note: p.note[i]!, franchise_id: p.franchise_id[i]!, person_id: p.person_id[i]! });
  }
  return out;
}

/** How many winners each source has, over every league the packs cover. */
export function sourceCounts(packs: readonly AwardSources[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of packs) p.source_name.forEach((s, i) => out.set(s ?? "", (out.get(s ?? "") ?? 0) + (p.source_count[i] ?? 0)));
  return out;
}

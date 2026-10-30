import { z } from "zod";

/**
 * The rows of one league of api.standing_index as api.standing_league_pack gives them (migration 182): 13 numbers for each club season in one flat list, with
 * the club names and conferences once. Read in one request instead of the one a thousand rows the all-time, leaders and series pages each took.
 */
const NUMBERS = 13;

export const standingPackSchema = z.object({
  league: z.string(), teams: z.array(z.string()), conferences: z.array(z.string()), standings: z.array(z.number().nullable()),
});
export type StandingPack = z.infer<typeof standingPackSchema>;

/** The columns of api.standing_index that the pack holds. */
export interface PackedStanding {
  year: number; team_id: number; franchise_id: number; team: string | null;
  gp: number | null; w: number | null; l: number | null; t: number | null; otl: number | null; pts: number | null; pf: number | null; pa: number | null;
  conference: string | null;
}

/** The club seasons of the league ordered by year then team_id (the order of the leaders and series reads). */
export function standingsFromPack(p: StandingPack): PackedStanding[] {
  const s = p.standings;
  if (s.length % NUMBERS) throw new Error(`standing_league_pack: ${p.league} holds ${s.length} numbers, not a whole number of rows`);
  const name = (i: number | null) => {
    if (i == null) return null;
    const v = p.teams[i];
    if (v === undefined) throw new Error(`standing_league_pack: ${p.league} points at club name ${i}, which is not there`);
    return v;
  };
  const conf = (i: number | null) => {
    if (i == null) return null;
    const v = p.conferences[i];
    if (v === undefined) throw new Error(`standing_league_pack: ${p.league} points at conference ${i}, which is not there`);
    return v;
  };
  const out: PackedStanding[] = [];
  for (let i = 0; i < s.length; i += NUMBERS) {
    out.push({
      year: s[i]!, team_id: s[i + 1]!, franchise_id: s[i + 2]!, team: name(s[i + 3]!), gp: s[i + 4]!, w: s[i + 5]!, l: s[i + 6]!, t: s[i + 7]!, otl: s[i + 8]!,
      pts: s[i + 9]!, pf: s[i + 10]!, pa: s[i + 11]!, conference: conf(s[i + 12]!),
    });
  }
  return out;
}

/** The same rows ordered by year, franchise_id then team_id (the order of the all-time read). */
export const byFranchise = (list: readonly PackedStanding[]): PackedStanding[] =>
  [...list].sort((a, b) => a.year - b.year || a.franchise_id - b.franchise_id || a.team_id - b.team_id);

import "server-only";
import { cache } from "react";
import { z } from "zod";
import { ApiError, rows } from "./api/client";
import type { PhraseKey } from "./i18n/phrases.constants";

const schema = z.object({ franchise_id: z.number(), games_played: z.number().nullable(), stats: z.record(z.string(), z.number()) });

/** The season totals that rank under the season title, by league: the stat, whether a bigger number is better, and whether it counts games (so it is compared per game). */
const FIGURES: Record<string, { key: string; phrase: PhraseKey; higher: boolean; perGame: boolean }[]> = {
  nhl: [
    { key: "pp_pct", phrase: "tstat.pp_pct", higher: true, perGame: false },
    { key: "pk_pct", phrase: "tstat.pk_pct", higher: true, perGame: false },
    { key: "pim", phrase: "tstat.pim", higher: false, perGame: true },
  ],
  mlb: [
    { key: "avg", phrase: "tstat.avg", higher: true, perGame: false },
    { key: "era", phrase: "tstat.era", higher: false, perGame: false },
    { key: "hr", phrase: "tstat.hr", higher: true, perGame: true },
  ],
  nfl: [
    { key: "yds", phrase: "tstat.yds", higher: true, perGame: true },
    { key: "yds_against", phrase: "tstat.yds_against", higher: false, perGame: true },
  ],
};

export interface FigureRank {
  place: number;
  of: number;
  phrase: PhraseKey;
}

/** The club's rank (1 is best) in each season total the archive holds for its league; nothing when the league or the club has none. */
export const getFigureRanks = cache(async (lg: string, year: number, f: number): Promise<FigureRank[]> => {
  const figures = FIGURES[lg];
  if (!figures) return [];
  try {
    const all = await rows("team_season_stat", `league=eq.${lg}&year=eq.${year}&phase=eq.regular&select=franchise_id,games_played,stats`, schema);
    const out: FigureRank[] = [];
    for (const g of figures) {
      const value = (r: (typeof all)[number]): number | null => {
        const v = r.stats[g.key];
        return v == null ? null : g.perGame ? (r.games_played ? v / r.games_played : null) : v;
      };
      const mine = all.find((r) => r.franchise_id === f);
      const m = mine ? value(mine) : null;
      if (m == null) continue;
      const scored = all.map(value).filter((v): v is number => v != null);
      if (scored.length < 2) continue;
      out.push({ place: scored.filter((v) => (g.higher ? v > m : v < m)).length + 1, of: scored.length, phrase: g.phrase });
    }
    return out;
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return [];
  }
});

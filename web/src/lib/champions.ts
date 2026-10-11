import type { SeasonSummaryRow } from "./api/types";

/** Who holds a league's title: the latest season with a champion, and each season's champion. */
export function titleHolders(seasons: SeasonSummaryRow[], lg: string) {
  const list = seasons.filter((x) => x.league === lg && x.champion_franchise != null).sort((a, b) => a.year - b.year);
  return { reigning: list.at(-1) ?? null, byYear: new Map(list.map((x) => [x.year, x])) };
}

/** How many seasons in a row, ending at `year`, this franchise won the title. */
export function titleStreak(byYear: Map<number, SeasonSummaryRow>, franchise: number, year: number) {
  let n = 0;
  while (byYear.get(year - n)?.champion_franchise === franchise) n++;
  return n;
}

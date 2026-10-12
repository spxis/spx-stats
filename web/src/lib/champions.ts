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

/** How many of the latest champions the league page's row shows. */
export const RECENT_CHAMPIONS = 4;

export interface ChampionBox {
  kind: "recent" | "most" | "repeat";
  f: number;
  /** The season the box's team name and logo are taken from. */
  year: number;
  name: string;
  label: string;
  /** Titles won (most) or seasons in the run (repeat). */
  n: number;
  /** First season label of a repeat run. */
  from?: string;
}

/**
 * The boxes above a league's champions table: the latest champions, newest first; the franchise with the most titles
 * (when it has more than one); and the latest franchise to win in consecutive seasons, with its run.
 */
export function championRow(seasons: SeasonSummaryRow[], lg: string): ChampionBox[] {
  const { byYear } = titleHolders(seasons, lg);
  const years = [...byYear.keys()].sort((a, b) => b - a);
  const box = (kind: ChampionBox["kind"], x: SeasonSummaryRow, n: number, from?: string): ChampionBox =>
    ({ kind, f: x.champion_franchise!, year: x.year, name: x.champion ?? "", label: x.label, n, from });
  const out = years.slice(0, RECENT_CHAMPIONS).map((y) => box("recent", byYear.get(y)!, 1));
  const titles = new Map<number, number>();
  for (const x of byYear.values()) titles.set(x.champion_franchise!, (titles.get(x.champion_franchise!) ?? 0) + 1);
  const most = Math.max(0, ...titles.values());
  const lead = years.find((y) => titles.get(byYear.get(y)!.champion_franchise!) === most);
  if (most > 1 && lead != null) out.push(box("most", byYear.get(lead)!, most));
  const again = years.find((y) => titleStreak(byYear, byYear.get(y)!.champion_franchise!, y) > 1);
  if (again != null) {
    const x = byYear.get(again)!;
    const run = titleStreak(byYear, x.champion_franchise!, again);
    out.push(box("repeat", x, run, byYear.get(again - run + 1)!.label));
  }
  return out;
}

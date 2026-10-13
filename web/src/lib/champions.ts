import type { SeasonSummaryRow } from "./api/types.ts";
import { leagueSat } from "./noSeason.ts";

/**
 * The years a league did not play: a year inside its range with no season row, a row with no games, clubs or champion, and any
 * year `outageYears` names (the seasons api.season_outage explains). A season that was played but has no champion on record is
 * not one of them.
 */
export function satYears(seasons: SeasonSummaryRow[], lg: string, outageYears: Iterable<number> = []): Set<number> {
  const mine = seasons.filter((x) => x.league === lg);
  const out = new Set(outageYears);
  if (!mine.length) return out;
  for (const x of mine) if (leagueSat(x)) out.add(x.year);
  const have = new Set(mine.map((x) => x.year));
  for (let y = Math.min(...have) + 1; y < Math.max(...have); y++) if (!have.has(y)) out.add(y);
  return out;
}

/**
 * Who holds a league's title: the latest season with a champion, and each season's champion. `sat` are the years the league did
 * not play (see satYears); `before(year)` is the champion going into a year, which stays the last one crowned when the seasons in
 * between were not played, and is null when the season just before was played without a champion on record.
 */
export function titleHolders(seasons: SeasonSummaryRow[], lg: string, outageYears: Iterable<number> = []) {
  const list = seasons.filter((x) => x.league === lg && x.champion_franchise != null).sort((a, b) => a.year - b.year);
  const byYear = new Map(list.map((x) => [x.year, x]));
  const sat = satYears(seasons, lg, outageYears);
  const first = Math.min(...seasons.filter((x) => x.league === lg).map((x) => x.year), ...list.map((x) => x.year));
  const before = (year: number): SeasonSummaryRow | null => {
    for (let y = year - 1; y >= first; y--) {
      const s = byYear.get(y);
      if (s) return s;
      if (!sat.has(y)) return null;
    }
    return null;
  };
  return { reigning: list.at(-1) ?? null, byYear, sat, before };
}

/**
 * The seasons, newest first, in the run of titles this franchise won ending at `year`. Years the league did not play (`sat`) do
 * not break a run: a team that won before and after a lost season won twice in a row.
 */
export function titleRun(byYear: Map<number, SeasonSummaryRow>, franchise: number, year: number, sat: ReadonlySet<number> = new Set()): SeasonSummaryRow[] {
  const run: SeasonSummaryRow[] = [];
  const first = Math.min(...byYear.keys());
  for (let y = year; y >= first; y--) {
    const s = byYear.get(y);
    if (s?.champion_franchise === franchise) run.push(s);
    else if (!sat.has(y)) break;
  }
  return run;
}

/** How many seasons in a row, ending at `year`, this franchise won the title. */
export const titleStreak = (byYear: Map<number, SeasonSummaryRow>, franchise: number, year: number, sat: ReadonlySet<number> = new Set()) =>
  titleRun(byYear, franchise, year, sat).length;

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
export function championRow(seasons: SeasonSummaryRow[], lg: string, outageYears: Iterable<number> = []): ChampionBox[] {
  const { byYear, sat } = titleHolders(seasons, lg, outageYears);
  const years = [...byYear.keys()].sort((a, b) => b - a);
  const box = (kind: ChampionBox["kind"], x: SeasonSummaryRow, n: number, from?: string): ChampionBox =>
    ({ kind, f: x.champion_franchise!, year: x.year, name: x.champion ?? "", label: x.label, n, from });
  const out = years.slice(0, RECENT_CHAMPIONS).map((y) => box("recent", byYear.get(y)!, 1));
  const titles = new Map<number, number>();
  for (const x of byYear.values()) titles.set(x.champion_franchise!, (titles.get(x.champion_franchise!) ?? 0) + 1);
  const most = Math.max(0, ...titles.values());
  const lead = years.find((y) => titles.get(byYear.get(y)!.champion_franchise!) === most);
  if (most > 1 && lead != null) out.push(box("most", byYear.get(lead)!, most));
  const again = years.find((y) => titleStreak(byYear, byYear.get(y)!.champion_franchise!, y, sat) > 1);
  if (again != null) {
    const x = byYear.get(again)!;
    const run = titleRun(byYear, x.champion_franchise!, again, sat);
    out.push(box("repeat", x, run.length, run.at(-1)!.label));
  }
  return out;
}

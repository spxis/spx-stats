import { seasonLabel } from "./leagues.ts";

/** One square of the archive chart: a season of a league, shaded by how many of its games have a result. */
export interface HeatSeason {
  league: string; year: number; label: string; games: number; finals: number; share: number; champion: string | null;
}

/**
 * The seasons of the home archive chart as short plain data. Each season is six whole numbers (league, year, games, results, share in thousandths and the
 * champion's place in `n`, 0 for none), flat in one list in the order the chart was given. The page used to send an object with long field names for each of
 * them and draw every square as markup; now the squares are drawn in the browser and this is all the page carries.
 */
export interface HeatWire {
  /** The league codes, in order of first use. */
  lg: string[];
  /** The champions' names, each once. */
  n: string[];
  /** Six numbers a season. */
  r: number[];
  /** Labels that are not the league's own way of writing the year, keyed `league:year`. */
  l?: Record<string, string>;
}

const STRIDE = 6;

/** The label a league writes for a season, unless the data says otherwise (the soccer rows are plain years). */
const ownLabel = (league: string, year: number): string => (league === "soccer" || league === "mls" ? String(year) : seasonLabel(league, year));

export function packHeat(seasons: readonly HeatSeason[]): HeatWire {
  const lg: string[] = [], n: string[] = [], r: number[] = [];
  const league = new Map<string, number>(), champ = new Map<string, number>();
  let l: Record<string, string> | undefined;
  for (const s of seasons) {
    let li = league.get(s.league);
    if (li === undefined) { li = lg.length; lg.push(s.league); league.set(s.league, li); }
    let ci = 0;
    if (s.champion) {
      const at = champ.get(s.champion);
      if (at === undefined) { n.push(s.champion); champ.set(s.champion, n.length); ci = n.length; } else ci = at;
    }
    r.push(li, s.year, s.games, s.finals, Math.round(s.share * 1000), ci);
    if (s.label !== ownLabel(s.league, s.year)) (l ??= {})[`${s.league}:${s.year}`] = s.label;
  }
  return l ? { lg, n, r, l } : { lg, n, r };
}

export function unpackHeat(w: HeatWire): HeatSeason[] {
  const out: HeatSeason[] = [];
  for (let i = 0; i + STRIDE <= w.r.length; i += STRIDE) {
    const league = w.lg[w.r[i]], year = w.r[i + 1], c = w.r[i + 5];
    out.push({
      league, year, label: w.l?.[`${league}:${year}`] ?? ownLabel(league, year),
      games: w.r[i + 2], finals: w.r[i + 3], share: w.r[i + 4] / 1000, champion: c ? w.n[c - 1] : null,
    });
  }
  return out;
}

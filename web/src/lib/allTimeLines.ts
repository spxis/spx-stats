import { addLines, share, type AllTimePhase, type Franchise, type Line } from "./allTime.ts";
import type { PhraseKey } from "./i18n/phrases.constants.ts";
import type { SortValue } from "./sort.ts";

/**
 * A league's all-time table as plain data (no server code: the page, the route that serves every franchise and the table, bars and charts in the browser
 * agree on it). A franchise is one short line, so the page sends only the few the first screen shows and the rest come from `rows/all-time` when the
 * reader asks for them (components/AllTimeTable.tsx, AllTimeBars.tsx, AllTimeChartLazy.tsx).
 */

/** games, wins, losses, ties, overtime losses, points for, points against */
export type LineTuple = [number, number, number, number, number, number, number];

export interface AtLine {
  /** The franchise, its latest name and its abbreviation. */
  f: number;
  name: string;
  ab: string;
  /** Former names. */
  fm?: string[];
  /** First and last season (the year it starts), and 1 when the club still plays. */
  a: number;
  z: number;
  on?: 1;
  /** Seasons played, and the seasons it played a playoff game. */
  s: number;
  po: number;
  /** Regular season and playoff totals. */
  r: LineTuple;
  p: LineTuple;
  /** The seasons it won the title. */
  ti?: number[];
  /** Best and worst season as [year, win share]. */
  b?: [number, number];
  w?: [number, number];
  /** Mean win share of its last ten eligible seasons (what the trend column sorts by). */
  rc?: number;
  /** Win share (times 1000) for each year from `a` to `z`: -1 for a season too short to rate, -2 for a year it did not play. */
  g: number[];
  /** Place in the league's list of franchises by first season, then name: the order ties keep. */
  o: number;
  /** Its logo (a place in the list of logos that comes with the lines) and its colours for the light and dark page (hex without #). */
  lo?: number;
  tl?: string;
  td?: string;
}

/** A league's franchises as plain data, and the logos the lines point into. */
export interface AtList { lines: AtLine[]; logos: string[] }
/** A line with its logo address in place of the place in the list. */
export type AtRow = AtLine & { logo: string | null };

/** How many franchises the overview page itself carries. The rest are fetched when the reader asks for them (or sorts the table another way). */
export const AT_HEAD = 12;

export const allTimeRestPath = (league: string): string => `/${league}/rows/all-time`;

/** What a point is called in a league: goals, points or runs. */
export const UNIT = { nhl: "unit.goals", pwhl: "unit.goals", nba: "unit.points", wnba: "unit.points", mlb: "unit.runs", nfl: "unit.points", ncaaf: "unit.points", cfl: "unit.points", nwsl: "unit.goals", afl: "unit.points", aafc: "unit.points", nha: "unit.goals", pcha: "unit.goals", wchl: "unit.goals", wha: "unit.goals", ahl: "unit.goals", echl: "unit.goals", na: "unit.runs", aa: "unit.runs", ua: "unit.runs", pl: "unit.runs", fl: "unit.runs" } as const satisfies Record<string, PhraseKey>;

/** What the builder needs of a franchise besides its record: its current logo and its colours in both themes. */
export interface AtLook {
  logo: (franchise: number) => string | null | undefined;
  tone: (franchise: number) => { tl: string | null; td: string | null };
}

const tuple = (l: Line): LineTuple => [l.gp, l.w, l.l, l.t, l.otl, l.pf, l.pa];

/** Every franchise as a line, in the order `shown` keeps (first season, then name), with the logos the lines point into. */
export function buildAtList(franchises: readonly Franchise[], look: AtLook): AtList {
  const ordered = [...franchises].sort((a, b) => a.first - b.first || a.name.localeCompare(b.name));
  const logos: string[] = [];
  const lines = ordered.map((t, o): AtLine => {
    const grid = new Array<number>(t.last - t.first + 1).fill(-2);
    for (const y of t.years) grid[y.year - t.first] = y.eligible && y.share != null ? Math.round(y.share * 1000) : -1;
    const recent = t.years.filter((y) => y.eligible && y.share != null).slice(-10);
    const line: AtLine = { f: t.f, name: t.name, ab: t.abbr, a: t.first, z: t.last, s: t.seasons, po: t.playoffs, r: tuple(t.reg), p: tuple(t.po), g: grid, o };
    if (t.former.length) line.fm = t.former;
    if (t.active) line.on = 1;
    if (t.titles.length) line.ti = t.titles;
    if (t.best?.share != null) line.b = [t.best.year, t.best.share];
    if (t.worst?.share != null) line.w = [t.worst.year, t.worst.share];
    if (recent.length) line.rc = recent.reduce((a, y) => a + (y.share ?? 0), 0) / recent.length;
    const logo = look.logo(t.f);
    if (logo) {
      let i = logos.indexOf(logo);
      if (i < 0) i = logos.push(logo) - 1;
      line.lo = i;
    }
    const tone = look.tone(t.f);
    if (tone.tl) line.tl = tone.tl;
    if (tone.td) line.td = tone.td;
    return line;
  });
  return { lines, logos };
}

/** The lines with their logo addresses filled in. */
export const resolveAt = (list: AtList): AtRow[] => list.lines.map((l) => ({ ...l, logo: l.lo != null ? list.logos[l.lo] ?? null : null }));

/** Some of the franchises as a list of their own (their logos only), in the order given. */
export function pickAt(rows: readonly AtRow[]): AtList {
  const logos: string[] = [];
  const lines = rows.map(({ logo, ...line }): AtLine => {
    const l: AtLine = { ...line };
    delete l.lo;
    if (logo) {
      let i = logos.indexOf(logo);
      if (i < 0) i = logos.push(logo) - 1;
      l.lo = i;
    }
    return l;
  });
  return { lines, logos };
}

const fromTuple = (t: LineTuple): Line => ({ gp: t[0], w: t[1], l: t[2], t: t[3], otl: t[4], pf: t[5], pa: t[6] });

/** The record of a franchise in the phase chosen. */
export function lineAt(t: Pick<AtLine, "r" | "p">, phase: AllTimePhase): Line {
  return phase === "r" ? fromTuple(t.r) : phase === "p" ? fromTuple(t.p) : addLines(fromTuple(t.r), fromTuple(t.p));
}

export const shareAt = (t: Pick<AtLine, "r" | "p">, phase: AllTimePhase): number | null => share(lineAt(t, phase));

/** Seasons counted in the phase chosen. */
export const seasonsAt = (t: Pick<AtLine, "s" | "po">, phase: AllTimePhase): number => (phase === "p" ? t.po : t.s);

/** The franchises a choice of phase and "active only" leaves, in the order of the whole list. */
export function shownAt<T extends AtLine>(rows: readonly T[], phase: AllTimePhase, active: boolean): T[] {
  return rows.filter((t) => (!active || t.on) && (phase !== "p" || t.p[0] > 0)).sort((a, b) => a.o - b.o);
}

/** Each season of the club's record as [year, win share], for the small chart in a table row (seasons too short to rate are left out). */
export function atPoints(t: Pick<AtLine, "a" | "g">): [number, number][] {
  const out: [number, number][] = [];
  t.g.forEach((v, i) => { if (v >= 0) out.push([t.a + i, v / 1000]); });
  return out;
}

/** [year, win share or -1 when not worth drawing, 1 when it won the title] for each season it played, as the season grid draws them. */
export function atGrid(t: Pick<AtLine, "a" | "g" | "ti">): [number, number, number][] {
  const won = new Set(t.ti ?? []);
  const out: [number, number, number][] = [];
  t.g.forEach((v, i) => { if (v !== -2) out.push([t.a + i, v < 0 ? -1 : v / 1000, won.has(t.a + i) ? 1 : 0]); });
  return out;
}

/** The columns of the table, in order; the tie and overtime-loss columns exist only where some franchise has them. */
export const atKeys = (showT: boolean, showO: boolean): string[] => [
  "team", "years", "seasons", "gp", "w", "l", ...(showT ? ["t"] : []), ...(showO ? ["otl"] : []),
  "share", "pf", "pa", "diff", "titles", "playoffs", "best", "worst", "trend",
];

/** What each column sorts by: the one place the page (choosing the first rows) and the table in the browser (sorting every row) agree. */
export function atSort(t: AtLine, key: string, phase: AllTimePhase): SortValue {
  const l = lineAt(t, phase);
  switch (key) {
    case "team": return t.name;
    case "years": return t.a;
    case "seasons": return t.s;
    case "gp": return l.gp;
    case "w": return l.w;
    case "l": return l.l;
    case "t": return l.t;
    case "otl": return l.otl;
    case "share": return share(l);
    case "pf": return l.pf;
    case "pa": return l.pa;
    case "diff": return l.pf - l.pa;
    case "titles": return t.ti?.length ?? 0;
    case "playoffs": return t.po;
    case "best": return t.b?.[1];
    case "worst": return t.w?.[1];
    case "trend": return t.rc ?? null;
    default: return undefined;
  }
}

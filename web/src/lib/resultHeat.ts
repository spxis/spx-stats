/**
 * A GitHub-sized graph of one club's results: one square per game, packed in play order (7 rows, then the next
 * column). No empty calendar days. Colour is the club's result (W / L / T / OTL). Pure, so the pages and
 * scripts/resultHeat.test.ts build the same grid.
 */
import type { GameRow } from "./api/types.ts";
import { countsOtl, isFinal, resultFor, type Result } from "./gameView.ts";
import { recordText } from "./record.ts";
import type { TeamGame } from "./teamSeason.ts";

export type HeatResult = Result;

export interface HeatGame {
  date: string;
  id: number;
  year: number;
  res: HeatResult | null;
  ot: boolean;
  mine: number | null;
  theirs: number | null;
  home: boolean;
  awayName: string | null;
  homeName: string | null;
}

/** What a game paints as: a result, or pending when there is no result yet. */
export type GameTone = HeatResult | "pending";

export interface HeatCell {
  game: HeatGame;
  tone: GameTone;
}

export interface HeatMark {
  col: number;
  year: number;
}

export const HEAT_ROWS = 7;
/** GitHub-graph width: ~53 weeks of 11px cells. A season of ~82 games fits in 7 rows; all-time grows rows and shrinks cells to stay in this box. */
export const HEAT_TARGET_COLS = 53;

export interface HeatPack {
  rows: number;
  cols: number;
  cell: number;
  gap: number;
}

export interface HeatGrid {
  first: string;
  last: string;
  games: number;
  tally: { w: number; l: number; t: number; otl: number };
  rows: number;
  cols: number;
  /** columns[col][row], row 0 at the top. null only pads the last incomplete column. */
  columns: (HeatCell | null)[][];
  /** First column of each season, for the labels along the top. */
  marks: HeatMark[];
}

/**
 * How to draw `n` game squares as one GitHub-sized item. A season (or any list that fits 7×53 at 11px) keeps that
 * layout. All-time shrinks the cells and uses more rows so the graph stays about one screen, not a year stack.
 */
export function heatPack(n: number, compact = false): HeatPack {
  const cell0 = compact ? 8 : 11;
  const gap0 = compact ? 2 : 3;
  const step0 = cell0 + gap0;
  const maxW = compact ? 340 : HEAT_TARGET_COLS * step0;
  const maxH = compact ? HEAT_ROWS * step0 : HEAT_ROWS * step0 + step0; // ~7–8 rows at the large cell
  if (n <= 0) return { rows: HEAT_ROWS, cols: 0, cell: cell0, gap: gap0 };
  const cols7 = Math.ceil(n / HEAT_ROWS);
  if (cols7 * step0 <= maxW) return { rows: HEAT_ROWS, cols: cols7, cell: cell0, gap: gap0 };
  for (let step = step0; step >= 3; step--) {
    const cols = Math.max(1, Math.floor(maxW / step));
    const rows = Math.ceil(n / cols);
    if (rows * step <= maxH) {
      const gap = step >= 10 ? gap0 : 1;
      return { rows, cols: Math.ceil(n / rows), cell: Math.max(2, step - gap), gap };
    }
  }
  const step = 3;
  const cols = Math.max(1, Math.floor(maxW / step));
  const rows = Math.ceil(n / cols);
  return { rows, cols: Math.ceil(n / rows), cell: 2, gap: 1 };
}

const DAY_MS = 86_400_000;

/** The game's colour: a result, or pending. */
export function gameTone(g: HeatGame): GameTone {
  return g.res ?? "pending";
}

/** Wins, losses, ties and overtime losses of the finished games. */
export function tallyHeat(games: readonly HeatGame[]): { w: number; l: number; t: number; otl: number } {
  const t = { w: 0, l: 0, t: 0, otl: 0 };
  for (const g of games) {
    if (g.res === "W") t.w++;
    else if (g.res === "L") t.l++;
    else if (g.res === "T") t.t++;
    else if (g.res === "OTL") t.otl++;
  }
  return t;
}

export const heatRecord = (t: { w: number; l: number; t: number; otl: number }): string => recordText(t);

const countedPhase = (phase: string): boolean => phase === "regular" || phase === "playoffs" || phase === "r" || phase === "p";

/** Regular-season and playoff games of one franchise, with the same W / L / T / OTL rule as a game's page. */
export function heatGamesFromRows(lg: string, f: number, rows: readonly GameRow[]): HeatGame[] {
  const out: HeatGame[] = [];
  for (const g of rows) {
    if (!countedPhase(g.phase) || (g.home_f !== f && g.away_f !== f)) continue;
    const home = g.home_f === f;
    const team = home ? g.home_id : g.away_id;
    const res = isFinal(g) ? resultFor(g, team, countsOtl(lg, g.year)) : null;
    out.push({
      date: g.game_date, id: g.game_id, year: g.year, res, ot: !!g.overtime,
      mine: home ? g.home_score : g.away_score, theirs: home ? g.away_score : g.home_score,
      home, awayName: g.away, homeName: g.home,
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
}

/** The season page's own games (already told from the club's side) as heat games. Regular season and playoffs only. */
export function heatGamesFromTeam(games: readonly TeamGame[], year: number, meName: string | null): HeatGame[] {
  return games.filter((g) => g.ph === "r" || g.ph === "p").map((g) => ({
    date: g.date, id: g.id, year, res: g.res || null, ot: g.ot, mine: g.mine, theirs: g.theirs,
    home: g.loc === "Home",
    awayName: g.loc === "Home" ? g.oppName : meName,
    homeName: g.loc === "Home" ? meName : g.oppName,
  }));
}

/** Keep games whose season year is in `from`..`to` (a franchise page year slider). */
export function clipHeatGames(games: readonly HeatGame[], from: number, to: number): HeatGame[] {
  return games.filter((g) => g.year >= from && g.year <= to);
}

/** Distinct season years in play order. */
export function heatSeasons(games: readonly HeatGame[]): number[] {
  const ys = new Set<number>();
  for (const g of games) ys.add(g.year);
  return [...ys].sort((a, b) => a - b);
}

/**
 * One GitHub-sized graph: games in chronological order, `rows` down then the next column. Square count equals game
 * count. Season labels sit on the first column that holds a game of that season. `rows` defaults to heatPack's count
 * so a long all-time list stays one item, not a 7-row ribbon thousands of cells wide.
 */
export function buildHeat(games: readonly HeatGame[], rows?: number): HeatGrid | null {
  if (!games.length) return null;
  const ordered = [...games].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  const R = rows ?? heatPack(ordered.length).rows;
  const cols = Math.ceil(ordered.length / R);
  const columns: (HeatCell | null)[][] = [];
  const marks: HeatMark[] = [];
  let prevYear: number | null = null;
  for (let i = 0; i < ordered.length; i++) {
    const g = ordered[i]!;
    if (g.year !== prevYear) {
      const col = Math.floor(i / R);
      if (!marks.length || marks[marks.length - 1]!.col !== col) marks.push({ col, year: g.year });
      prevYear = g.year;
    }
  }
  for (let c = 0; c < cols; c++) {
    const col: (HeatCell | null)[] = [];
    for (let r = 0; r < R; r++) {
      const g = ordered[c * R + r];
      col.push(g ? { game: g, tone: gameTone(g) } : null);
    }
    columns.push(col);
  }
  return {
    first: ordered[0]!.date,
    last: ordered[ordered.length - 1]!.date,
    games: ordered.length,
    tally: tallyHeat(ordered),
    rows: R,
    cols,
    columns,
    marks,
  };
}

const RES_CHAR: Record<HeatResult, string> = { W: "W", L: "L", T: "T", OTL: "O" };
const CHAR_RES: Record<string, HeatResult> = { W: "W", L: "L", T: "T", O: "OTL" };
const b36 = (n: number | null): string => (n == null ? "" : n.toString(36));
const num = (s: string): number | null => (s === "" ? null : parseInt(s, 36));

/** One franchise's heat games packed for a kept JSON route (the page itself carries none of them). */
export interface PackedHeat { lg: string; f: number; names: string[]; rows: string }

export function packHeat(lg: string, f: number, games: readonly HeatGame[]): PackedHeat {
  const names: string[] = [];
  const idx = (name: string | null): string => {
    if (!name) return "";
    let i = names.indexOf(name);
    if (i < 0) i = names.push(name) - 1;
    return b36(i);
  };
  const rows = games.map((g) => [
    b36(Math.round(Date.parse(`${g.date}T00:00:00Z`) / DAY_MS)), b36(g.id), b36(g.year),
    g.res ? RES_CHAR[g.res] : "", g.ot ? 1 : 0, b36(g.mine), b36(g.theirs), g.home ? 1 : 0, idx(g.awayName), idx(g.homeName),
  ].join(","));
  return { lg, f, names, rows: rows.join(";") };
}

export function unpackHeat(p: PackedHeat): HeatGame[] {
  if (!p.rows) return [];
  return p.rows.split(";").map((row) => {
    const [d, id, year, res, ot, mine, theirs, home, away, homen] = row.split(",");
    return {
      date: new Date(parseInt(d, 36) * DAY_MS).toISOString().slice(0, 10),
      id: parseInt(id, 36), year: parseInt(year, 36), res: CHAR_RES[res] ?? null, ot: ot === "1",
      mine: num(mine), theirs: num(theirs), home: home === "1",
      awayName: away === "" ? null : p.names[parseInt(away, 36)] ?? null,
      homeName: homen === "" ? null : p.names[parseInt(homen, 36)] ?? null,
    };
  });
}

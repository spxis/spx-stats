/**
 * A GitHub-sized graph of one club's results: one square per game, packed in play order (8 rows, then the next
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

export const HEAT_ROWS = 8;
/** GitHub-graph width: ~53 weeks of 11px cells. A season of ~82 games fits in 8 rows; all-time grows rows and shrinks cells to stay in this box. */
export const HEAT_TARGET_COLS = 53;
/** All-time height budget in row-steps: taller than a season grid so squares stay a bit larger than a micro-strip. */
export const HEAT_SPAN_ROWS = 18;
const CELL0 = 11;
const GAP0 = 3;
const COMPACT_CELL = 8;
const COMPACT_GAP = 2;
/** Compare/fill: grow a season grid a little, never to the 22px tiles that dominated the pair. */
const CELL_FILL_MAX = 14;

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

export interface HeatPackOpts {
  /** Inner width of the graph box in px. When omitted, a GitHub-sized (or compact) default is used. */
  width?: number;
  /** Force this many rows (the season grid is always 8). */
  rows?: number;
  /** Smaller default box, for a first paint before the container is measured. */
  compact?: boolean;
  /** Grow season squares toward `width`, capped so they stay smaller than a filled half-column. */
  fill?: boolean;
}

const packOpts = (opts?: HeatPackOpts | boolean): HeatPackOpts =>
  opts === true ? { compact: true } : opts === false || opts == null ? {} : opts;

function seasonPack(n: number, rows: number, cell: number, gap: number): HeatPack {
  return { rows, cols: Math.max(1, Math.ceil(n / rows)), cell, gap };
}

function seasonFill(n: number, rows: number, maxW: number, gap0: number, maxCell: number): HeatPack {
  const cols = Math.max(1, Math.ceil(n / rows));
  const stepFit = Math.floor(maxW / cols);
  const gapGuess = stepFit >= 10 ? gap0 : 1;
  const step = Math.max(3, Math.min(stepFit, maxCell + gapGuess));
  const gap = step >= 10 ? gap0 : 1;
  return { rows, cols, cell: Math.max(2, step - gap), gap };
}

function spanPack(n: number, maxW: number, maxH: number, step0: number, gap0: number): HeatPack {
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

/**
 * How to draw `n` game squares as one item. A season keeps 8 rows at the GitHub cell (11px) unless `fill` grows them
 * a little toward `width`. All-time uses the measured width and a taller budget so squares are larger than a
 * micro-strip, still one graph. `compact` as a boolean is the old second argument.
 */
export function heatPack(n: number, opts?: HeatPackOpts | boolean): HeatPack {
  const o = packOpts(opts);
  const cell0 = o.compact ? COMPACT_CELL : CELL0;
  const gap0 = o.compact ? COMPACT_GAP : GAP0;
  const step0 = cell0 + gap0;
  const maxW = Math.max(32, o.width ?? (o.compact ? 340 : HEAT_TARGET_COLS * step0));
  const maxH = o.compact ? HEAT_ROWS * step0 : HEAT_SPAN_ROWS * step0;
  if (n <= 0) return { rows: o.rows ?? HEAT_ROWS, cols: 0, cell: cell0, gap: gap0 };
  if (o.rows != null) {
    return o.fill ? seasonFill(n, o.rows, maxW, gap0, CELL_FILL_MAX) : seasonPack(n, o.rows, cell0, gap0);
  }
  const cols8 = Math.ceil(n / HEAT_ROWS);
  if (cols8 * step0 <= maxW) {
    return o.fill ? seasonFill(n, HEAT_ROWS, maxW, gap0, CELL_FILL_MAX) : seasonPack(n, HEAT_ROWS, cell0, gap0);
  }
  return spanPack(n, maxW, maxH, step0, gap0);
}

/** Facts a hover card shows: date, opponent, score, result. Click still opens the game. */
export function heatHover(g: HeatGame): {
  date: string; opp: string; home: boolean; score: string | null; res: HeatResult | null; ot: boolean;
} {
  return {
    date: g.date,
    opp: (g.home ? g.awayName : g.homeName) ?? "",
    home: g.home,
    score: g.mine != null && g.theirs != null ? `${g.mine}–${g.theirs}` : null,
    res: g.res,
    ot: g.ot,
  };
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

/**
 * One season of a club's games as api.franchise_season_games gives it. Each game is
 * [id, date, status, phase, 1 if the club was at home, its score, the other score, 1 if it went to overtime, the other club's name].
 */
export interface SeasonGames {
  year: number;
  own: string | null;
  games: readonly (readonly [number, string, string, string, number, number | null, number | null, number, string | null])[];
}

/** The same heat games as heatGamesFromRows, from a franchise's seasons in one read (the W / L / T / OTL rule is the same). */
export function heatGamesFromFranchise(lg: string, seasons: readonly SeasonGames[]): HeatGame[] {
  const out: HeatGame[] = [];
  for (const s of seasons) {
    for (const [id, date, status, phase, home, mine, theirs, ot, opp] of s.games) {
      if (!countedPhase(phase)) continue;
      const atHome = home === 1;
      const final = status === "final" && mine != null && theirs != null;
      const res: HeatResult | null = !final ? null : mine! > theirs! ? "W" : mine! < theirs! ? (ot === 1 && countsOtl(lg, s.year) ? "OTL" : "L") : "T";
      out.push({
        date, id, year: s.year, res, ot: ot === 1, mine, theirs, home: atHome,
        awayName: atHome ? opp : s.own, homeName: atHome ? s.own : opp,
      });
    }
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
 * so a long all-time list stays one item, not an 8-row ribbon thousands of cells wide.
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

/**
 * One franchise's heat games packed for a kept JSON route (the page itself carries none of them). `rows` is the games in play order,
 * `;` between games and `,` between fields, every number in base 36. A game's fields:
 *   day (days since the last game, the first game since 1970), id (difference from the last game's id, signed),
 *   season and the club's own name (only when either differs from the last game's; else empty),
 *   result (W, L, T, O for an overtime loss, empty for none), flags (1 home, 2 went to overtime), score for, score against, opponent.
 * Names are indexes into `names`. Two thirds the size of one number per game for every field, and it compresses well.
 */
export interface PackedHeat { lg: string; f: number; names: string[]; rows: string }

export function packHeat(lg: string, f: number, games: readonly HeatGame[]): PackedHeat {
  const names: string[] = [];
  const at = new Map<string, number>();
  const idx = (name: string | null): string => {
    if (!name) return "";
    let i = at.get(name);
    if (i === undefined) { i = names.push(name) - 1; at.set(name, i); }
    return b36(i);
  };
  let day = 0, id = 0, year = -1, wore: string | null = null;
  const rows = games.map((g) => {
    const d = Math.round(Date.parse(`${g.date}T00:00:00Z`) / DAY_MS);
    const own = g.home ? g.homeName : g.awayName;
    const opp = g.home ? g.awayName : g.homeName;
    const season = g.year === year && own === wore ? ["", ""] : [b36(g.year), idx(own)];
    const row = [
      b36(d - day), b36(g.id - id), season[0], season[1],
      g.res ? RES_CHAR[g.res] : "", String((g.home ? 1 : 0) + (g.ot ? 2 : 0)), b36(g.mine), b36(g.theirs), idx(opp),
    ].join(",");
    day = d; id = g.id; year = g.year; wore = own;
    return row;
  });
  return { lg, f, names, rows: rows.join(";") };
}

export function unpackHeat(p: PackedHeat): HeatGame[] {
  if (!p.rows) return [];
  let day = 0, id = 0, year = 0, own: string | null = null;
  return p.rows.split(";").map((row) => {
    const [dd, di, y, o, res, fl, mine, theirs, opp] = row.split(",");
    day += parseInt(dd, 36);
    id += parseInt(di, 36);
    if (y !== "") { year = parseInt(y, 36); own = o === "" ? null : p.names[parseInt(o, 36)] ?? null; }
    const flags = Number(fl);
    const home = (flags & 1) === 1;
    const other = opp === "" ? null : p.names[parseInt(opp, 36)] ?? null;
    return {
      date: new Date(day * DAY_MS).toISOString().slice(0, 10),
      id, year, res: CHAR_RES[res] ?? null, ot: (flags & 2) === 2,
      mine: num(mine), theirs: num(theirs), home,
      awayName: home ? other : own,
      homeName: home ? own : other,
    };
  });
}

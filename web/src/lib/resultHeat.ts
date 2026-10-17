/**
 * A GitHub-style calendar of one club's results: every day from the first game through the last is a cell
 * (a day with no game is empty). Colour is the club's result that day (W / L / T / OTL). Pure, so the pages
 * and scripts/resultHeat.test.ts build the same grid.
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

/** What a day paints as: a result, two different results, a game with no result yet, or empty (no game). */
export type DayTone = HeatResult | "split" | "pending" | null;

export interface HeatCell {
  date: string;
  games: HeatGame[];
  tone: DayTone;
}

export interface HeatYear {
  year: number;
  /** Sunday-start weeks; each week is Sun..Sat. null is only pad outside this year's slice of the span. */
  weeks: (HeatCell | null)[][];
}

export interface HeatGrid {
  first: string;
  last: string;
  days: number;
  tally: { w: number; l: number; t: number; otl: number };
  years: HeatYear[];
}

const DAY_MS = 86_400_000;

/** `ymd` plus `n` calendar days (UTC). */
export function addDays(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Sunday = 0 … Saturday = 6, from a YYYY-MM-DD kept as UTC midnight. */
export function weekdayUtc(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

/** Every calendar day from `first` through `last` (both included). Empty when the ends are missing or reversed. */
export function eachDay(first: string, last: string): string[] {
  if (!first || !last || first > last) return [];
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The day's colour: empty, pending, one result, or split when two finished games disagree. */
export function toneOf(games: readonly HeatGame[]): DayTone {
  const decided = games.map((g) => g.res).filter((r): r is HeatResult => r != null);
  if (!games.length) return null;
  if (!decided.length) return "pending";
  const uniq = new Set(decided);
  return uniq.size === 1 ? decided[0]! : "split";
}

/** Wins, losses, ties and overtime losses of the finished games (a day with two games counts both). */
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

function cellOf(date: string, byDay: Map<string, HeatGame[]>): HeatCell {
  const games = byDay.get(date) ?? [];
  return { date, games, tone: toneOf(games) };
}

/**
 * One GitHub-style year stack from the first game through the last. Every day in between is a cell.
 * Years are newest first. A year that only holds part of the span starts or ends on those days, not 1 January.
 */
export function buildHeat(games: readonly HeatGame[]): HeatGrid | null {
  if (!games.length) return null;
  let first = games[0]!.date, last = games[0]!.date;
  const byDay = new Map<string, HeatGame[]>();
  for (const g of games) {
    if (g.date < first) first = g.date;
    if (g.date > last) last = g.date;
    const list = byDay.get(g.date);
    if (list) list.push(g);
    else byDay.set(g.date, [g]);
  }
  const y0 = Number(first.slice(0, 4)), y1 = Number(last.slice(0, 4));
  const years: HeatYear[] = [];
  for (let year = y1; year >= y0; year--) {
    const yFirst = year === y0 ? first : `${year}-01-01`;
    const yLast = year === y1 ? last : `${year}-12-31`;
    const start = addDays(yFirst, -weekdayUtc(yFirst));
    const weeks: (HeatCell | null)[][] = [];
    for (let d = start; d <= yLast; d = addDays(d, 7)) {
      const week: (HeatCell | null)[] = [];
      for (let i = 0; i < 7; i++) {
        const day = addDays(d, i);
        week.push(day < yFirst || day > yLast ? null : cellOf(day, byDay));
      }
      weeks.push(week);
    }
    years.push({ year, weeks });
  }
  return { first, last, days: eachDay(first, last).length, tally: tallyHeat(games), years };
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

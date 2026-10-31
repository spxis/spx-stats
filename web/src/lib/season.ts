/**
 * Pure logic shared by the server (first render) and the client (the calendar): types for a
 * season's compact game list, the URL search params, and how a selection resolves against the games.
 */
import { LEAGUE_CODES, type LeagueCode } from "./leagues.ts";
import { oneOf, shaped } from "./queryParam.ts";

export type Phase = "r" | "p" | "s" | "a";

export interface ClubTeam {
  id: number;
  f: number | null;
  name: string | null;
  /** The logo the club wore that season, when it has one. */
  logo?: string | null;
}

/** [date, awayId, awayScore, homeScore, homeId, phase, status initial, source, overtime 0|1, checked, game id]. */
export type GameTuple = [
  date: string,
  away: number,
  awayScore: number | null,
  homeScore: number | null,
  home: number,
  phase: Phase,
  status: string,
  source: string,
  overtime: 0 | 1,
  checked: number | null,
  /** The game's id in the archive: the key of its page (lib/gamePath.ts). */
  id: number,
];

export interface Selection {
  /** "r", "p", "s" or "a"; "" is every part of the season. */
  phase: string;
  team: string;
  month: string;
  day: string;
  /** "" the week the list opens on, "all" the whole month, or the first day (YYYY-MM-DD) of one of the month's weeks. */
  week?: string;
}

/** ?phase=&team=&month=&day=&week= : anything that is not a well-formed value falls back to the default. */
export function parseSelection(raw: Record<string, string | string[] | undefined>): Selection {
  // An absent phase means the regular season; `?phase=` (present, empty) means all of it.
  return {
    phase: oneOf(raw.phase, ["r", "p", "s", "a", ""] as const) ?? "r",
    team: shaped(raw.team, /^\d{1,9}$/) ?? "",
    month: shaped(raw.month, /^\d{4}-(0[1-9]|1[0-2])$/) ?? "",
    day: shaped(raw.day, /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/) ?? "",
    week: shaped(raw.week, /^(all|\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))$/) ?? "",
  };
}

export const ymOf = (date: string): string => date.slice(0, 7);

export function filterGames(games: GameTuple[], phase: string, team: string): GameTuple[] {
  return games.filter((g) => (!phase || g[5] === phase) && (!team || String(g[1]) === team || String(g[4]) === team));
}

/** A calendar week of a month (Monday to Sunday, cut at the month's ends) that holds games. `n` is its place in the month, `games` how many it holds. */
export interface MonthWeek { start: string; end: string; n: number; games: number }

const dayIso = (y: number, m: number, d: number): string => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** The weeks of a month (YYYY-MM), Monday to Sunday, the first and last cut at the month's ends: April 2000 is 1-2, 3-9, 10-16, 17-23, 24-30. Numbered from 1. */
export function monthWeeks(month: string): { start: string; end: string; n: number }[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: { start: string; end: string; n: number }[] = [];
  for (let d = 1; d <= last; ) {
    const sinceMonday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    const end = Math.min(last, d + 6 - sinceMonday);
    out.push({ start: dayIso(y, m, d), end: dayIso(y, m, end), n: out.length + 1 });
    d = end + 1;
  }
  return out;
}

/**
 * The week a month's list opens on: the week of `today` while the month is under way (else the latest week before it, else the first), and the first week
 * with games for any other month. `weeks` are the weeks that hold games, in order.
 */
export function defaultWeek(weeks: readonly MonthWeek[], month: string, today: string): MonthWeek | null {
  if (!weeks.length) return null;
  if (today.slice(0, 7) === month) return weeks.find((w) => today >= w.start && today <= w.end) ?? weeks.filter((w) => w.start <= today).at(-1) ?? weeks[0];
  return weeks[0];
}

/** The months from the first to the last given (YYYY-MM, sorted), the ones between with no games included: a break in the schedule is a month to open, not a jump. */
export function monthRun(have: readonly string[]): string[] {
  if (have.length < 2) return [...have];
  const out: string[] = [];
  let [y, m] = have[0].split("-").map(Number);
  const last = have[have.length - 1];
  for (let ym = have[0]; ym <= last && out.length < 600; ym = `${y}-${String(m).padStart(2, "0")}`) {
    out.push(ym);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

/** Settles a requested selection against the games it can show: the month falls back to the last one with games. `today` (YYYY-MM-DD, "" when unknown) picks the opening week of a month under way. */
export function resolveSelection(games: GameTuple[], want: Selection, today = "") {
  const sel = filterGames(games, want.phase, want.team);
  const byDay = new Map<string, GameTuple[]>();
  for (const g of sel) {
    const list = byDay.get(g[0]);
    if (list) list.push(g); else byDay.set(g[0], [g]);
  }
  const months = monthRun([...new Set(sel.map((g) => ymOf(g[0])))].sort());
  let { month, day } = want;
  if (months.length && !months.includes(month)) { month = months[months.length - 1]; day = ""; }
  if (day && !byDay.has(day)) day = "";
  const weeks: MonthWeek[] = month
    ? monthWeeks(month).map((w) => ({ ...w, games: [...byDay].reduce((a, [k, l]) => a + (k >= w.start && k <= w.end ? l.length : 0), 0) })).filter((w) => w.games > 0)
    : [];
  // `week` is what the address should hold ("" for the opening week); `shownWeek` is the one listed ("all" for the whole month).
  const week = want.week === "all" || weeks.some((w) => w.start === want.week) ? (want.week ?? "") : "";
  const shownWeek = week || defaultWeek(weeks, month, today)?.start || "";
  return { sel, byDay, months, month: months.length ? month : "", day: months.length ? day : "", weeks, week, shownWeek };
}

/**
 * The month a calendar opens on when none was asked for: the month of `today` while the season is under way (the latest month
 * with games up to it), the first month when the season has not started, and null once it is over (the last month then).
 */
export function openMonth(months: readonly string[], today: string): string | null {
  const now = today.slice(0, 7);
  if (!now || !months.length || now > months[months.length - 1]) return null;
  return months.filter((m) => m <= now).at(-1) ?? months[0];
}

export const isLeagueCode = (c: string): c is LeagueCode => (LEAGUE_CODES as readonly string[]).includes(c);

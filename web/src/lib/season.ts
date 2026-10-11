/**
 * Pure logic shared by the server (first render) and the client (the calendar): types for a
 * season's compact game list, the URL search params, and how a selection resolves against the games.
 */
import { z } from "zod";
import { LEAGUE_CODES, type LeagueCode } from "./leagues";

export type Phase = "r" | "p" | "s" | "a";

export interface ClubTeam {
  id: number;
  f: number | null;
  name: string | null;
  /** The logo the club wore that season, when it has one. */
  logo?: string | null;
}

/** [date, awayId, awayScore, homeScore, homeId, phase, status initial, source, overtime 0|1, checked]. */
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
];

export interface Selection {
  /** "r", "p", "s" or "a"; "" is every part of the season. */
  phase: string;
  team: string;
  month: string;
  day: string;
}

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** ?phase=&team=&month=&day= : anything that is not a well-formed value falls back to the default. */
export const selectionSchema = z.object({
  phase: z.preprocess(first, z.enum(["r", "p", "s", "a", ""])).catch("r"),
  team: z.preprocess(first, z.string().regex(/^\d{1,9}$/)).catch(""),
  month: z.preprocess(first, z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)).catch(""),
  day: z.preprocess(first, z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)).catch(""),
});

export function parseSelection(raw: Record<string, string | string[] | undefined>): Selection {
  // An absent phase means the regular season; `?phase=` (present, empty) means all of it.
  return selectionSchema.parse({ phase: raw.phase, team: raw.team, month: raw.month, day: raw.day });
}

export const ymOf = (date: string): string => date.slice(0, 7);

export function filterGames(games: GameTuple[], phase: string, team: string): GameTuple[] {
  return games.filter((g) => (!phase || g[5] === phase) && (!team || String(g[1]) === team || String(g[4]) === team));
}

/** Settles a requested selection against the games it can show: the month falls back to the last one with games. */
export function resolveSelection(games: GameTuple[], want: Selection) {
  const sel = filterGames(games, want.phase, want.team);
  const byDay = new Map<string, GameTuple[]>();
  for (const g of sel) {
    const list = byDay.get(g[0]);
    if (list) list.push(g); else byDay.set(g[0], [g]);
  }
  const months = [...new Set(sel.map((g) => ymOf(g[0])))].sort();
  let { month, day } = want;
  if (months.length && !months.includes(month)) { month = months[months.length - 1]; day = ""; }
  if (day && !byDay.has(day)) day = "";
  return { sel, byDay, months, month: months.length ? month : "", day: months.length ? day : "" };
}

export const isLeagueCode = (c: string): c is LeagueCode => (LEAGUE_CODES as readonly string[]).includes(c);

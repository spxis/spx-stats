import type { HistoryKind } from "./words.ts";

/** One line of "Today in history": the year, the sentence without its date, the source code (lib/sourceLabels.ts), the kind, and, when the sentence starts with a person the database knows by the same id and name,
 * that person's id (`p`) and how many characters of the sentence are the name (`n`): the only part of a line that is a link. */
export interface HistoryFact {
  y: number;
  t: string;
  s: string;
  k: HistoryKind;
  p?: number;
  n?: number;
}

/** A league's facts for the 366 calendar days (data/<league>.json), keyed "MM-DD". `package` and `build` say which meigen-sports data they were made from. */
export interface HistoryFile {
  league: string;
  package: string;
  build: string;
  days: Record<string, HistoryFact[]>;
}

/** What /<league>/rows/today/<month> answers: for each day of the month that has facts, the calendar page (an SVG string) and the facts. */
export interface HistoryMonth {
  days: Record<string, { icon: string; facts: HistoryFact[] }>;
}

/** The leagues that have a "Today in history" block, and the league whose feed they are drawn from (the data's own league code is the same). */
export const HISTORY_LEAGUES = ["nhl", "nba", "mlb", "nfl", "cfl"] as const;
export type HistoryLeague = (typeof HISTORY_LEAGUES)[number];
export const hasHistory = (lg: string): lg is HistoryLeague => (HISTORY_LEAGUES as readonly string[]).includes(lg);

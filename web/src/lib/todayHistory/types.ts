import { familyOf } from "../leagueFamilies.ts";
import type { HistoryKind } from "./words.ts";

/** One line of "Today in history": the league it is about (`l`), the year, the sentence without its date, the source code (lib/sourceLabels.ts), the kind, and, when the sentence starts with a person the
 * database knows by the same id and name, that person's id (`p`) and how many characters of the sentence are the name (`n`): the only part of a line that is a link. */
export interface HistoryFact {
  l: string;
  y: number;
  t: string;
  s: string;
  k: HistoryKind;
  p?: number;
  n?: number;
}

/** A sport's facts for the 366 calendar days (data/<sport>.json), keyed "MM-DD". `leagues` are the leagues whose facts it holds, `package` and `build` say which meigen-sports data they were made from. */
export interface HistoryFile {
  sport: string;
  leagues: string[];
  package: string;
  build: string;
  days: Record<string, HistoryFact[]>;
}

/** What /<league>/rows/today/<day> answers: the calendar page (an SVG string) and the facts of that day, for the whole sport. */
export interface HistoryDay {
  icon: string;
  facts: HistoryFact[];
}

/** The leagues with facts, in the order a sport's leagues are listed. A league joins a sport's block by being added here (and to its facts: `node scripts/todayHistoryBuild.ts`); no other code changes. College football is not in it: it has no facts. */
export const HISTORY_LEAGUES = ["nhl", "nba", "mlb", "nfl", "cfl"] as const;
export type HistoryLeague = (typeof HISTORY_LEAGUES)[number];
export const hasHistory = (lg: string): lg is HistoryLeague => (HISTORY_LEAGUES as readonly string[]).includes(lg);

/** The sport of a league with facts, from the league families (`hockey`, `basketball`, `baseball`, `football`): the same word `league.sport.*` names. */
export const sportOfLeague = (lg: string): string | null => (hasHistory(lg) ? familyOf(lg)?.sport ?? null : null);

/** The sports with facts, in order, and the leagues of each. */
export const HISTORY_SPORTS: readonly { sport: string; leagues: readonly HistoryLeague[] }[] = [...new Set(HISTORY_LEAGUES.map((l) => sportOfLeague(l)!))].map((sport) => ({
  sport,
  leagues: HISTORY_LEAGUES.filter((l) => sportOfLeague(l) === sport),
}));

/** The league whose address serves a sport's facts (`/nfl/rows/today/11-02` for football), so that a sport is one kept file a day, however many leagues it holds. */
export const historyHost = (lg: string): string | null => HISTORY_SPORTS.find((s) => (s.leagues as readonly string[]).includes(lg))?.leagues[0] ?? null;

/** The leagues of the sport a league belongs to (a league's block is labelled with its league only when there is more than one). */
export const sportLeagues = (lg: string): readonly string[] => HISTORY_SPORTS.find((s) => (s.leagues as readonly string[]).includes(lg))?.leagues ?? [];

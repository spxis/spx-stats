import type { NoSeasonKind } from "@/components/ui";

/**
 * One season of a franchise's standings table as plain data (no server code, so the page, the route that serves the older seasons and the table
 * in the browser agree on it). A field that is blank is left out, so a row is about 100 bytes. The table draws its cells from this
 * (components/StandingsTable.tsx): the page sends the newest seasons, and the rest come from the franchise's `rows/standings` address when asked for.
 */
export interface StandLine {
  /** The season's year. */
  y: number;
  /** The club won the title that season. */
  c?: 1;
  /** The team's name that season, its short form and its logo (a place in `StandFlags.logos`: a club keeps one logo for decades, and its address is long). */
  team?: string;
  ab?: string;
  lo?: number;
  /** The season has no games (the league or the team sat out): drawn as the grey box. */
  idle?: NoSeasonKind;
  /** The season the standings lack but the archive has (a Cup challenge, a playoff run): what it was. */
  bare?: string;
  gp?: number;
  /** The games link to the club's season page. */
  g?: 1;
  w?: number;
  l?: number;
  t?: number;
  otl?: number;
  pts?: number;
  pf?: number;
  pa?: number;
  home?: string;
  road?: string;
  pct?: number;
}

/** What the table needs besides the rows: which optional columns exist and the longest winning share (for the bars). */
export interface StandFlags { showT: boolean; showO: boolean; showP: boolean; maxPct: number; logos: string[] }

/** How many of the newest seasons the page itself carries. The rest are fetched when the reader asks for them (or sorts the table another way). */
export const STAND_HEAD = 12;

/** The address of the older seasons of a franchise, from its page's address. */
export const standRestPath = (teamPath: string): string => `${teamPath}/rows/standings`;
/** The address of the full list of seasons as a page of its own. */
export const standPagePath = (teamPath: string): string => `${teamPath}/seasons`;

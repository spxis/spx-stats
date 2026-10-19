/**
 * One award of a franchise's awards table as plain data (no server code: the page, the route that serves the older awards and the table in the
 * browser agree on it). A blank field is left out. See components/AwardsTable.tsx.
 */
export interface AwardLine {
  /** The season. */
  y: number;
  /** The award's name. */
  a: string;
  /** The award's code (its trophy's page, lib/awardTrophy.ts). */
  c?: string;
  /** The winner's name. */
  w?: string;
  /** The address of the winner's page, for a player. */
  h?: string;
  /** The award went to a player (not to the team). */
  p?: 1;
  /** The team's logo that season, beside a team winner: a place in the table's list of logos (a club keeps one for decades, and its address is long). */
  lo?: number;
}

/** A franchise's awards, newest first, and the logos they point into. */
export interface AwardList { lines: AwardLine[]; logos: string[] }

/** How many of the newest awards the page itself carries. */
export const AWARD_HEAD = 10;

/** The address of the older awards of a franchise, and of the page that lists them all, from the franchise page's address. */
export const awardRestPath = (teamPath: string): string => `${teamPath}/rows/awards`;
export const awardPagePath = (teamPath: string): string => `${teamPath}/seasons#awards`;

import type { ChipTuple } from "./teamChips";

/**
 * One row of the players list as the page sends it: plain short fields, which the browser turns into cells (components/PlayersTable.tsx). A page of a hundred
 * players used to send each row as drawn elements (a link, positions, teams, a flag, six numbers, and every sort value again) and the markup the server
 * drew from them; as data a row is about a fifth of that. The server still draws the rows once, for readers without script and for search.
 */
export interface PlayerLine {
  /** The person's id. */
  i: number;
  n: string;
  /** The address of the player's page. */
  h: string;
  /** The leagues the person played in, as codes. */
  lg: string[];
  /** Positions as [code, place of its name in the page's list of names, -1 for none]. */
  p: [string, number][];
  /** The Teams column: the chips drawn and the tooltip lines of the rest; absent when the page has no Teams column. */
  t?: [ChipTuple[], string[]];
  /** The birth country's code, and 1 when the site has no flag for it. */
  c?: string | null;
  nf?: 1;
  /** First and last season, seasons played, awards, and championships (the last only when the page has the column). */
  f: number | null; e: number | null; s: number; a: number; w?: number;
}

/** Which of the optional columns the page has. */
export interface PlayerCols { teams: boolean; country: boolean; titles: boolean }

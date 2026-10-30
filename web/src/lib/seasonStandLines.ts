/**
 * One club of a season's standings table as plain data, so the page, and the table in the browser, agree on it (components/SeasonStandings.tsx draws the
 * cells). A blank field is left out. A season of 136 clubs (college football) was 75 KB of table markup and again as elements in the payload; as lines it is
 * about a fifth of that, and the table draws only its first rows until "Show all" (the rest of the lines are already in the page).
 */
export interface SeasonStandLine {
  /** The team season's id (the row's key). */
  id: number;
  /** The franchise, or none for a club the archive has no franchise for. */
  f?: number;
  n: string | null;
  /** Its short form, the place of its logo in the page's list of logos, and 1 when its link opens that season (it played, or is waiting to). */
  ab?: string;
  lo?: number;
  y?: 1;
  /** The champion of the season, and the champion of the season before (the "defending" label). */
  wn?: 1;
  df?: 1;
  /** The Conference / Division column. */
  pl?: string;
  /** The minor league's NHL parents: [league, franchise, name, logo's place]. */
  af?: [string, number, string, number][];
  gp: number | null;
  /** The games link to the club's season page. */
  g?: 1;
  w: number | null;
  l: number | null;
  t: number | null;
  otl: number | null;
  pts: number | null;
  pf: number | null;
  pa: number | null;
  home: string | null;
  road: string | null;
  pct: number | null;
  /** The classes the row carries (its conference and division). */
  cl?: string;
  /** The group it sits in when the table is drawn in groups (a conference or division). */
  gr?: string;
}

/** Which optional columns the table has, the longest winning share (for the bars), the shared logo list and the words the same for every row. */
export interface SeasonStandFlags {
  place: string | null; nhl: boolean; showT: boolean; showO: boolean; showP: boolean; showHome: boolean; showRoad: boolean; maxPct: number; logos: string[];
}

/** The column keys a table with these flags has, in order (the page reads the sort from the address against them). */
export const seasonStandKeys = (f: Pick<SeasonStandFlags, "place" | "nhl" | "showT" | "showO" | "showP" | "showHome" | "showRoad">): string[] => [
  "team", ...(f.place ? ["place"] : []), ...(f.nhl ? ["nhl"] : []), "gp", "w", "l", ...(f.showT ? ["t"] : []), ...(f.showO ? ["otl"] : []), ...(f.showP ? ["pts"] : []),
  "pf", "pa", ...(f.showHome ? ["home"] : []), ...(f.showRoad ? ["road"] : []), "pct",
];

/** A table with more clubs than this draws only the first rows (of each group, when it has several) under "Show all". */
export const STANDINGS_FULL = 60;
/** How many rows the table draws before "Show all", all told: shared out between the groups when there are several (never fewer than three each). */
export const STANDINGS_HEAD = 40;
export const headPerGroup = (groups: number): number => (groups > 1 ? Math.max(3, Math.floor(STANDINGS_HEAD / groups)) : STANDINGS_HEAD);

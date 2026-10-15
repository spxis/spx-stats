import { seasonLabel } from "./leagues.ts";
import { leagueSat } from "./noSeason.ts";

/**
 * One season of a league as the league page's season chips, heat strip and bar chart need it, as short plain data: the three of them read this one list
 * (components/LeagueSeasonRows.tsx), so the page carries each season once. Blank fields are left out.
 */
export interface LeagueSeasonRow {
  /** The year. */
  y: number;
  /** Games held and games with a result. */
  g: number;
  f: number;
  /** The share of the season's games that have a result, against a typical season (to three places; 0.98 and over means the whole season). */
  s: number;
  /** The champion's name. */
  c?: string;
  /** The season has clubs (without games it is a season with no schedule yet, not one with awards only). */
  t?: 1;
  /** The league did not play that year. */
  n?: 1;
}

/** A share that counts as the whole season (the chip is drawn full). */
export const FULL_SHARE = 0.98;

/** The rows of a league's seasons, oldest first, from the summary rows with their share (lib/coverage.ts). */
export function leagueSeasonRows(list: readonly { year: number; games: number; finals: number; share: number; champion: string | null; teams: number }[]): LeagueSeasonRow[] {
  return list.map((x) => {
    let s = Math.round(x.share * 1000) / 1000;
    if (x.share < FULL_SHARE && s >= FULL_SHARE) s = 0.979;
    const r: LeagueSeasonRow = { y: x.year, g: x.games, f: x.finals, s };
    if (x.champion) r.c = x.champion;
    if (x.teams) r.t = 1;
    if (leagueSat(x)) r.n = 1;
    return r;
  });
}

/** The label of each season is the league's own way of writing a year ("2024-25" or "2024"). */
export const rowLabel = (league: string, r: LeagueSeasonRow): string => seasonLabel(league, r.y);

/** The seasons the bar chart draws: those with games, and the years the league sat out (drawn as a dashed box). */
export const leagueSeasonBars = (league: string, rows: readonly LeagueSeasonRow[]) =>
  rows.filter((r) => r.g > 0 || r.n).map((r) => ({ year: r.y, label: rowLabel(league, r), games: r.g, finals: r.f, champion: r.c ?? null, none: !!r.n }));

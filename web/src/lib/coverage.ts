import { median } from "d3";
import type { SeasonSummaryRow } from "./api/types";
import { seasonLabel } from "./leagues";

export type SeasonWithShare = SeasonSummaryRow & { share: number };

/** Share of each season's games that have a result, against a typical season for that league and era. */
export function withCoverage(seasons: SeasonSummaryRow[]): SeasonWithShare[] {
  seasons = withGaps(seasons);
  const byLg = new Map<string, SeasonSummaryRow[]>();
  for (const s of seasons) byLg.set(s.league, [...(byLg.get(s.league) ?? []), s]);
  return seasons.map((s) => {
    const list = byLg.get(s.league) ?? [];
    const near = list.filter((o) => Math.abs(o.year - s.year) <= 6 && o.games > 0).map((o) => o.games);
    const typical = near.length ? (median(near) ?? s.games) : s.games;
    return { ...s, share: s.games ? Math.min(1, s.finals / Math.max(s.games, typical * 0.9)) : 0 };
  });
}

/** A league year between its first and last season that the API has no row for: the league did not play it. */
export function gapSeason(league: string, year: number): SeasonSummaryRow {
  return {
    league, year, label: seasonLabel(league, year), games: 0, finals: 0, playoff_finals: 0, teams: 0,
    champion: null, champion_note: null, champion_source: null, champion_franchise: null,
  };
}

/** Is `year` inside the league's range of seasons with no row of its own? */
export function isGapYear(seasons: SeasonSummaryRow[], league: string, year: number): boolean {
  const ys = seasons.filter((s) => s.league === league).map((s) => s.year);
  return ys.length > 0 && year > Math.min(...ys) && year < Math.max(...ys) && !ys.includes(year);
}

/** The seasons with a no-games row added for every missing year inside each league's range. */
export function withGaps(seasons: SeasonSummaryRow[]): SeasonSummaryRow[] {
  const out = [...seasons];
  for (const lg of new Set(seasons.map((s) => s.league))) {
    const have = new Set(seasons.filter((s) => s.league === lg).map((s) => s.year));
    const ys = [...have];
    for (let y = Math.min(...ys) + 1; y < Math.max(...ys); y++) if (!have.has(y)) out.push(gapSeason(lg, y));
  }
  return out;
}

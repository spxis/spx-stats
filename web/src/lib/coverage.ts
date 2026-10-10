import { median } from "d3";
import type { SeasonSummaryRow } from "./api/types";

export type SeasonWithShare = SeasonSummaryRow & { share: number };

/** Share of each season's games that have a result, against a typical season for that league and era. */
export function withCoverage(seasons: SeasonSummaryRow[]): SeasonWithShare[] {
  const byLg = new Map<string, SeasonSummaryRow[]>();
  for (const s of seasons) byLg.set(s.league, [...(byLg.get(s.league) ?? []), s]);
  return seasons.map((s) => {
    const list = byLg.get(s.league) ?? [];
    const near = list.filter((o) => Math.abs(o.year - s.year) <= 6 && o.games > 0).map((o) => o.games);
    const typical = near.length ? (median(near) ?? s.games) : s.games;
    return { ...s, share: s.games ? Math.min(1, s.finals / Math.max(s.games, typical * 0.9)) : 0 };
  });
}

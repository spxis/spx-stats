import type { SeasonNameRow } from "./slug.ts";

/**
 * A club's name over its seasons, as unbroken runs: one row for each stretch of consecutive seasons under one name (api.team_season_name_run).
 * A run also ends where a year has no season, so the seasons a club played are exactly the years its runs cover. It holds the same facts as
 * one row per season (api.team_season_index) in a fraction of the rows, so the address table is read in two requests instead of eighteen.
 */
export interface NameRun { league: string; franchise_id: number; team: string | null; from_year: number; to_year: number }

/** One row per season, in the order api.team_season_index gives them (league, year, franchise). */
export function expandRuns(runs: readonly NameRun[]): SeasonNameRow[] {
  const out: SeasonNameRow[] = [];
  for (const r of runs) for (let year = r.from_year; year <= r.to_year; year++) out.push({ league: r.league, year, franchise_id: r.franchise_id, team: r.team });
  return out.sort((a, b) => (a.league < b.league ? -1 : a.league > b.league ? 1 : a.year - b.year || a.franchise_id - b.franchise_id));
}

/** The runs of a list of seasons: what the view computes, for a test to compare with. */
export function runsOf(seasons: readonly SeasonNameRow[]): NameRun[] {
  const out: NameRun[] = [];
  const sorted = [...seasons].sort((a, b) => (a.league < b.league ? -1 : a.league > b.league ? 1 : a.franchise_id - b.franchise_id || a.year - b.year));
  for (const s of sorted) {
    const last = out.at(-1);
    if (last && last.league === s.league && last.franchise_id === s.franchise_id && last.to_year === s.year - 1 && last.team === s.team) last.to_year = s.year;
    else out.push({ league: s.league, franchise_id: s.franchise_id, team: s.team, from_year: s.year, to_year: s.year });
  }
  return out;
}

import type { StandingRow, TeamSeasonRow } from "./api/types";

/** The team-season facts the page needs for a club with no games yet. */
export type IdleSource = Pick<TeamSeasonRow, "league" | "year" | "franchise_id" | "team"> & {
  conference?: string | null;
  conference_short?: string | null;
  division?: string | null;
  division_short?: string | null;
};

/**
 * A synthetic standings id for a club that has no standings row: negative, so it can never collide with a real
 * team-season id, and different for every franchise.
 */
export const idleTeamId = (franchise: number): number => -franchise;
export const isIdleTeam = (teamId: number): boolean => teamId < 0;

/**
 * Standings plus a 0-0 row for every club of the season that has none yet (the standings views only list clubs with a final
 * game, so a season that has not started, or a club that has not played, would be missing). The new rows follow the columns
 * the real rows use: a points column is 0 where the others have points, and left empty where nobody has any.
 */
export function withIdleTeams(standings: StandingRow[], clubs: readonly IdleSource[]): StandingRow[] {
  const have = new Set(standings.map((s) => s.franchise_id));
  const missing = clubs.filter((c) => !have.has(c.franchise_id));
  if (!missing.length) return standings;
  const zeroIf = (has: boolean): number | null => (has ? 0 : null);
  const pts = zeroIf(standings.some((s) => s.pts != null));
  const t = zeroIf(standings.some((s) => s.t));
  const otl = zeroIf(standings.some((s) => s.otl));
  const idle = missing.map((c): StandingRow => ({
    league: c.league, year: c.year, team_id: idleTeamId(c.franchise_id), franchise_id: c.franchise_id, team: c.team,
    gp: 0, w: 0, l: 0, t, otl, pts, pf: null, pa: null, home: null, road: null, pct: null, basis: "scores", source: null,
    conference: c.conference ?? null, conference_short: c.conference_short ?? null, division: c.division ?? null, division_short: c.division_short ?? null,
  }));
  return [...standings, ...idle];
}

/** The day a season's first regular-season game is scheduled, when games are scheduled but none has a result; otherwise null. */
export function seasonStartDay(games: readonly { date: string; phase: string; status: string }[]): string | null {
  const regular = games.filter((g) => g.phase === "r" && g.status !== "c");
  if (!regular.length || regular.some((g) => g.status === "f")) return null;
  return regular.map((g) => g.date).sort()[0] ?? null;
}

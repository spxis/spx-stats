/**
 * The order of a season's table: the page's own ranking (points percentage, then wins), then the club's name, then its id. A tie in both
 * ranks is put in the same place on every read, whatever order the rows came in: the name and the id are neutral, no sporting tie-break
 * is invented. No imports, so a test can run it as it is (scripts/standingOrder.test.ts).
 */
export interface SeasonTableRow {
  readonly pct: number | null;
  readonly w: number | null;
  readonly team: string | null;
  readonly team_id: number;
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function compareSeasonTable(a: SeasonTableRow, b: SeasonTableRow): number {
  return (b.pct ?? -1) - (a.pct ?? -1) || (b.w ?? 0) - (a.w ?? 0) || byText(a.team ?? "", b.team ?? "") || a.team_id - b.team_id;
}

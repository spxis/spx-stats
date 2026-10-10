import type { SeasonSummaryRow, StandingRow } from "./api/types";
import type { NoSeasonKind } from "@/components/ui";

/** A season the league did not play: the API has a row for it with no games and no champion. */
export const leagueSat = (s: Pick<SeasonSummaryRow, "games" | "champion">) => s.games === 0 && !s.champion;

/**
 * The years a team has no games in, between its first and last season: "league" where the whole league sat out, otherwise
 * "team". A standings row with 0 games played counts too.
 */
export function idleYears(rows: StandingRow[], seasons: SeasonSummaryRow[], lg: string): Map<number, NoSeasonKind> {
  const out = new Map<number, NoSeasonKind>();
  if (!rows.length) return out;
  const idleLeague = new Set(seasons.filter((s) => s.league === lg && leagueSat(s)).map((s) => s.year));
  const have = new Set(rows.filter((r) => r.gp !== 0).map((r) => r.year));
  const lo = Math.min(...rows.map((r) => r.year)), hi = Math.max(...rows.map((r) => r.year));
  for (let y = lo; y <= hi; y++) if (!have.has(y)) out.set(y, idleLeague.has(y) ? "league" : "team");
  return out;
}

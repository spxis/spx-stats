import "server-only";
import type { StandingRow } from "./api/types";
import { getTeamGames } from "./data";

/** A club's name in a season as its page gives it: the standings' own, else the name its games carry, else `Team <franchise>`. `standings` are the league's that season. */
export async function seasonClubName(lg: string, y: number, f: number, standings: StandingRow[]): Promise<string> {
  const own = standings.find((r) => r.franchise_id === f)?.team;
  if (own) return own;
  const raw = await getTeamGames(lg, y, f, "asc");
  const first = raw.find((g) => g.home_f === f) ?? raw[0];
  return (first ? (first.home_f === f ? first.home : first.away) : null) || `Team ${f}`;
}

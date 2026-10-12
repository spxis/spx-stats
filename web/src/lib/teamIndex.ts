import "server-only";
import { rowsWindow } from "./api/client";
import { teamIndexSchema, type TeamIndexRow } from "./api/teams";
import { isLeague } from "./leagues";
import { listQuery, orderOf, searchFilters, searchWords, type Col, type Order } from "./listQuery";
import type { SortKey } from "./sort";

export const TEAMS_PER_PAGE = 50;

export type TeamStatus = "all" | "active" | "defunct";

/** The columns of the teams table (and the API's `sort=`), by the field of `api.team_index` each sorts on. */
export const TEAM_SORTS: Record<string, Col> = {
  name: { field: "name" },
  league: { field: "league" },
  first: { field: "first_season", num: true, nullable: true },
  last: { field: "last_season", num: true, nullable: true },
  seasons: { field: "seasons", num: true },
  titles: { field: "titles", num: true },
  share: { field: "share", num: true, nullable: true },
};
export const TEAM_TIE: Col[] = [{ field: "name" }, { field: "league" }, { field: "franchise_id", num: true }];
export const TEAM_FIELDS = ["franchise_id", "league", "name", "former_names", "first_season", "last_season", "seasons", "titles", "share", "active"] as const;

/** The filters of a teams list: a league, the words of a name (any name the franchise has had), and whether it still plays. */
export function teamFilters(league: string, q: string, status: TeamStatus): string[] {
  return [
    isLeague(league) ? `league=eq.${league}` : "",
    status === "all" ? "" : `active=is.${status === "active"}`,
    ...searchFilters(searchWords(q)),
  ].filter(Boolean);
}

export const teamOrder = (sort: readonly SortKey[]): Order => orderOf(sort, TEAM_SORTS, TEAM_TIE);

export interface TeamPage { list: TeamIndexRow[]; total: number; page: number; pages: number }

/** One page of the teams index, in the order asked for, with the number of franchises that match. A page past the last is answered with the last page. */
export async function getTeamPage(league: string, q: string, status: TeamStatus, sort: SortKey[], page: number): Promise<TeamPage> {
  const query = listQuery({ filters: teamFilters(league, q, status), select: TEAM_FIELDS, order: teamOrder(sort) });
  let at = page;
  for (let tries = 0; ; tries++) {
    const { rows, total } = await rowsWindow("team_index", query, (at - 1) * TEAMS_PER_PAGE, TEAMS_PER_PAGE, teamIndexSchema);
    const pages = Math.max(1, Math.ceil(total / TEAMS_PER_PAGE));
    if (rows.length || at === 1 || tries) return { list: rows, total, page: at, pages };
    at = pages;
  }
}

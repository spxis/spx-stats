import "server-only";
import { rowsSlice, rowsWindow } from "./api/client";
import { teamIndexSchema, type TeamIndexRow } from "./api/teams";
import { isLeague } from "./leagues";
import { listQuery, orderOf, searchFilters, searchWords, type Col, type Order, type Val } from "./listQuery";
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
export function teamFilters(league: string, words: readonly string[], status: TeamStatus): string[] {
  return [
    isLeague(league) ? `league=eq.${league}` : "",
    status === "all" ? "" : `active=is.${status === "active"}`,
    ...searchFilters(words),
  ].filter(Boolean);
}

export const teamOrder = (sort: readonly SortKey[]): Order => orderOf(sort, TEAM_SORTS, TEAM_TIE);

/** The rows of the teams index that match, in this order: a window of them by offset or the ones after a cursor. */
export async function readTeams(f: { league: string; words: readonly string[]; status: TeamStatus }, order: Order, win: { offset: number; limit: number; after?: readonly Val[] | null }): Promise<{ rows: TeamIndexRow[]; total: number | null; more: boolean }> {
  const query = listQuery({ filters: teamFilters(f.league, f.words, f.status), select: TEAM_FIELDS, order, after: win.after });
  if (win.after) {
    const rows = await rowsSlice("team_index", query, 0, win.limit + 1, teamIndexSchema);
    return { rows: rows.slice(0, win.limit), total: null, more: rows.length > win.limit };
  }
  const { rows, total } = await rowsWindow("team_index", query, win.offset, win.limit, teamIndexSchema);
  return { rows, total, more: win.offset + rows.length < total };
}

export interface TeamPage { list: TeamIndexRow[]; total: number; page: number; pages: number }

/** One page of the teams index, in the order asked for, with the number of franchises that match. A page past the last is answered with the last page. */
export async function getTeamPage(league: string, q: string, status: TeamStatus, sort: SortKey[], page: number): Promise<TeamPage> {
  const order = teamOrder(sort);
  const f = { league, words: searchWords(q), status };
  let at = page;
  for (let tries = 0; ; tries++) {
    const { rows, total } = await readTeams(f, order, { offset: (at - 1) * TEAMS_PER_PAGE, limit: TEAMS_PER_PAGE });
    const pages = Math.max(1, Math.ceil((total ?? 0) / TEAMS_PER_PAGE));
    if (rows.length || at === 1 || tries) return { list: rows, total: total ?? 0, page: at, pages };
    at = pages;
  }
}

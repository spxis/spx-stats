import "server-only";
import { ApiError, rowsSlice, rowsWindow } from "./api/client";
import { playerIndexSchema, type PlayerIndexRow } from "./api/people";
import { isLeague } from "./leagues";
import { readSpan, type Span } from "./listSpan";
import { overlapFilters } from "./listRange";
import { listQuery, orderOf, searchFilters, searchWords, type Col, type Order, type Val } from "./listQuery";
import type { SortKey } from "./sort";
import { slugify } from "./slug";

export { searchWords };

export const PLAYERS_PER_PAGE = 100;

/** The columns of the players table (and the API's `sort=`), by the field of `api.player_index` each sorts on. */
export const PLAYER_SORTS: Record<string, Col> = {
  name: { field: "name" },
  league: { field: "leagues", noCursor: true },
  position: { field: "position", nullable: true },
  years: { field: "last_season", num: true, nullable: true },
  seasons: { field: "seasons_played", num: true },
  awards: { field: "award_count", num: true },
};
export const PLAYER_TIE: Col[] = [{ field: "name" }, { field: "person_id", num: true }];
const PLAYER_SELECT = ["person_id", "name", "position", "positions", "leagues", "first_season", "last_season", "seasons_played", "award_count"];

export const playerOrder = (sort: readonly SortKey[]): Order => orderOf(sort, PLAYER_SORTS, PLAYER_TIE);

export interface PlayerFilters { league: string; words: readonly string[]; position?: string; from?: number; to?: number }

/** The first and last season in the players index for a league (every league when none), which is the full reach of the year slider. */
export const playerSpan = (league: string): Promise<Span> => readSpan("player_index", isLeague(league) ? [`leagues=cs.${encodeURIComponent(`{${league}}`)}`] : []);

/**
 * The rows of the players index that match (a league, the words of a name, a position, the years they played in), in this order, a window of them by offset or the ones after a
 * cursor. The name is searched in the folded `search` of api.player_search (no accents, indexed); until that view exists (migration 037) it is the plain name.
 */
export async function readPlayers(f: PlayerFilters, order: Order, win: { offset: number; limit: number; after?: readonly Val[] | null }): Promise<{ rows: PlayerIndexRow[]; total: number | null; more: boolean }> {
  const base = [
    isLeague(f.league) ? `leagues=cs.${encodeURIComponent(`{${f.league}}`)}` : "",
    // a player matches by the main position or by any other they hold (positions is lower case)
    ...overlapFilters(f.from, f.to),
    f.position ? `or=${encodeURIComponent(`(position.ilike.${f.position},positions.cs.{${f.position.toLowerCase()}})`)}` : "",
  ].filter(Boolean);
  const run = async (view: string, filters: string[]) => {
    const query = listQuery({ filters, select: PLAYER_SELECT, order, after: win.after });
    if (win.after) {
      const rows = await rowsSlice(view, query, 0, win.limit + 1, playerIndexSchema);
      return { rows: rows.slice(0, win.limit), total: null, more: rows.length > win.limit };
    }
    const { rows, total } = await rowsWindow(view, query, win.offset, win.limit, playerIndexSchema);
    return { rows, total, more: win.offset + rows.length < total };
  };
  if (!f.words.length) return run("player_index", base);
  try {
    return await run("player_search", [...base, ...searchFilters(f.words)]);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e;
    return run("player_index", [...base, ...f.words.map((w) => `name=ilike.${encodeURIComponent(`*${w}*`)}`)]);
  }
}

/** The players whose name makes this address segment ("shohei-ohtani"), in any league, the longest careers first. */
export async function playersNamed(slug: string): Promise<PlayerIndexRow[]> {
  const words = slug.split("-").filter(Boolean);
  if (!words.length || words.length > 6) return [];
  const { rows } = await readPlayers({ league: "", words }, playerOrder([{ key: "seasons", dir: "desc" }]), { offset: 0, limit: 50 });
  return rows.filter((p) => slugify(p.name) === slug);
}

export interface PlayerPage { list: PlayerIndexRow[]; total: number; page: number; pages: number }

/**
 * One page of the players index, in the order asked for (the view is indexed for each column), with the number of players
 * that match the league and the name. A page past the last is answered with the last page.
 */
export async function getPlayerPage(league: string, q: string, sort: SortKey[], page: number, years: { from?: number; to?: number } = {}): Promise<PlayerPage> {
  const order = playerOrder(sort);
  const f = { league, words: searchWords(q), ...years };
  let at = page;
  for (let tries = 0; ; tries++) {
    const { rows, total } = await readPlayers(f, order, { offset: (at - 1) * PLAYERS_PER_PAGE, limit: PLAYERS_PER_PAGE });
    const pages = Math.max(1, Math.ceil((total ?? 0) / PLAYERS_PER_PAGE));
    if (rows.length || at === 1 || tries) return { list: rows, total: total ?? 0, page: at, pages };
    at = pages;
  }
}

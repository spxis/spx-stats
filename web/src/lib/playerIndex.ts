import "server-only";
import { rowsWindow } from "./api/client";
import { playerIndexSchema, type PlayerIndexRow } from "./api/people";
import { isLeague } from "./leagues";
import type { SortKey } from "./sort";

export const PLAYERS_PER_PAGE = 100;

/** The columns of the players table, by the field of `api.player_index` each sorts on. */
export const PLAYER_SORTS = { name: "name", league: "leagues", position: "position", years: "last_season", seasons: "seasons_played", awards: "award_count" } as const;

export interface PlayerPage { list: PlayerIndexRow[]; total: number; page: number; pages: number }

/** The words of a search, each one a piece of the name (so "gretzky wayne" finds Wayne Gretzky); characters the filter syntax uses are dropped. */
export const searchWords = (q: string): string[] => q.replace(/[*%_\\,.()"']/g, " ").split(/\s+/).filter(Boolean).slice(0, 4).map((w) => w.slice(0, 30));

/**
 * One page of the players index, in the order asked for (the view is indexed for each column), with the number of players
 * that match the league and the name. A page past the last is answered with the last page.
 */
export async function getPlayerPage(league: string, q: string, sort: SortKey[], page: number): Promise<PlayerPage> {
  const filters = [
    isLeague(league) ? `leagues=cs.${encodeURIComponent(`{${league}}`)}` : "",
    ...searchWords(q).map((w) => `name=ilike.${encodeURIComponent(`*${w}*`)}`),
  ].filter(Boolean);
  const order = [...sort.map((s) => `${PLAYER_SORTS[s.key as keyof typeof PLAYER_SORTS]}.${s.dir}${s.key === "position" || s.key === "years" ? ".nullslast" : ""}`), "name.asc", "person_id.asc"].join(",");
  const query = [...filters, "select=person_id,name,position,leagues,first_season,last_season,seasons_played,award_count", `order=${order}`].join("&");
  let at = page;
  for (let tries = 0; ; tries++) {
    const { rows, total } = await rowsWindow("player_index", query, (at - 1) * PLAYERS_PER_PAGE, PLAYERS_PER_PAGE, playerIndexSchema);
    const pages = Math.max(1, Math.ceil(total / PLAYERS_PER_PAGE));
    if (rows.length || at === 1 || tries) return { list: rows, total, page: at, pages };
    at = pages;
  }
}

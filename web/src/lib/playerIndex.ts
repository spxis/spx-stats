import "server-only";
import { z } from "zod";
import { ApiError, rows, rowsSlice, rowsWindow } from "./api/client";
import { playerIndexSchema, type PlayerIndexRow } from "./api/people";
import { isLeague } from "./leagues";
import { readSpan, type Span } from "./listSpan";
import { overlapFilters } from "./listRange";
import { letterFilter, letterFilterPlain, orderOf, PLAYER_LISTED, playerQuery, readLetter, searchFilters, searchWords, type Col, type LetterBy, type Order, type Val } from "./listQuery";
import type { SortKey } from "./sort";
import { positionCode } from "./positions";
import { slugify } from "./slug";

export { searchWords };

export const PLAYERS_PER_PAGE = 100;

const letterCountSchema = z.object({ letter: z.string(), n: z.number() });

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

// `country` exists once migration 063 has run. Until then the database answers a 400 to any read that names it; that is remembered for a
// minute (so a page does not ask twice) and the rows are read without it: the page and the API then leave the country out.
let noCountryUntil = 0;
const COUNTRY_RETRY = 60_000;

export const playerOrder = (sort: readonly SortKey[]): Order => orderOf(sort, PLAYER_SORTS, PLAYER_TIE);

export interface PlayerFilters {
  league: string; words: readonly string[]; position?: string; nat?: string; from?: number; to?: number;
  /** A franchise id: keeps players who ever played for it (api.player_team_search, migration 098; there is no fallback, a database without it answers an error). */
  team?: number;
  /** One letter a to z: keeps players whose last name (or first name, with letterBy "first") starts with it. */
  letter?: string; letterBy?: LetterBy;
}

/** How many players the players index lists (the five leagues' players, as /players counts them with no filter): one request that asks for a row and reads the count. A view that is missing gives null. */
export async function playerTotal(): Promise<number | null> {
  try {
    return (await rowsWindow("player_index", `select=person_id&${PLAYER_LISTED}`, 0, 1, z.object({ person_id: z.number() }))).total;
  } catch (e) {
    if (e instanceof ApiError && e.status != null && e.status >= 400 && e.status < 500) return null;
    throw e;
  }
}

/** The first and last season in the players index for a league (every league when none), which is the full reach of the year slider. */
export const playerSpan = (league: string): Promise<Span> => readSpan("player_index", [PLAYER_LISTED, ...(isLeague(league) ? [`leagues=cs.${encodeURIComponent(`{${league}}`)}`] : [])]);

/**
 * The rows of the players index that match (a league, the words of a name, a position, the years they played in), in this order, a window of them by offset or the ones after a
 * cursor. The name is searched in the folded `search` of api.player_search (no accents, indexed); until that view exists (migration 037) it is the plain name.
 */
export async function readPlayers(f: PlayerFilters, order: Order, win: { offset: number; limit: number; after?: readonly Val[] | null }): Promise<{ rows: PlayerIndexRow[]; total: number | null; more: boolean }> {
  const base = [
    isLeague(f.league) ? `leagues=cs.${encodeURIComponent(`{${f.league}}`)}` : "",
    // a player matches by the main position or by any other they hold, by code; an older word ("Defenseman") is read as its code
    ...overlapFilters(f.from, f.to),
    f.nat ? `country=eq.${encodeURIComponent(f.nat.toUpperCase())}` : "",
    f.position ? `or=${encodeURIComponent(`(position.ilike.${positionCode(f.position) ?? f.position},positions.cs.{${positionCode(f.position) ?? f.position}})`)}` : "",
  ].filter(Boolean);
  const run = async (view: string, filters: string[]): Promise<{ rows: PlayerIndexRow[]; total: number | null; more: boolean }> => {
    const query = (select: string[]) => playerQuery({ filters, select, order, after: win.after });
    if (Date.now() < noCountryUntil) return read(view, query(PLAYER_SELECT));
    try { return await read(view, query([...PLAYER_SELECT, "country"])); } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 400 || f.nat) throw e;
      const rows = await read(view, query(PLAYER_SELECT)).catch(() => { throw e; });
      noCountryUntil = Date.now() + COUNTRY_RETRY;
      return rows;
    }
  };
  const read = async (view: string, query: string) => {
    if (win.after) {
      const rows = await rowsSlice(view, query, 0, win.limit + 1, playerIndexSchema);
      return { rows: rows.slice(0, win.limit), total: null, more: rows.length > win.limit };
    }
    const { rows, total } = await rowsWindow(view, query, win.offset, win.limit, playerIndexSchema);
    return { rows, total, more: win.offset + rows.length < total };
  };
  const letter = readLetter(f.letter);
  if (f.team !== undefined) return run("player_team_search", [...base, `franchise_id=eq.${f.team}`, ...searchFilters(f.words), ...(letter ? [letterFilter(letter, f.letterBy)] : [])]);
  if (!f.words.length && !letter) return run("player_index", base);
  try {
    return await run("player_search", [...base, ...searchFilters(f.words), ...(letter ? [letterFilter(letter, f.letterBy)] : [])]);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e;
    return run("player_index", [...base, ...f.words.map((w) => `name=ilike.${encodeURIComponent(`*${w}*`)}`), ...(letter ? [letterFilterPlain(letter, f.letterBy)] : [])]);
  }
}

/** How many players start with each letter under the same filters but the letter (api.player_letters, migration 091): letter to count, only letters with players. Null where the database lacks the function (the row then draws every letter). */
export async function getLetterCounts(f: Omit<PlayerFilters, "letter">): Promise<Map<string, number> | null> {
  const args = [
    `p_by=${f.letterBy === "first" ? "first" : "last"}`,
    isLeague(f.league) ? `p_league=${f.league}` : "",
    f.nat ? `p_nat=${encodeURIComponent(f.nat.toUpperCase())}` : "",
    f.position ? `p_position=${encodeURIComponent(positionCode(f.position) ?? f.position)}` : "",
    f.from !== undefined ? `p_from=${f.from}` : "",
    f.to !== undefined ? `p_to=${f.to}` : "",
    f.words.length ? `p_q=${encodeURIComponent(f.words.join(" "))}` : "",
    f.team !== undefined ? `p_franchise=${f.team}` : "",
  ].filter(Boolean).join("&");
  try {
    const found = await rows("rpc/player_letters", args, letterCountSchema);
    return new Map(found.map((r) => [r.letter, r.n]));
  } catch {
    return null;
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
export async function getPlayerPage(league: string, q: string, sort: SortKey[], page: number, more: { from?: number; to?: number; nat?: string; letter?: string; letterBy?: LetterBy; team?: number } = {}): Promise<PlayerPage> {
  const order = playerOrder(sort);
  const f = { league, words: searchWords(q), ...more };
  let at = page;
  for (let tries = 0; ; tries++) {
    const { rows, total } = await readPlayers(f, order, { offset: (at - 1) * PLAYERS_PER_PAGE, limit: PLAYERS_PER_PAGE });
    const pages = Math.max(1, Math.ceil((total ?? 0) / PLAYERS_PER_PAGE));
    if (rows.length || at === 1 || tries) return { list: rows, total: total ?? 0, page: at, pages };
    at = pages;
  }
}

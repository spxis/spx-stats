/**
 * The teams page's list, worked out in the browser: the filters it reads from the address, the franchises they keep, the page of them to show,
 * and the dots for the map. The page sends the whole list once (about 270 franchises) and nothing here asks the server for more, so /teams stays
 * a kept, static copy for everyone. Pure and import-light, so the page, the board and a node script share it.
 */
import { fold } from "./fold.ts";
import { LEAGUE_CODES } from "./leagues.ts";
import { everIn, type LeagueGroups, type Place } from "./teamGroups.ts";
import { rangeFromQuery, type YearSpan } from "./yearRange.ts";

/** One franchise as the page sends it to the browser. */
export interface BoardTeam {
  lg: string;
  f: number;
  /** The current (or last) name. */
  name: string;
  /** Every other name it has had, oldest first, each with the index in `logos` of the logo of that name's years (-1 where we hold none). */
  former: [string, number][];
  first: number | null;
  last: number | null;
  seasons: number;
  titles: number;
  share: number | null;
  active: boolean;
  /** Index in `logos` of the logo it wears now (or wore last), -1 for none. */
  logo: number;
  /** Country code of the city of its latest season, null where we cannot say. */
  cc: string | null;
  /** Where the map puts it: its latest home venue, else its city. */
  lat: number | null;
  lon: number | null;
  /** The city and region, e.g. "Detroit, MI". */
  place: string | null;
  /** The conferences and divisions it has sat in, the current or last one first. */
  places: Place[];
}

export const STATUSES = ["all", "active", "defunct"] as const;
export type Status = (typeof STATUSES)[number];

/** Every address key the teams page reads in the browser (so none of them asks the server for a copy of its own: lib/routing.ts keeps /teams static). */
export const TEAMS_CLIENT_KEYS = ["league", "q", "status", "from", "to", "sort", "page", "conf", "div", "titles"] as const;

export const TEAMS_PER_PAGE = 50;
export const DEF_SORT = "name.asc";
/** The least titles the control offers a choice of. */
export const MAX_TITLES_KEY = 99;

export interface BoardFilters {
  league: string;
  q: string;
  status: Status;
  /** The years kept, or null for all of them. */
  range: YearSpan | null;
  /** Franchises with at least this many titles. */
  titles: number;
  conf: string;
  div: string;
  page: number;
}

const cleanText = (v: string | null, max: number) => (v ?? "").trim().slice(0, max);
const wholeNumber = (v: string | null) => (v !== null && /^\d{1,4}$/.test(v) ? Number(v) : null);

/** The first and last season any franchise of the league (every league when none) has: the full reach of the year slider. */
export function leagueSpan(rows: readonly BoardTeam[], league: string): { min: number; max: number } | null {
  let min = Infinity, max = -Infinity;
  for (const t of rows) {
    if (league && t.lg !== league) continue;
    if (t.first != null) min = Math.min(min, t.first);
    if (t.last != null) max = Math.max(max, t.last);
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

/**
 * The filters an address (and what this browser remembers of the years) asks for, kept to what exists: a league that is not one, a conference
 * or division the league never had, a range that covers the whole span and a titles number past the most any franchise holds all count as unset.
 * `saved` is the years remembered for this page ("from-to" or ""), used when the address names none.
 */
export function readFilters(search: string, rows: readonly BoardTeam[], groups: Readonly<Record<string, Pick<LeagueGroups, "confs" | "divs">>>, saved = ""): BoardFilters {
  const q = new URLSearchParams(search);
  const lg = cleanText(q.get("league"), 8).toLowerCase();
  const league = (LEAGUE_CODES as readonly string[]).includes(lg) ? lg : "";
  const status = (STATUSES as readonly string[]).includes(q.get("status") ?? "") ? (q.get("status") as Status) : "all";
  const span = leagueSpan(rows, league);
  const f = wholeNumber(q.get("from")), t = wholeNumber(q.get("to"));
  let range: YearSpan | null = null;
  if (span) {
    if (f !== null || t !== null) range = rangeFromQuery(f === null ? "" : String(f), t === null ? "" : String(t), span.min, span.max);
    else if (saved) {
      const m = /^(\d{1,4})-(\d{1,4})$/.exec(saved);
      if (m) range = rangeFromQuery(m[1], m[2], span.min, span.max);
    }
  }
  const g = league ? groups[league] : undefined;
  const conf = g?.confs.some((c) => c.id === q.get("conf")) ? (q.get("conf") as string) : "";
  // A division of another conference than the one chosen cannot be: it is dropped, not kept hidden.
  const div = g?.divs.some((d) => d.id === q.get("div") && (!conf || d.conf === conf)) ? (q.get("div") as string) : "";
  const most = Math.max(0, ...rows.filter((r) => !league || r.lg === league).map((r) => r.titles));
  const titles = Math.min(wholeNumber(q.get("titles")) ?? 0, MAX_TITLES_KEY, most);
  const page = wholeNumber(q.get("page"));
  return { league, q: cleanText(q.get("q"), 60), status, range, titles, conf, div, page: page && page > 0 ? page : 1 };
}

/** What a search compares for a franchise: every name it has had, folded (no accents, lower case). */
export const searchTextOf = (t: BoardTeam): string => fold([t.name, ...t.former.map((n) => n[0])].join(" "));

/** The franchises that pass every filter. `texts` holds searchTextOf for each (the board makes it once). */
export function filterTeams(rows: readonly BoardTeam[], f: BoardFilters, texts: ReadonlyMap<BoardTeam, string>): BoardTeam[] {
  const words = fold(f.q).split(" ").filter(Boolean).slice(0, 4);
  return rows.filter((t) => {
    if (f.league && t.lg !== f.league) return false;
    if (f.status !== "all" && t.active !== (f.status === "active")) return false;
    // The years the franchise played overlap the range (a club with no seasons drops out of a narrowed range).
    if (f.range && (t.first == null || t.last == null || t.first > f.range.to || t.last < f.range.from)) return false;
    if (f.titles > 0 && t.titles < f.titles) return false;
    if ((f.conf || f.div) && !everIn(t.places, f.conf, f.div)) return false;
    if (words.length) {
      const text = texts.get(t) ?? searchTextOf(t);
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });
}

/** The page of a list, and the number of pages. A page past the last is the last. */
export function pageOf<T>(list: readonly T[], page: number, per = TEAMS_PER_PAGE): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(list.length / per));
  const at = Math.min(Math.max(1, page), pages);
  return { items: list.slice((at - 1) * per, at * per), page: at, pages };
}

/** The most titles any franchise has among those the other filters keep: the top of the titles control. */
export function mostTitles(rows: readonly BoardTeam[], league: string): number {
  return Math.min(MAX_TITLES_KEY, Math.max(0, ...rows.filter((r) => !league || r.lg === league).map((r) => r.titles)));
}

/** The group a franchise sits in now (or sat in last), the one shown in the table. Null where no alignment is recorded for it. */
export const currentPlace = (t: BoardTeam): Place | null => t.places[0] ?? null;

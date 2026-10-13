/**
 * The /venues list, shared by the server (which builds the rows) and the browser (which filters them): row shapes, the filter and how
 * it is kept in the address, and a colour for each league. Pure and import-free of Next, so a node script can test it.
 *
 * Nothing here knows the five leagues by name: the leagues on the page are whatever the rows carry (a new league's venues appear with
 * their own colour and filter chip).
 */

import { visitMatches, type Visits } from "./venueVisits.ts";

/** A club that used a venue: `logo` is the one it wore when it left (its current one if it still plays there), or null if we hold none. */
export interface VenueClub { lg: string; f: number; name: string; href: string; from: number | null; to: number | null; logo: string | null }

/** One home venue, with every club that used it, as the page sends it to the browser. */
export interface VenueRow {
  id: string;
  /** What the visited list keeps it under: its Wikidata id, else `geo:<lat>,<lon>` (venueVisits.ts). */
  key: string;
  /** The address of its page, /venue/<slug> (venueSlug.ts). */
  slug: string;
  /** The name now (or the last one it had). */
  name: string;
  /** Every name with its years, when it has had more than one. */
  former: string | null;
  lat: number;
  lon: number;
  cc: string | null;
  /** City and state or province, e.g. "Montreal, QC". */
  place: string | null;
  citySlug: string | null;
  wiki: string | null;
  address: string | null;
  addressHref: string | null;
  /** League codes, in the page's league order. */
  leagues: string[];
  clubs: VenueClub[];
  opened: number | null;
  closed: number | null;
  capacity: number | null;
  roof: string | null;
  surface: string | null;
  /** Who owns it, as the facts line says. */
  owner: string | null;
  /** First and last year a club used it; from is null when unknown, to is null while a club still plays there. */
  from: number | null;
  to: number | null;
  /** Some club plays there now. */
  current: boolean;
  /** The conference and division of its current clubs: "league|conference|division" (either part may be empty). */
  al: string[];
  /** The lines the map panel adds: its other names and its facts. */
  extra: string[];
}

export type VenueStatus = "" | "current" | "former";

/** The visited list's filter: only the venues the reader marked, only the others, or both. The list is the reader's own, kept in the browser. */
export type VenueVisited = "" | "yes" | "no";

export interface VenueFilter { leagues: string[]; status: VenueStatus; visited: VenueVisited; cc: string; conf: string; div: string; from: number; to: number }
export interface YearBounds { min: number; max: number }

export const emptyFilter = (b: YearBounds): VenueFilter => ({ leagues: [], status: "", visited: "", cc: "", conf: "", div: "", from: b.min, to: b.max });

/** Whether a venue passes the filter. A range that spans the whole bounds filters nothing, so venues with no known years stay. `visits` is the reader's list; left out, the visited filter filters nothing. */
export function venueMatches(v: VenueRow, f: VenueFilter, b: YearBounds, visits?: Visits): boolean {
  if (visits && !visitMatches(f.visited, v.key, visits)) return false;
  if (f.leagues.length && !v.leagues.some((l) => f.leagues.includes(l))) return false;
  if (f.status === "current" && !v.current) return false;
  if (f.status === "former" && v.current) return false;
  if (f.cc && v.cc !== f.cc) return false;
  if (f.conf && !v.al.some((a) => a.startsWith(`${f.conf}|`))) return false;
  if (f.div && !v.al.includes(f.div)) return false;
  if (f.from > b.min || f.to < b.max) {
    if (v.from != null && v.from > f.to) return false;
    if (v.to != null && v.to < f.from) return false;
  }
  return true;
}

const whole = (s: string | null): number | null => (s !== null && /^\d{1,4}$/.test(s) ? Number(s) : null);

/** The filter an address asks for (?league=nhl,nba&status=current&nat=CA&conf=..&div=..&from=&to=), read leniently: anything unknown is ignored. */
export function readFilter(search: string, b: YearBounds, leagues: readonly string[]): VenueFilter {
  const q = new URLSearchParams(search);
  const out = emptyFilter(b);
  out.leagues = (q.get("league") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => leagues.includes(s));
  const st = q.get("status");
  out.status = st === "current" || st === "former" ? st : "";
  const vis = q.get("visited");
  out.visited = vis === "yes" || vis === "no" ? vis : "";
  out.cc = /^[A-Za-z]{2}$/.test(q.get("nat") ?? "") ? (q.get("nat") ?? "").toUpperCase() : "";
  out.conf = (q.get("conf") ?? "").slice(0, 80);
  out.div = (q.get("div") ?? "").slice(0, 120);
  const from = whole(q.get("from")), to = whole(q.get("to"));
  if (from !== null) out.from = Math.min(Math.max(from, b.min), b.max);
  if (to !== null) out.to = Math.min(Math.max(to, b.min), b.max);
  if (out.from > out.to) { out.from = b.min; out.to = b.max; }
  return out;
}

/** The query changes for a filter: a key with nothing to say is null (removed from the address). */
export function filterQuery(f: VenueFilter, b: YearBounds): Record<string, string | null> {
  const full = f.from <= b.min && f.to >= b.max;
  return {
    league: f.leagues.length ? f.leagues.join(",") : null,
    status: f.status || null,
    visited: f.visited || null,
    nat: f.cc || null,
    conf: f.conf || null,
    div: f.div || null,
    from: full ? null : String(f.from),
    to: full ? null : String(f.to),
  };
}

/** Colours the site already gives its leagues (CSS variables, light and dark); the codes in this list are the ones globals.css defines. */
const THEMED = new Set(["nhl", "nba", "mlb", "nfl", "cfl"]);

/**
 * A league's colour: the site's own for the five it styles, otherwise a hue stepped round the wheel by the league's place in the list,
 * so every league the data brings gets its own. `order` is the league's index among the page's leagues.
 */
export function leagueColor(code: string, order: number): string {
  if (THEMED.has(code)) return `var(--${code})`;
  const hue = Math.round((265 + order * 137.5) % 360);
  return `hsl(${hue} 58% 48%)`;
}

/** The colour of a venue's dot: its league's, or the neutral one when several leagues used it. */
export function venueColor(v: VenueRow, order: Map<string, number>): string {
  if (v.leagues.length !== 1) return "var(--muted)";
  return leagueColor(v.leagues[0], order.get(v.leagues[0]) ?? 0);
}

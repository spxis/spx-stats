/**
 * The world soccer stadiums as rows of the /venues list (kind "soccer") and as the facts a venue page draws: every core.venue that has a soccer match (the
 * World Cup, men's and women's, and MLS). Pure and import-light (types and helpers only), so a node script can test it; the server side that reads the views is
 * venueSoccer.ts.
 *
 * A stadium that is also a home venue of the five leagues (BC Place, BMO Field) is not a second row: it keeps its home row and its page adds the soccer.
 * A stadium the archive has no coordinates for has a page but no row (it cannot be drawn on the map).
 */
import type { Speaker } from "./i18n/i18n.ts";
import type { VenueDetail } from "./venueDataset.ts";
import type { VenueClub, VenueRow } from "./venueModel.ts";
import { venueKey } from "./venueVisits.ts";
import { factsText } from "./venueWire.ts";

type Say = Speaker["say"];

/** The soccer competitions a stadium can have staged, in the order their chips are listed: the men's World Cup, the women's and Major League Soccer. */
export const SOCCER_LEAGUES = ["wc", "wwc", "mls"] as const;
export type SoccerLeague = (typeof SOCCER_LEAGUES)[number];
export const isSoccerLeague = (l: string): l is SoccerLeague => (SOCCER_LEAGUES as readonly string[]).includes(l);

/** Where each competition's own pages are (the address of the page that lists its seasons). */
export const SOCCER_HREF: Record<SoccerLeague, string> = { wc: "/worldcup", wwc: "/worldcup", mls: "/mls" };

/** The phrase that names each competition. */
export const SOCCER_NAME_KEY = { wc: "wc.mens", wwc: "wc.womens", mls: "mls.title" } as const;

/** A name a stadium carried with the years it applied (a year is null when the name has no date on that side). */
export interface SoccerName { name: string; from: number | null; until: number | null }

/** The first and last year of a competition's matches at a stadium, and how many matches there were. */
export interface SoccerSpan { lg: SoccerLeague; first: number; last: number; matches: number }

/** A pitch size, in metres. `source` says where it comes from: the stadium's own published size, or the standard 105 by 68 m of the Laws of the Game. */
export interface Pitch { length: number; width: number; source: "published" | "standard"; /** The English Wikipedia article and revision the size was read from (enwiki:<title>@<revision>), when it was. */ cite: string | null }

/** One stadium with a soccer match. Everything but the ids and the spans may be missing. */
export interface SoccerVenue {
  venueId: number;
  wid: string;
  name: string;
  names: SoccerName[];
  city: string | null;
  region: string | null;
  cc: string | null;
  lat: number | null;
  lon: number | null;
  capacity: number | null;
  opened: number | null;
  closed: number | null;
  surface: string | null;
  roof: string | null;
  address: string | null;
  postal: string | null;
  /** The English Wikipedia article of the stadium, when we know it (kyogijo's ground, or the article a pitch size was read from). */
  wikiTitle: string | null;
  pitch: Pitch;
  spans: SoccerSpan[];
}

/** Matches at a stadium in all. */
export const matchCount = (v: Pick<SoccerVenue, "spans">): number => v.spans.reduce((n, s) => n + s.matches, 0);

/** The first and last year of any match at the stadium. */
export function yearsOf(v: Pick<SoccerVenue, "spans">): { first: number | null; last: number | null } {
  if (!v.spans.length) return { first: null, last: null };
  return { first: Math.min(...v.spans.map((s) => s.first)), last: Math.max(...v.spans.map((s) => s.last)) };
}

/** The matches of a view of (venue, competition, year) rows as spans, by venue id. Rows of another competition are left out. */
export function spansOf(list: readonly { venue_id: number; league: string; year: number }[]): Map<number, SoccerSpan[]> {
  const by = new Map<number, Map<SoccerLeague, SoccerSpan>>();
  for (const r of list) {
    if (!isSoccerLeague(r.league)) continue;
    const m = by.get(r.venue_id) ?? new Map<SoccerLeague, SoccerSpan>();
    by.set(r.venue_id, m);
    const s = m.get(r.league);
    if (s) { s.first = Math.min(s.first, r.year); s.last = Math.max(s.last, r.year); s.matches++; } else m.set(r.league, { lg: r.league, first: r.year, last: r.year, matches: 1 });
  }
  return new Map([...by].map(([id, m]) => [id, SOCCER_LEAGUES.flatMap((l) => (m.has(l) ? [m.get(l)!] : []))]));
}

/** The name now: the latest name that has no end, else the latest, else the name the reference view gives. */
export function currentName(names: readonly SoccerName[], fallback: string): string {
  const open = names.filter((n) => n.until == null);
  return open.at(-1)?.name ?? names.at(-1)?.name ?? fallback;
}

/** A name that starts before the next one ends is cut at the next one's start, so each year has one name (as venueName.ts does for the home venues). */
export function settleNames(spans: readonly SoccerName[]): SoccerName[] {
  const s = [...spans].sort((a, b) => (a.from ?? -1) - (b.from ?? -1));
  return s.map((x, i) => {
    const next = s.slice(i + 1).find((y) => (y.from ?? -1) > (x.from ?? -1));
    const until = next?.from != null && (x.until == null || x.until > next.from) ? next.from : x.until;
    return { ...x, until };
  });
}

/** "Cowboys Stadium –2013 · AT&T Stadium 2013–": every name with its years, oldest first; null when the stadium has had only one name. */
export function soccerNamesLine(spans: readonly SoccerName[]): string | null {
  if (spans.length < 2) return null;
  const y = (n: number | null) => (n == null ? "" : String(n));
  return spans.map((s) => `${s.name} ${y(s.from)}–${y(s.until)}`).join(" · ");
}

const abbr = (iso: string | null) => iso?.split("-")[1] ?? null;
/** "Seattle, WA" for a place in the United States or Canada; the city alone elsewhere (a region code means little outside them, and the country is written beside it). */
export function soccerPlace(v: Pick<SoccerVenue, "city" | "region" | "cc">): string | null {
  const region = v.cc === "US" || v.cc === "CA" ? abbr(v.region) : null;
  return [v.city, region].filter(Boolean).join(", ") || null;
}

const wikiUrl = (title: string | null) => (title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}` : null);

/** The article title in an `enwiki:<title>@<revision>` citation, or null. */
export function citedTitle(cite: string | null): string | null {
  const m = cite ? /^enwiki:(.+)@\d+$/.exec(cite) : null;
  return m ? m[1] : null;
}

/** What the builder needs from the server: the reader's language, the country of a point, and a stadium's street address in the site's one format (null without a street line). */
export interface SoccerContext { say: Say; country: (lat: number, lon: number) => string | null; address: (v: SoccerVenue) => { text: string; href: string | null } | null }

/** The league entries of a stadium as the `clubs` of its row: one for each competition, with the years of its matches there (the stadium's last year is open while it stands). */
export function soccerClubs(v: SoccerVenue, standing: boolean, say: Say): VenueClub[] {
  return v.spans.map((s) => ({ lg: s.lg, f: 0, name: say(SOCCER_NAME_KEY[s.lg]), href: SOCCER_HREF[s.lg], from: s.first, to: standing ? null : s.last, logo: null }));
}

/** Whether the stadium still stands: it has no closing year. */
export const stands = (v: Pick<SoccerVenue, "closed">): boolean => v.closed == null;

/**
 * The stadiums that are not home venues of the five leagues as rows of the /venues list, with the extra the dataset keeps for each (by row id), and the ones the
 * archive has no coordinates for apart (`unplaced`: a page, but no dot). `shared` holds the Wikidata ids (upper case) of the stadiums that already have a home row.
 */
export function soccerRows(list: readonly SoccerVenue[], shared: ReadonlySet<string>, ctx: SoccerContext): { rows: VenueRow[]; unplaced: VenueRow[]; detail: Map<string, VenueDetail> } {
  const rows: VenueRow[] = [];
  const unplaced: VenueRow[] = [];
  const detail = new Map<string, VenueDetail>();
  for (const v of list) {
    if (shared.has(v.wid.toUpperCase())) continue;
    const lat = v.lat ?? NaN, lon = v.lon ?? NaN;
    const placed = v.lat != null && v.lon != null;
    const names = settleNames(v.names);
    const standing = stands(v);
    const clubs = soccerClubs(v, standing, ctx.say);
    const facts = factsText({ capacity: v.capacity, opened: v.opened, surface: v.surface, roof: v.roof }, ctx.say);
    const former = soccerNamesLine(names);
    const id = `soccer:${v.wid}`;
    const adr = ctx.address(v);
    const row: VenueRow = {
      id, key: venueKey(v.wid, placed ? lat : 0, placed ? lon : 0), slug: "", name: v.name, former, lat: placed ? lat : 0, lon: placed ? lon : 0,
      cc: v.cc ?? (placed ? ctx.country(lat, lon) : null), place: soccerPlace(v), citySlug: null, wiki: wikiUrl(v.wikiTitle),
      address: adr?.text ?? null, addressHref: adr?.href ?? null, leagues: [], clubs, opened: v.opened, closed: v.closed, state: v.closed != null ? "closed" : null, capacity: v.capacity, roof: v.roof, surface: v.surface, owner: null,
      from: null, to: null, current: false, al: [], extra: [former, facts].filter((e): e is string => !!e), kind: "soccer", tag: null, planned: null, games: matchCount(v) || null,
    };
    (placed ? rows : unplaced).push(row);
    detail.set(id, { wid: v.wid, city: v.city, iso: v.region, names });
  }
  return { rows, unplaced, detail };
}

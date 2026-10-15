/**
 * The open dataset of home venues behind /venues: the records, their CSV and GeoJSON forms and the filtering, sorting and paging of
 * GET /api/venues. Pure and import-light (types and list helpers only), so a node script can test it; the server side that reads the
 * archive is venueData.ts.
 *
 * Licence and provenance are part of the file, not just of a page: the GeoJSON carries them as top-level members (RFC 7946 allows
 * foreign members), and /sources describes the CSV's columns (a CSV has nowhere to put them).
 */
import { fold } from "./fold.ts";
import { cursorOf, orderOf, valuesOf, type Col, type Order, type Val } from "./listQuery.ts";
import type { SortKey } from "./sort";
import type { VenueKind, VenueRow } from "./venueModel";

/** A name a venue carried with the years it applied; `until` is null for the name now (or when unknown). */
export interface VenueNameSpan { name: string; from: number | null; until: number | null }
/** What the record adds to a row of the /venues list: Wikidata id, city, ISO 3166-2 region and every name with its years. */
export interface VenueDetail {
  wid: string | null; city: string | null; iso: string | null; names: VenueNameSpan[];
  /** The surface as the source wrote it ("AstroTurf 3D Xtreme"), where the venue's page can show it beside the surface word; home venues only, and only once migration 089 is on the server. */
  surfaceRaw?: string | null;
}

/** A club that played at the venue; `to` is null while it still does. */
export interface VenueRecordClub { league: string; franchise_id: number; name: string; from: number | null; to: number | null }

/** One home venue as the dataset publishes it. */
export interface VenueRecord {
  /** The Wikidata id, else `geo:<lat>,<lon>` (five decimals) for the few venues Wikidata does not identify. */
  id: string;
  wikidata_id: string | null;
  name: string;
  former_names: VenueNameSpan[];
  latitude: number;
  longitude: number;
  city: string | null;
  /** ISO 3166-2, e.g. CA-QC. */
  region: string | null;
  /** ISO 3166-1 alpha-2, e.g. CA. */
  country: string | null;
  leagues: string[];
  clubs: VenueRecordClub[];
  /** First and last year a club used it; null when unknown, last_year null while a club still plays there. */
  first_year: number | null;
  last_year: number | null;
  current: boolean;
  opened: number | null;
  closed: number | null;
  capacity: number | null;
  roof: string | null;
  surface: string | null;
  wikipedia_title: string | null;
  /** home: a venue a club played its home games at; spring: a spring training park; future: a venue planned for a club (not built yet); soccer: a stadium that staged World Cup or MLS matches and is not a home venue of the five leagues. */
  kind: VenueKind;
  /** A future venue's status: proposed, approved or under_construction; null for every other kind. */
  status: string | null;
  /** A spring training park's league: cactus (Arizona) or grapefruit (Florida); null for every other kind. */
  spring_league: string | null;
  /** The year a future venue is planned to open, as its source says; null when the source gives none (and for every other kind). */
  planned_open_year: number | null;
  /** Games played there in all, on record in the archive (for a soccer stadium, its World Cup and MLS matches); null when none are (spring and future venues have none). */
  games: number | null;
}

export const RECORD_FIELDS = [
  "wikidata_id", "name", "former_names", "latitude", "longitude", "city", "region", "country", "leagues", "clubs", "first_year", "last_year", "current",
  "opened", "closed", "capacity", "roof", "surface", "wikipedia_title", "kind", "status", "spring_league", "planned_open_year", "games",
] as const satisfies readonly (keyof VenueRecord)[];

const WIKI = "https://en.wikipedia.org/wiki/";
const at5 = (n: number) => n.toFixed(5);

/** "Boston_Garden" from its address; the title as Wikipedia writes it ("Boston Garden"). Null for anything that is not an English Wikipedia article address. */
export function wikipediaTitle(url: string | null): string | null {
  if (!url?.startsWith(WIKI)) return null;
  try {
    return decodeURIComponent(url.slice(WIKI.length)).replace(/_/g, " ") || null;
  } catch {
    return null;
  }
}

/** The records, in the list's order, from the rows of /venues and what the dataset adds to them. */
export function venueRecords(rows: readonly VenueRow[], detail: ReadonlyMap<string, VenueDetail>): VenueRecord[] {
  return rows.map((r) => {
    const d = detail.get(r.id);
    const wid = d?.wid ?? null;
    return {
      id: wid ?? `geo:${at5(r.lat)},${at5(r.lon)}`,
      wikidata_id: wid,
      name: r.name,
      former_names: (d?.names ?? []).filter((n) => n.name !== r.name),
      latitude: r.lat,
      longitude: r.lon,
      city: d?.city ?? null,
      region: d?.iso ?? null,
      country: r.cc?.toUpperCase() ?? null,
      leagues: r.leagues,
      clubs: r.clubs.map((c) => ({ league: c.lg, franchise_id: c.f, name: c.name, from: c.from, to: c.to })),
      first_year: r.from,
      last_year: r.to,
      current: r.current,
      opened: r.opened,
      closed: r.closed,
      capacity: r.capacity,
      roof: r.roof,
      surface: r.surface,
      wikipedia_title: wikipediaTitle(r.wiki),
      kind: r.kind,
      status: r.kind === "future" ? r.tag : null,
      spring_league: r.kind === "spring" ? r.tag : null,
      planned_open_year: r.kind === "future" ? r.planned : null,
      games: r.games,
    };
  });
}

/* ---------- licence and provenance ---------------------------------------------------- */

export const DATASET = {
  name: "SPX Network: home venues",
  description: "Every home venue of the NHL, NBA, MLB, NFL and CFL clubs on record, current and former, with its clubs, former names, place and basic facts, and with it the spring training parks of the major-league clubs (kind spring), the venues planned for a club (kind future) and the other stadiums that staged World Cup or MLS matches (kind soccer).",
  url: "https://spxn.com/venues",
  licence:
    "Venue identifiers, names, coordinates, places and facts from Wikidata are CC0 1.0. Surface and roof may come from the infobox of the venue's English Wikipedia article and are then CC BY-SA 4.0: credit Wikipedia and its authors (wikipedia_title names the article) and share alike. Clubs, leagues and years of use come from the SPX Stats archive; each source's licence is on https://spxn.com/sources.",
  attribution: "SPX Network (https://spxn.com), with data from Wikidata and English Wikipedia.",
  sources: [
    { name: "Wikidata", url: "https://www.wikidata.org", licence: "CC0 1.0", licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/" },
    { name: "English Wikipedia", url: "https://en.wikipedia.org", licence: "CC BY-SA 4.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/" },
    { name: "SPX Stats archive", url: "https://spxn.com/sources", licence: "see the sources page", licenceUrl: "https://spxn.com/sources" },
  ],
} as const;

/* ---------- CSV ----------------------------------------------------------------------- */

/** One CSV field, RFC 4180: quoted when it holds a comma, a quote, a line break or a leading or trailing space, with quotes doubled. */
export function csvField(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const span = (a: number | null, b: number | null) => `${a ?? ""}-${b ?? ""}`;

/** "Qwest Field (2004-2011); Seahawks Stadium (2002-2004)": every former name with its years. */
export const formerNamesText = (names: readonly VenueNameSpan[]): string => names.map((n) => `${n.name} (${span(n.from, n.until)})`).join("; ");
/** "nhl:12 Boston Bruins (1995-); nba:5 Boston Celtics (1946-1995)": league and franchise id, name, years (an empty end is a club still there, or unknown). */
export const clubsText = (clubs: readonly VenueRecordClub[]): string => clubs.map((c) => `${c.league}:${c.franchise_id} ${c.name} (${span(c.from, c.to)})`).join("; ");

/** The CSV: a header row and one row per venue, UTF-8, CRLF line ends. Lists are joined with "; " (see formerNamesText, clubsText); leagues are codes joined with ";". */
export function venuesCsv(records: readonly VenueRecord[]): string {
  const lines = [RECORD_FIELDS.map(csvField).join(",")];
  for (const r of records) {
    lines.push([
      r.wikidata_id, r.name, formerNamesText(r.former_names), r.latitude, r.longitude, r.city, r.region, r.country, r.leagues.join(";"), clubsText(r.clubs),
      r.first_year, r.last_year, r.current, r.opened, r.closed, r.capacity, r.roof, r.surface, r.wikipedia_title, r.kind, r.status, r.spring_league, r.planned_open_year, r.games,
    ].map(csvField).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

/* ---------- GeoJSON ------------------------------------------------------------------- */

/** The GeoJSON (RFC 7946): a FeatureCollection of Points in [longitude, latitude] order, with the dataset's name, licence, attribution and sources as top-level members. */
export function venuesGeoJson(records: readonly VenueRecord[], generated: Date) {
  return {
    type: "FeatureCollection" as const,
    name: DATASET.name,
    description: DATASET.description,
    url: DATASET.url,
    licence: DATASET.licence,
    attribution: DATASET.attribution,
    sources: DATASET.sources,
    generated: generated.toISOString(),
    features: records.map((r) => {
      const { id, latitude, longitude, ...properties } = r;
      return { type: "Feature" as const, id, geometry: { type: "Point" as const, coordinates: [longitude, latitude] }, properties };
    }),
  };
}

/* ---------- GET /api/venues ----------------------------------------------------------- */

/** The sortable columns by their name in `?sort=`: the field of the sort row each one orders by. */
export const VENUE_COLS: Record<string, Col> = {
  name: { field: "name_key" },
  city: { field: "city_key", nullable: true },
  country: { field: "country", nullable: true },
  league: { field: "league_key" },
  years: { field: "first_year", num: true, nullable: true },
  opened: { field: "opened", num: true, nullable: true },
  games: { field: "games", num: true, nullable: true },
  closed: { field: "closed", num: true, nullable: true },
  capacity: { field: "capacity", num: true, nullable: true },
  clubs: { field: "club_count", num: true },
};
export const VENUE_SORTS = Object.keys(VENUE_COLS);
const TIE: Col = { field: "id" };
export const venueOrder = (sort: readonly SortKey[]): Order => orderOf(sort, VENUE_COLS, [TIE]);

const KINDS: readonly VenueKind[] = ["home", "spring", "future", "soccer"];

/**
 * `?kind=` of GET /api/venues: left out, the home venues alone (the API's long-standing answer); a comma list of home, spring, future and soccer (in any order, none twice);
 * or `all` for the four. Anything else is a problem the caller gets as a 400 naming `kind`.
 */
export function readKinds(raw: string | undefined): { ok: true; kinds: VenueKind[] } | { ok: false; message: string } {
  const bad = { ok: false, message: "use home, spring, future, soccer (a comma list of them, e.g. home,future) or all; left out, home" } as const;
  if (raw === undefined) return { ok: true, kinds: ["home"] };
  if (raw === "all") return { ok: true, kinds: [...KINDS] };
  const list = raw.split(",");
  if (!list.every((k) => (KINDS as readonly string[]).includes(k)) || new Set(list).size !== list.length) return bad;
  return { ok: true, kinds: KINDS.filter((k) => list.includes(k)) };
}

export type VenueStatus = "all" | "current" | "former";
export interface VenueQuery {
  /** Only these kinds (home, spring, future); left out, every kind. GET /api/venues passes ["home"] when the caller names none. */
  kind?: readonly VenueKind[];
  league?: string;
  words: string[];
  status: VenueStatus;
  nat?: string;
  from?: number;
  to?: number;
}

/** Whether a venue passes a query. A venue whose years are unknown is kept by any range, as on the page. */
export function venueFits(r: VenueRecord, q: VenueQuery, text: string): boolean {
  if (q.kind && !q.kind.includes(r.kind)) return false;
  if (q.league && !r.leagues.includes(q.league)) return false;
  if (q.status === "current" && !r.current) return false;
  if (q.status === "former" && r.current) return false;
  if (q.nat && r.country !== q.nat.toUpperCase()) return false;
  if (q.to !== undefined && r.first_year != null && r.first_year > q.to) return false;
  if (q.from !== undefined && r.last_year != null && r.last_year < q.from) return false;
  return q.words.every((w) => text.includes(w));
}

const searchText = (r: VenueRecord) => fold([r.name, ...r.former_names.map((n) => n.name), r.city, ...r.clubs.map((c) => c.name)].filter(Boolean).join(" "));
const sortRow = (r: VenueRecord): Record<string, unknown> => ({
  id: r.id, name_key: fold(r.name), city_key: r.city ? fold(r.city) : null, country: r.country, league_key: r.leagues.join(","), first_year: r.first_year,
  opened: r.opened, closed: r.closed, capacity: r.capacity, club_count: r.clubs.length, games: r.games,
});

/** Compares two rows' sort values by the order: empty values last either way, strings and numbers in plain order. */
export function compareVals(order: Order, a: readonly Val[], b: readonly Val[]): number {
  for (let i = 0; i < order.length; i++) {
    const x = a[i], y = b[i];
    if (x == null && y == null) continue;
    if (x == null) return 1;
    if (y == null) return -1;
    if (x === y) continue;
    return (x < y ? -1 : 1) * (order[i].dir === "asc" ? 1 : -1);
  }
  return 0;
}

export interface VenuePage { data: Partial<VenueRecord & { id: string }>[]; page: { limit: number; offset: number | null; sort: string; next: string | null; total: number | null } }

/**
 * The page of venues a query asks for: filtered, sorted, then cut by `offset` (total is counted) or by `after` (the sort values of the last row seen:
 * steady while the data changes, total is null). `fields` keeps the listed keys (`id` is always there).
 */
export function queryVenues(
  records: readonly VenueRecord[],
  q: VenueQuery,
  o: { order: Order; sortText: string; fields: readonly string[] | null; limit: number; offset: number; after: readonly Val[] | null },
): VenuePage {
  const rows = records.flatMap((r) => (venueFits(r, q, searchText(r)) ? [{ r, vals: valuesOf(o.order, sortRow(r)) }] : []));
  rows.sort((a, b) => compareVals(o.order, a.vals, b.vals));
  const past = o.after ? rows.findIndex((x) => compareVals(o.order, x.vals, o.after!) > 0) : -1;
  const first = o.after ? (past < 0 ? rows.length : past) : o.offset;
  const slice = rows.slice(first, first + o.limit);
  const more = first + slice.length < rows.length;
  const pick = (r: VenueRecord): Partial<VenueRecord> =>
    o.fields ? (Object.fromEntries(Object.entries(r).filter(([k]) => k === "id" || o.fields!.includes(k))) as Partial<VenueRecord>) : r;
  return {
    data: slice.map((x) => pick(x.r)),
    page: { limit: o.limit, offset: o.after ? null : o.offset, sort: o.sortText, next: more && slice.length ? cursorOf(o.sortText, slice[slice.length - 1].vals) : null, total: o.after ? null : rows.length },
  };
}

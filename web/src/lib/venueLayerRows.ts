/**
 * The spring training parks and the future venues as rows of the /venues list (kind "spring" and "future"), built from api.spring_training_venue and
 * api.future_venue. Pure and import-light (types and helpers only), so a node script can test it; the server side that reads the views is venueLayers.ts.
 *
 * A park or venue the source gives no coordinates for is left out: the list is a map and a table of places.
 */
import type { Speaker } from "./i18n/i18n";
import type { VenueDetail } from "./venueDataset.ts";
import type { VenueClub, VenueRow } from "./venueModel.ts";
import { venueKey } from "./venueVisits.ts";
import { factsText } from "./venueWire.ts";

type Say = Speaker["say"];

/** A row of api.spring_training_venue. */
export interface SpringRow {
  wikidata_id: string;
  name: string;
  league: string;
  city: string | null;
  region: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  opened_year: number | null;
  closed_year: number | null;
  capacity: number | null;
  wikipedia_title: string | null;
  first_year: number | null;
  last_year: number | null;
  in_use: boolean;
  tenants: { franchise_id: number | null; club: string; from: number | null; to: number | null }[];
  names: { name: string; from: number | null; to: number | null }[];
}

/** A row of api.future_venue. */
export interface FutureRow {
  wikidata_id: string | null;
  venue_key: string;
  name: string;
  status: string;
  planned_open_year: number | null;
  capacity: number | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  region: string | null;
  country_code: string | null;
  replaces_venue_name: string | null;
  wikipedia_title: string | null;
  clubs: { club: string; league: string; franchise_id: number | null }[];
}

/** What the builders need from the server: a club's page address and its logo in a year, and the reader's language. */
export interface LayerContext {
  /** The leagues the list has chips for, in its order; a club of another league is left out. */
  leagues: readonly string[];
  href: (lg: string, f: number) => string;
  logo: (f: number, year?: number) => string | null;
  /** The country of a point, when the source gives none. */
  country: (lat: number, lon: number) => string | null;
  say: Say;
}

const wikiUrl = (title: string | null) => (title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}` : null);
const abbr = (iso: string | null) => iso?.split("-")[1] ?? null;
const placeOf = (city: string | null, region: string | null) => [city, abbr(region)].filter(Boolean).join(", ") || null;

const blank = (): Pick<VenueRow, "citySlug" | "address" | "addressHref" | "roof" | "surface" | "owner" | "al" | "games"> =>
  ({ citySlug: null, address: null, addressHref: null, roof: null, surface: null, owner: null, al: [], games: null });

/** The spring training parks as rows, with the extra the dataset keeps for each (by row id). Clubs the archive has no franchise for are listed by name, with no page. */
export function springRows(list: readonly SpringRow[], ctx: LayerContext): { rows: VenueRow[]; detail: Map<string, VenueDetail> } {
  const rows: VenueRow[] = [];
  const detail = new Map<string, VenueDetail>();
  for (const p of list) {
    if (p.latitude == null || p.longitude == null) continue;
    const clubs: VenueClub[] = [];
    for (const t of p.tenants) {
      const had = clubs.find((c) => (t.franchise_id ? c.f === t.franchise_id : c.f === 0 && c.name === t.club));
      if (had) {
        had.from = had.from == null || t.from == null ? null : Math.min(had.from, t.from);
        had.to = had.to == null || t.to == null ? null : Math.max(had.to, t.to);
      } else {
        clubs.push({
          lg: "mlb", f: t.franchise_id ?? 0, name: t.club, href: t.franchise_id ? ctx.href("mlb", t.franchise_id) : "", from: t.from, to: t.to,
          logo: t.franchise_id ? ctx.logo(t.franchise_id, t.to == null ? undefined : t.to) : null,
        });
      }
    }
    // The other names a park had go to the dataset, not to the page: sixty parks' name lines are a tenth of the /venues page.
    const former = null;
    const facts = factsText({ capacity: p.capacity, opened: p.opened_year, surface: null, roof: null }, ctx.say);
    const id = `spring:${p.wikidata_id}`;
    const place = placeOf(p.city, p.region);
    rows.push({
      ...blank(), id, key: venueKey(null, p.latitude, p.longitude), slug: "", name: p.name, former, lat: p.latitude, lon: p.longitude,
      cc: p.country_code ?? ctx.country(p.latitude, p.longitude), place, wiki: wikiUrl(p.wikipedia_title), leagues: clubs.length ? ["mlb"] : [], clubs,
      opened: p.opened_year, closed: p.closed_year, capacity: p.capacity, from: p.first_year, to: p.in_use ? null : p.last_year, current: p.in_use,
      extra: [former, facts].filter((e): e is string => !!e), kind: "spring", tag: p.league, planned: null,
    });
    detail.set(id, { wid: p.wikidata_id, city: p.city, iso: p.region, names: p.names.map((n) => ({ name: n.name, from: n.from, until: n.to })) });
  }
  return { rows, detail };
}

/** The future venues as rows. A venue planned for clubs of leagues the list does not have is left out. */
export function futureRows(list: readonly FutureRow[], ctx: LayerContext): { rows: VenueRow[]; detail: Map<string, VenueDetail> } {
  const rows: VenueRow[] = [];
  const detail = new Map<string, VenueDetail>();
  for (const v of list) {
    if (v.latitude == null || v.longitude == null) continue;
    const clubs: VenueClub[] = [];
    for (const c of v.clubs) {
      if (!ctx.leagues.includes(c.league)) continue;
      if (clubs.some((x) => x.lg === c.league && (c.franchise_id ? x.f === c.franchise_id : x.f === 0 && x.name === c.club))) continue;
      clubs.push({
        lg: c.league, f: c.franchise_id ?? 0, name: c.club, href: c.franchise_id ? ctx.href(c.league, c.franchise_id) : "", from: v.planned_open_year, to: null,
        logo: c.franchise_id ? ctx.logo(c.franchise_id) : null,
      });
    }
    if (!clubs.length) continue;
    const facts = factsText({ capacity: v.capacity, opened: null, surface: null, roof: null }, ctx.say);
    const replaces = v.replaces_venue_name ? ctx.say("venuesPage.replaces", { name: v.replaces_venue_name }) : null;
    const id = `future:${v.venue_key}`;
    rows.push({
      ...blank(), id, key: venueKey(null, v.latitude, v.longitude), slug: "", name: v.name, former: null, lat: v.latitude, lon: v.longitude,
      cc: v.country_code ?? ctx.country(v.latitude, v.longitude), place: placeOf(v.city, v.region), wiki: wikiUrl(v.wikipedia_title), leagues: [], clubs,
      opened: null, closed: null, capacity: v.capacity, from: v.planned_open_year, to: null, current: false,
      extra: [replaces, facts].filter((e): e is string => !!e), kind: "future", tag: v.status, planned: v.planned_open_year,
    });
    detail.set(id, { wid: v.wikidata_id, city: v.city, iso: v.region, names: [] });
  }
  return { rows, detail };
}

/**
 * The /venues list as it travels from the server to the browser. The page is a kept copy drawn once, and everything it sends is part of
 * its HTML, so the rows go as one compact table: clubs, cities and conference/division strings are each listed once and the rows point at
 * them; whatever the browser can work out from the rest (leagues, current, years, the facts line, the map link, the Wikipedia link, most
 * of the address) is left out; an empty value is 0 and trailing empty values are dropped. `packVenues` checks every shortcut against the
 * original and sends the plain value when the shortcut would not give it back, so the rows that come out are exactly the rows that went in.
 *
 * Pure and import-light (types only), so a node script can test it.
 */
import type { Speaker } from "./i18n/i18n";
import { slugify } from "./slug.ts";
import { surfaceWord, type VenueState } from "./venueSurface.ts";
import type { VenueClub, VenueKind, VenueRow } from "./venueModel";
import { venueKey } from "./venueVisits.ts";

type Say = Speaker["say"];

/**
 * [league index, franchise id, name, 1 when the address is the name's usual slug, else the slug (or the whole address when it is not under /<league>/team/),
 * logo as `packLogo` writes it (0 when none)]. A club that wore two logos at the venue is listed twice, once for each.
 */
export type WireClub = [number, number, string, string | 1, string | 0];
/** [city and region, city page slug (0 when none)]. */
export type WirePlace = [string, string | 0];
/**
 * One venue: 0 name, 1 other names, 2 lat, 3 lon, 4 country, 5 place (index + 1), 6 Wikipedia (1 = the name, else the title),
 * 7 address (text, or [street] when it is the street plus the place and country), 8 map link (1 = by coordinates, else the link itself),
 * 9 opened, 10 closed, 11 capacity, 12 roof, 13 surface, 14 owner, 15 conference/division (indexes), 16 clubs (club index, from, to, ... flat),
 * 17 the page address when it is not just the name's slug (the name, a city or the Wikidata id came after it),
 * 18 the Wikidata id when the venue has one (else its key is made from the coordinates: venueVisits.ts),
 * 19 games played there (0 when not known), 20 the kind (1 spring training park, 2 future venue, 3 world soccer stadium; a home venue leaves it out),
 * 21 its tag (see TAGS), 22 the year a future venue is planned to open, 23 its state when the closing year does not say it (see STATES; 0 = closed when a closing year is known, else not given).
 * A spring training park or a future venue has no page of its own, so it has no page address (17); a soccer stadium has one, like a home venue.
 */
export type WireRow = (string | number | number[] | [string] | 0)[];
/** `s` is 1 when the database gives each home venue a status (migration 089): a home venue with no closing year is then open (field 23). */
export interface VenueWire { c: WireClub[]; p: WirePlace[]; a: string[]; v: WireRow[]; s?: 1 }

/** The words a spring training park's league or a future venue's status is sent as, by kind (the number is the position plus one). */
const TAGS: Record<"spring" | "future", readonly string[]> = { spring: ["cactus", "grapefruit"], future: ["proposed", "approved", "under_construction"] };
/**
 * The state a row carries when it is not the one its closing year implies: the number is the position plus one. A closing year means closed; a home venue with none is
 * open once the database gives the status at all (`w.s`, set when any home venue is open); any other row without a year has none.
 */
const STATES: readonly (VenueState | null)[] = ["open", "closed", "demolished", null];
const impliedState = (kind: VenueKind, closed: number | null, given: boolean): VenueState | null => (closed != null ? "closed" : kind === "home" && given ? "open" : null);
const KIND_CODE = { spring: 1, future: 2, soccer: 3 } as const;
/** A kind with no page of its own. */
const PAGELESS = new Set<VenueKind>(["spring", "future"]);

const WIKI = "https://en.wikipedia.org/wiki/";
const MAPS = "https://www.google.com/maps/search/?api=1&query=";
const mapsAt = (query: string) => `${MAPS}${encodeURIComponent(query)}`;
const LOGO_HOST: Record<string, string> = { T: "https://thumb.wikimedia.org/wikipedia/", U: "https://upload.wikimedia.org/wikipedia/" };
const LOGO_CREDIT = "&utm_campaign=imageinfo&utm_content=thumbnail";
const LOGO_SITE: Record<string, string> = { c: "?utm_source=commons.wikimedia.org", e: "?utm_source=en.wikipedia.org" };
const unpackLogoBy = (s: string): string => {
  if (s[0] === "=") return s.slice(1);
  let rest = s.slice(2);
  const star = Math.max(rest.lastIndexOf("*"), rest.lastIndexOf("+"));
  if (star >= 0) { const dir = rest.slice(0, star), px = rest.slice(star + 1), file = dir.slice(dir.lastIndexOf("/") + 1); rest = `${dir}/${px}px-${file}${rest[star] === "+" ? ".png" : ""}`; }
  return `${LOGO_HOST[s[0]]}${rest}${s[1] === "-" ? "" : `${LOGO_SITE[s[1]]}${LOGO_CREDIT}`}`;
};
/**
 * A logo address in a few characters less: the Wikimedia host and the credit query become one letter each and the file name, which a
 * thumbnail address writes twice, once (a vector file adds ".png" to the second). An address of any other shape (or one that would not come back identical) goes whole after "=".
 */
export function packLogo(url: string): string {
  const m = /^https:\/\/(thumb|upload)\.wikimedia\.org\/wikipedia\/([^?]*?)(?:\?utm_source=(commons\.wikimedia\.org|en\.wikipedia\.org)&utm_campaign=imageinfo&utm_content=thumbnail)?$/.exec(url);
  if (m) {
    const site = m[3] ? (m[3].startsWith("commons") ? "c" : "e") : "-";
    const dup = /^(.*\/([^/]+))\/(\d+)px-(.+)$/.exec(m[2]);
    const marked = dup && !/[*+]/.test(dup[1]);
    const rest = marked && dup[4] === dup[2] ? `${dup[1]}*${dup[3]}` : marked && dup[4] === `${dup[2]}.png` ? `${dup[1]}+${dup[3]}` : m[2];
    const out = `${m[1] === "thumb" ? "T" : "U"}${site}${rest}`;
    if (unpackLogoBy(out) === url) return out;
  }
  return `=${url}`;
}
export const unpackLogo = unpackLogoBy;
const wikiTitle = (name: string) => encodeURIComponent(name.replace(/ /g, "_"));

/** "65,500 seats · opened 2001 · natural grass · retractable roof · owner …": the facts line of the map panel, in the reader's language. */
export function factsText(f: { capacity: number | null; opened: number | null; surface: string | null; roof: string | null; owner?: string | null; state?: VenueState | null }, say: Say): string | null {
  const surface = surfaceWord(f.surface, say);
  const parts = [
    f.capacity != null ? say("venues.seats", { n: f.capacity.toLocaleString("en-US") }) : null,
    f.opened != null ? say("venues.opened", { year: f.opened }) : null,
    surface ? surface.toLocaleLowerCase() : null,
    f.roof === "retractable" ? say("venues.roofRetractable") : f.roof === "dome" ? say("venues.roofDome") : null,
    f.state === "demolished" ? say("venues.demolished") : null,
    f.owner ? say("venues.owner", { owner: f.owner }) : null,
  ].filter((x): x is string => !!x);
  return parts.length ? parts.join(" · ") : null;
}

/** Leagues, years and "current" of a venue, from its clubs. `order` is the page's league order. */
export function finishRow(r: VenueRow, order: readonly string[]): void {
  r.leagues = [...new Set(r.clubs.map((c) => c.lg))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  // A venue still to be built has no club playing there yet. A soccer stadium's "clubs" are its competitions, each with the years of its matches there; the stadium stands while one is open.
  r.current = r.kind !== "future" && r.clubs.some((c) => c.to == null);
  if (!r.clubs.length) { r.from = r.to = null; return; }
  r.from = r.clubs.some((c) => c.from == null) ? null : Math.min(...r.clubs.map((c) => c.from as number));
  r.to = r.current || r.kind === "future" ? null : r.clubs.some((c) => c.to == null) ? null : Math.max(...r.clubs.map((c) => c.to as number));
}

/** A club's address slug as it is usually made from the name ("Boston Bruins" is boston-bruins). */
const slugOf = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
/** 1 when the club's address is /<league>/team/<slug made from the name>, else the slug after /<league>/team/, else the whole address. */
const tail = (c: VenueClub): string | 1 => (c.href === `/${c.lg}/team/${slugOf(c.name)}` ? 1 : c.href.startsWith(`/${c.lg}/team/`) ? c.href.slice(`/${c.lg}/team/`.length) : c.href);
const clubHref = (lg: string, name: string, t: string | 1) => (t === "" ? "" : t === 1 ? `/${lg}/team/${slugOf(name)}` : t.startsWith("/") ? t : `/${lg}/team/${t}`);

/** The address written as the server writes it when the street line is the only part that varies. */
const composed = (street: string, place: string | null, cc: string | null, countryName: (cc: string) => string) =>
  [street, place, cc ? countryName(cc) : null].filter(Boolean).join(", ");

export function packVenues(rows: VenueRow[], leagues: string[], countryName: (cc: string) => string): VenueWire {
  const clubs = new Map<string, number>(), clubList: WireClub[] = [];
  const places = new Map<string, number>(), placeList: WirePlace[] = [];
  const alIdx = new Map<string, number>(), alList: string[] = [];
  const given = rows.some((r) => r.kind === "home" && r.state === "open");
  const v = rows.map((r) => {
    const place = r.place || r.citySlug ? `${r.place}|${r.citySlug}` : null;
    let pi = 0;
    if (place) {
      if (!places.has(place)) { places.set(place, placeList.length + 1); placeList.push([r.place ?? "", r.citySlug ?? 0]); }
      pi = places.get(place)!;
    }
    const flat: number[] = [];
    for (const c of r.clubs) {
      const k = `${c.lg}|${c.f}|${c.logo ?? ""}${c.f ? "" : `|${c.name}`}`;
      if (!clubs.has(k)) { clubs.set(k, clubList.length); clubList.push([leagues.indexOf(c.lg), c.f, c.name, tail(c), c.logo ? packLogo(c.logo) : 0]); }
      flat.push(clubs.get(k)!, c.from ?? 0, c.to ?? 0);
    }
    const wiki = r.wiki === null ? 0 : r.wiki === `${WIKI}${wikiTitle(r.name)}` ? 1 : r.wiki.startsWith(WIKI) ? r.wiki.slice(WIKI.length) : r.wiki;
    let address: WireRow[number] = 0;
    if (r.address) {
      const street = r.address.endsWith(composed("", r.place, r.cc, countryName)) && composed("", r.place, r.cc, countryName)
        ? r.address.slice(0, r.address.length - composed("", r.place, r.cc, countryName).length).replace(/, $/, "") : null;
      address = street !== null && composed(street, r.place, r.cc, countryName) === r.address ? [street] : r.address;
    }
    let href: WireRow[number] = 0;
    if (r.addressHref && r.address) {
      const byText = mapsAt(r.address), byCoords = mapsAt(`${r.lat},${r.lon}`);
      href = r.addressHref === byText ? 0 : r.addressHref === byCoords ? 1 : r.addressHref;
    } else if (r.addressHref) href = r.addressHref;
    const al = r.al.map((a) => {
      if (!alIdx.has(a)) { alIdx.set(a, alList.length); alList.push(a); }
      return alIdx.get(a)!;
    });
    const kind = r.kind === "home" ? 0 : KIND_CODE[r.kind];
    const tag = (r.kind === "spring" || r.kind === "future") && r.tag ? TAGS[r.kind].indexOf(r.tag) + 1 : 0;
    const row: WireRow = [r.name, r.former ?? 0, r.lat, r.lon, r.cc ?? 0, pi, wiki, address, href, r.opened ?? 0, r.closed ?? 0, r.capacity ?? 0, r.roof ?? 0, r.surface ?? 0, r.owner ?? 0, al, flat,
      PAGELESS.has(r.kind) || r.slug === slugify(r.name) ? 0 : r.slug, r.key.startsWith("Q") ? r.key : 0, r.games ?? 0, kind, tag, r.planned ?? 0,
      r.state === impliedState(r.kind, r.closed, given) ? 0 : STATES.indexOf(r.state) + 1];
    while (row.length && (row[row.length - 1] === 0 || (Array.isArray(row[row.length - 1]) && (row[row.length - 1] as number[]).length === 0))) row.pop();
    return row;
  });
  return given ? { c: clubList, p: placeList, a: alList, v, s: 1 } : { c: clubList, p: placeList, a: alList, v };
}

export function unpackVenues(w: VenueWire, leagues: string[], say: Say, countryName: (cc: string) => string): VenueRow[] {
  return w.v.map((x, i) => {
    const cc = (x[4] as string) || null;
    const pl = x[5] ? w.p[(x[5] as number) - 1] : null;
    const place = pl ? pl[0] || null : null;
    const name = x[0] as string;
    const wiki = x[6] === 1 ? `${WIKI}${wikiTitle(name)}` : x[6] ? (x[6] as string).startsWith("http") ? (x[6] as string) : `${WIKI}${x[6]}` : null;
    const a = x[7];
    const lat = x[2] as number, lon = x[3] as number;
    const address = Array.isArray(a) ? composed((a as [string])[0], place, cc, countryName) : a ? (a as string) : null;
    const h = x[8];
    const addressHref = typeof h === "string" ? h : address ? mapsAt(h === 1 ? `${lat},${lon}` : address) : null;
    const flat = (x[16] as number[] | undefined) ?? [];
    const kind: VenueKind = x[20] === 1 ? "spring" : x[20] === 2 ? "future" : x[20] === 3 ? "soccer" : "home";
    const clubs: VenueClub[] = [];
    for (let j = 0; j < flat.length; j += 3) {
      const [li, f, cn, t, logo] = w.c[flat[j]];
      const lg = leagues[li];
      clubs.push({ lg, f, name: cn, href: clubHref(lg, cn, t), from: flat[j + 1] || null, to: flat[j + 2] || null, logo: logo ? unpackLogo(logo) : null });
    }
    const former = (x[1] as string) || null;
    const opened = (x[9] as number) || null, capacity = (x[11] as number) || null;
    const roof = (x[12] as string) || null, surface = (x[13] as string) || null, owner = (x[14] as string) || null;
    const closed = (x[10] as number) || null;
    const state = x[23] ? STATES[(x[23] as number) - 1] ?? null : impliedState(kind, closed, w.s === 1);
    const facts = factsText({ capacity, opened, surface, roof, owner, state }, say);
    const row: VenueRow = {
      id: String(i), key: venueKey(typeof x[18] === "string" ? x[18] : null, x[2] as number, x[3] as number), slug: PAGELESS.has(kind) ? "" : typeof x[17] === "string" ? x[17] : slugify(name), name, former, lat, lon, cc, place, citySlug: pl && pl[1] ? (pl[1] as string) : null, wiki, address, addressHref,
      leagues: [], clubs, opened, closed, state, capacity, roof, surface, owner, from: null, to: null, current: false,
      al: ((x[15] as number[] | undefined) ?? []).map((k) => w.a[k]), extra: [former, facts].filter((e): e is string => !!e),
      kind, tag: (kind !== "spring" && kind !== "future") || !x[21] ? null : TAGS[kind][(x[21] as number) - 1] ?? null, planned: (x[22] as number) || null, games: (x[19] as number) || null,
    };
    finishRow(row, leagues);
    return row;
  });
}

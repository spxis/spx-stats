import "server-only";
import { cache } from "react";
import { z } from "zod";
import { checkRows, rows } from "./api/client";
import type { Speaker } from "./i18n/i18n";
import { COUNTRY_KEY } from "../components/countryKey";
import { countryAt } from "./country";
import { formatVenueAddress, type VenueAddress } from "./venueAddress";
import type { VenuePlace } from "./venuePlace";
import type { VenueState } from "./venueSurface";
import { factsText } from "./venueWire";
import { infoRowsFromPack, nameRowsFromPack } from "./venuePack";
import { getVenuePack } from "./venuePackRead";

type Say = Speaker["say"];

/** A name a venue carried and the years it applied; `until` is null for the name now. */
export interface VenueSpan { name: string; from: number | null; until: number | null; current: boolean }
/**
 * Capacity, year opened and closed, owner, surface (a code from the fixed list, else the source's text before migration 089), the surface text as the source gave it,
 * roof, open/closed/demolished status, street address and postal code of a venue; any part can be missing.
 */
export interface VenueFacts {
  capacity: number | null; opened: number | null; closed: number | null; owner: string | null; surface: string | null; surfaceRaw: string | null; roof: string | null;
  state: VenueState | null; address: string | null; postal: string | null;
}

const nameRow = z.object({ wikidata_id: z.string(), name: z.string(), from_year: z.number().nullable(), until_year: z.number().nullable(), is_current: z.boolean() });
const infoRow = z.object({
  wikidata_id: z.string(), capacity: z.number().nullable(), opened_year: z.number().nullable(), closed_year: z.number().nullable().optional(), owner: z.string().nullable(),
  surface: z.string().nullable(), roof: z.string().nullable(), address: z.string().nullable(), postal_code: z.string().nullable().optional(),
  /** Migration 089; absent from a database without it. */
  surface_raw: z.string().nullable().optional(), status: z.enum(["open", "closed", "demolished"]).nullable().optional(),
});

/** A name that starts before the next one ends is cut at the next one's start, so each year has one name. */
function settle(spans: VenueSpan[]): VenueSpan[] {
  const s = [...spans].sort((a, b) => (a.from ?? -1) - (b.from ?? -1));
  return s.map((x, i) => {
    const next = s.slice(i + 1).find((y) => (y.from ?? -1) > (x.from ?? -1));
    const until = next?.from != null && (x.until == null || x.until > next.from) ? next.from : x.until;
    return { ...x, until };
  });
}

/**
 * The names of every home venue, by Wikidata id (api.venue_place.wikidata_id), oldest first, from api.venue_pack (migration 181) or, while that is a 404, api.venue_name
 * (migration 052); until neither is on the server, or if it cannot be read, this is empty and the pages show the venue names they showed before.
 */
export const getVenueNames = cache(async (): Promise<Map<string, VenueSpan[]>> => {
  const out = new Map<string, VenueSpan[]>();
  try {
    const pack = await getVenuePack();
    const names = pack ? checkRows("venue_pack", nameRowsFromPack(pack), nameRow)
      : await rows("venue_name", "select=wikidata_id,name,from_year,until_year,is_current&order=wikidata_id,from_year.nullsfirst,name", nameRow);
    for (const r of names) {
      const list = out.get(r.wikidata_id) ?? [];
      list.push({ name: r.name, from: r.from_year, until: r.until_year, current: r.is_current });
      out.set(r.wikidata_id, list);
    }
    for (const [k, v] of out) out.set(k, settle(v));
  } catch {
    out.clear();
  }
  return out;
});

const INFO_COLUMNS = "wikidata_id,capacity,opened_year,closed_year,owner,surface,roof,address";

/**
 * The facts of every home venue, by Wikidata id (api.venue_info, migration 052). Its postal_code column is migration 058, and surface_raw and status
 * are migration 089: until a column is on the server the facts come without it (the surface then reads as the text the source gave); empty if the view is missing.
 */
export const getVenueFacts = cache(async (): Promise<Map<string, VenueFacts>> => {
  const out = new Map<string, VenueFacts>();
  let list: z.infer<typeof infoRow>[] = [];
  let pack: Awaited<ReturnType<typeof getVenuePack>> = null;
  try {
    pack = await getVenuePack();
  } catch {
    return out;
  }
  if (pack) {
    try {
      list = checkRows("venue_pack", infoRowsFromPack(pack), infoRow);
    } catch {
      list = [];
    }
  } else {
    for (const extra of [",postal_code,surface_raw,status", ",postal_code", ""]) {
      try {
        list = await rows("venue_info", `select=${INFO_COLUMNS}${extra}&order=wikidata_id`, infoRow);
        break;
      } catch {
        list = [];
      }
    }
  }
  for (const r of list) {
    out.set(r.wikidata_id, {
      capacity: r.capacity, opened: r.opened_year, closed: r.closed_year ?? null, owner: r.owner, surface: r.surface, surfaceRaw: r.surface_raw ?? null, roof: r.roof,
      state: r.status ?? null, address: r.address, postal: r.postal_code ?? null,
    });
  }
  return out;
});

/** The name a venue had in a year: the latest name that had begun by then and not ended; `fallback` (today's name) where none applies. */
export function nameIn(spans: VenueSpan[] | undefined, year: number | null | undefined, fallback: string): string {
  if (!spans?.length || year == null) return fallback;
  const hit = spans.filter((s) => (s.from == null || s.from <= year) && (s.until == null || s.until >= year));
  return hit.at(-1)?.name ?? fallback;
}

const yy = (n: number | null) => (n == null ? "" : String(n));

/** Every name with its years, oldest first, e.g. "Seahawks Stadium 2002–2004 · Qwest Field 2004–2011"; null when the venue has had only one name. */
export function namesLine(spans: VenueSpan[] | undefined): string | null {
  if (!spans || spans.length < 2) return null;
  return spans.map((s) => `${s.name} ${yy(s.from)}–${yy(s.until)}`).join(" · ");
}

/** The name now, when it is not the name given. */
export function nowName(spans: VenueSpan[] | undefined, shown: string): string | null {
  const now = spans?.find((s) => s.current)?.name;
  return now && now !== shown ? now : null;
}

/** "67,000 seats · opened 2002 · artificial turf · retractable roof · owner Washington State Public Stadium Authority", in the reader's language (surface and owner are the names Wikidata gives). */
export function factsLine(f: VenueFacts | undefined, say: Say): string | null {
  return f ? factsText(f, say) : null;
}

/**
 * A home venue's address in the one format the site uses: the street line from Wikidata, the city and region from api.venue_place,
 * the postal code Wikidata gives (checked when it was loaded, and again here), and the country (from the place, else from the
 * coordinates) in the reader's language. Null when none of it is known.
 */
export function placeAddress(at: VenuePlace | undefined, f: VenueFacts | undefined, lat: number | null | undefined, lon: number | null | undefined, say: Say): VenueAddress | null {
  const cc = at?.cc ?? countryAt(lat, lon);
  const key = cc ? COUNTRY_KEY[cc.toUpperCase()] : undefined;
  return formatVenueAddress({ street: f?.address, city: at?.city, region: at?.region, postal: f?.postal, countryCode: cc, country: key ? say(key) : null });
}

/** The lines the map's selection panel adds under a venue: its other names and its facts (the address comes apart, from placeAddress). */
export function venueExtra(spans: VenueSpan[] | undefined, f: VenueFacts | undefined, shown: string, say: Say): string[] {
  const now = nowName(spans, shown);
  return [now ? say("venues.now", { name: now }) : null, namesLine(spans), factsLine(f, say)].filter((x): x is string => !!x);
}

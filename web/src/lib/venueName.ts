import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import type { Speaker } from "./i18n/i18n";

type Say = Speaker["say"];

/** A name a venue carried and the years it applied; `until` is null for the name now. */
export interface VenueSpan { name: string; from: number | null; until: number | null; current: boolean }
/** Capacity, year opened, owner, surface, roof and street address of a venue; any part can be missing. */
export interface VenueFacts { capacity: number | null; opened: number | null; owner: string | null; surface: string | null; roof: string | null; address: string | null }

const nameRow = z.object({ wikidata_id: z.string(), name: z.string(), from_year: z.number().nullable(), until_year: z.number().nullable(), is_current: z.boolean() });
const infoRow = z.object({
  wikidata_id: z.string(), capacity: z.number().nullable(), opened_year: z.number().nullable(), owner: z.string().nullable(),
  surface: z.string().nullable(), roof: z.string().nullable(), address: z.string().nullable(),
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
 * The names of every home venue, by Wikidata id (api.venue_place.wikidata_id), oldest first. The view comes with migration 052;
 * until it is on the server, or if it cannot be read, this is empty and the pages show the venue names they showed before.
 */
export const getVenueNames = cache(async (): Promise<Map<string, VenueSpan[]>> => {
  const out = new Map<string, VenueSpan[]>();
  try {
    for (const r of await rows("venue_name", "select=wikidata_id,name,from_year,until_year,is_current&order=wikidata_id,from_year.nullsfirst,name", nameRow)) {
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

/** The facts of every home venue, by Wikidata id (api.venue_info, migration 052); empty if the view is missing. */
export const getVenueFacts = cache(async (): Promise<Map<string, VenueFacts>> => {
  const out = new Map<string, VenueFacts>();
  try {
    for (const r of await rows("venue_info", "select=wikidata_id,capacity,opened_year,owner,surface,roof,address&order=wikidata_id", infoRow)) {
      out.set(r.wikidata_id, { capacity: r.capacity, opened: r.opened_year, owner: r.owner, surface: r.surface, roof: r.roof, address: r.address });
    }
  } catch {
    out.clear();
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
  if (!f) return null;
  const parts = [
    f.capacity != null ? say("venues.seats", { n: f.capacity.toLocaleString("en-US") }) : null,
    f.opened != null ? say("venues.opened", { year: f.opened }) : null,
    f.surface,
    f.roof === "retractable" ? say("venues.roofRetractable") : f.roof === "dome" ? say("venues.roofDome") : null,
    f.owner ? say("venues.owner", { owner: f.owner }) : null,
  ].filter((x): x is string => !!x);
  return parts.length ? parts.join(" · ") : null;
}

/** The lines the map's selection panel adds under a venue: its other names, its facts and its address. */
export function venueExtra(spans: VenueSpan[] | undefined, f: VenueFacts | undefined, shown: string, say: Say): string[] {
  const now = nowName(spans, shown);
  return [now ? say("venues.now", { name: now }) : null, namesLine(spans), factsLine(f, say), f?.address ?? null].filter((x): x is string => !!x);
}

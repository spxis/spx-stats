import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";

/** Where a home venue stands and its Wikipedia article, from api.venue_place; any part can be missing. */
/** `region` is the state or province code alone ("QC"); `iso` is the whole ISO 3166-2 code ("CA-QC"). */
export interface VenuePlace { city: string | null; region: string | null; iso: string | null; place: string | null; wiki: string | null; wid: string | null; cc: string | null }

const placeRow = z.object({
  franchise_id: z.number(), home_venue: z.string(), latitude: z.number(), longitude: z.number(),
  city: z.string().nullable(), region: z.string().nullable(), country_code: z.string().nullable().optional(), wikipedia_title: z.string().nullable(), wikidata_id: z.string().nullable(),
});

/** The key a brand row's venue is found by: the same name and coordinates api.team_brand gives. */
export function placeKey(f: number, venue: string | null, lat: number | null, lon: number | null): string | null {
  return venue && lat != null && lon != null ? `${f}|${venue}|${lat.toFixed(5)}|${lon.toFixed(5)}` : null;
}

/**
 * The city, state or province and Wikipedia page of every home venue of a league's clubs. The view comes with migration 035; until
 * it is on the server, or if it cannot be read, this is empty and the pages simply show what they showed before.
 */
export const getVenuePlaces = cache(async (lg: string): Promise<Map<string, VenuePlace>> => {
  const out = new Map<string, VenuePlace>();
  try {
    for (const r of await rows("venue_place", `league=eq.${lg}&select=franchise_id,home_venue,latitude,longitude,city,region,country_code,wikipedia_title,wikidata_id&order=franchise_id,home_venue`, placeRow)) {
      const key = placeKey(r.franchise_id, r.home_venue, r.latitude, r.longitude);
      if (!key) continue;
      const abbr = r.region?.split("-")[1] ?? null;
      out.set(key, {
        wid: r.wikidata_id, cc: r.country_code ?? null, city: r.city, region: abbr, iso: r.region, place: [r.city, abbr].filter(Boolean).join(", ") || null,
        wiki: r.wikipedia_title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(r.wikipedia_title.replace(/ /g, "_"))}` : null,
      });
    }
  } catch {
    out.clear();
  }
  return out;
});

import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import type { BrandMap } from "./brand";
import { countryAt } from "./country";
import { abbrFor, type AbbrMap } from "./abbr";
import type { AlignmentRow } from "./alignment";
import { getVenuePlaces, placeKey, type VenuePlace } from "./venuePlace";
import { placeFor } from "./venue";
import type { Pin } from "@/components/mapDraw";
import type { TeamPaths } from "./slug";

/** A venue a club used, with the years of the brand eras it was named in and where it stands. */
export interface VenueStop { venue: string; from: string | null; to: string | null; lat: number; lon: number; cc: string | null; place: string | null }
/** A club with a venue on record: its address slug, its latest name and its venues, oldest first. */
export interface VenueTeam { f: number; slug: string; name: string; venues: VenueStop[] }

const nameRow = z.object({ franchise_id: z.number(), name: z.string(), name_from: z.string().nullable() });

const getNames = cache(async (lg: string) =>
  rows("franchise_names", `league=eq.${lg}&select=franchise_id,name,name_from&order=franchise_id,name_from.nullsfirst`, nameRow).catch(() => []));

/**
 * Every club of a league that has a venue with coordinates, for the venue map's team choice. Brand eras that name the same
 * venue are one stop, from the first year to the last (open if any is). Locations come from the brand rows, which carry
 * only the venue name and coordinates; the city and state come from api.venue_place.
 */
export async function getVenueTeams(lg: string, brands: BrandMap, paths: TeamPaths): Promise<VenueTeam[]> {
  const names = new Map<number, string>();
  const [named, places] = await Promise.all([getNames(lg), getVenuePlaces(lg)]);
  for (const n of named) names.set(n.franchise_id, n.name);
  const out: VenueTeam[] = [];
  for (const [id, eras] of Object.entries(brands)) {
    const f = Number(id);
    const stops = new Map<string, VenueStop>();
    const placed = eras.filter((b) => b.league === lg && b.home_venue && b.latitude != null && b.longitude != null)
      .sort((a, b) => (a.brand_from ?? "").localeCompare(b.brand_from ?? ""));
    for (const b of placed) {
      const key = `${b.home_venue}|${b.latitude}|${b.longitude}`;
      const s = stops.get(key);
      if (!s) {
        stops.set(key, { venue: b.home_venue!, from: b.brand_from, to: b.brand_to, lat: b.latitude!, lon: b.longitude!, cc: countryAt(b.latitude, b.longitude),
          place: places.get(placeKey(f, b.home_venue, b.latitude, b.longitude) ?? "")?.place ?? null });
      } else {
        s.to = s.to && b.brand_to ? (b.brand_to > s.to ? b.brand_to : s.to) : null;
      }
    }
    if (stops.size) out.push({ f, slug: paths.slug(lg, f), name: names.get(f) ?? paths.slug(lg, f), venues: [...stops.values()] });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "en"));
}

/** The map dots of a season's clubs: where each played that year, with its abbreviation, venue, place and conference and division. */
export function clubPins(o: {
  year: number; me: number; clubs: { franchise_id: number; team: string | null }[]; brands: BrandMap; abbrs: AbbrMap;
  alignment: AlignmentRow[]; places: Map<string, VenuePlace>; href: (f: number) => string; slug?: (f: number) => string;
}): Pin[] {
  const seen = new Set<number>();
  return o.clubs.flatMap((c) => {
    if (seen.has(c.franchise_id)) return [];
    seen.add(c.franchise_id);
    const b = placeFor(o.brands, c.franchise_id, o.year);
    const al = o.alignment.find((a) => a.franchise_id === c.franchise_id);
    if (!b || b.latitude == null || b.longitude == null) return [];
    const vp = o.places.get(placeKey(c.franchise_id, b.home_venue, b.latitude, b.longitude) ?? "");
    return [{
      f: c.franchise_id, name: c.team ?? "", abbr: abbrFor(o.abbrs, c.franchise_id, o.year, c.team), lat: b.latitude, lon: b.longitude, venue: b.home_venue,
      place: vp?.place, wiki: vp?.wiki, slug: o.slug?.(c.franchise_id), href: o.href(c.franchise_id), me: c.franchise_id === o.me, cc: countryAt(b.latitude, b.longitude),
      conf: al?.conference_short ?? al?.conference, div: al?.division_short ?? al?.division,
    }];
  });
}

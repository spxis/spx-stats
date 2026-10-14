/**
 * Where each franchise plays now (or played last): the country, the city and the point the map puts it at. Read off the city of its latest
 * season (api.team_season_city, db/build/197_city.sql), never guessed: a franchise with no placed season has none. Pure, so a node script tests it.
 */
import { unitOf, type CityRef, type Placement } from "./cityModel.ts";

export interface Home {
  /** ISO 3166-1 country code of the city (ref.city.country_code). */
  cc: string;
  /** The city's slug and its name, French where the city has one and `french` is set. */
  city: string;
  name: string;
  /** The region as ISO 3166-2 gives it ("US-MI"), and the part after the dash ("MI"). */
  region: string;
  /** The point for the map: the home venue of that season, else the city's own point. */
  lat: number | null;
  lon: number | null;
}

/** "league|franchise" to its home. A venue that Wikidata puts in another metro area than the club's city is a mistake in the venue years (the Celtics at Hartford): the city's point is used instead. */
export function latestHomes(placements: readonly Placement[], cities: readonly CityRef[], french = false): Map<string, Home> {
  const by = new Map(cities.map((c) => [c.slug, c]));
  const newest = new Map<string, Placement>();
  for (const p of placements) {
    const k = `${p.league}|${p.f}`;
    const had = newest.get(k);
    if (!had || p.year >= had.year) newest.set(k, p);
  }
  const out = new Map<string, Home>();
  for (const [k, p] of newest) {
    const c = by.get(p.city);
    if (!c) continue;
    const venueCity = p.venueCity ? by.get(p.venueCity) : null;
    const venueOk = p.venueLat != null && p.venueLon != null && (!venueCity || unitOf(venueCity) === unitOf(c));
    out.set(k, {
      cc: c.country, city: c.slug, name: french && c.nameFr ? c.nameFr : c.name, region: c.region.split("-")[1] ?? c.region,
      lat: venueOk ? p.venueLat : c.lat, lon: venueOk ? p.venueLon : c.lon,
    });
  }
  return out;
}

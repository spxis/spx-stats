import { z } from "zod";

/**
 * The home venues' places, facts and names as api.venue_pack gives them (migration 181): one row of columns of short arrays, one entry for each row of
 * api.venue_place, api.venue_info and api.venue_name, in the order the site read those views in. Read in one request instead of three.
 */
const strN = z.string().nullable();
const intN = z.number().nullable();
const strs = z.array(z.string());
const strNs = z.array(strN);
const intNs = z.array(intN);

export const venuePackSchema = z.object({
  place_league: strs, place_franchise_id: z.array(z.number()), place_home_venue: strs, place_latitude: z.array(z.number()), place_longitude: z.array(z.number()),
  place_city: strNs, place_region: strNs, place_country_code: strNs, place_wikipedia_title: strNs, place_wikidata_id: strNs,
  info_wikidata_id: strs, info_capacity: intNs, info_opened_year: intNs, info_closed_year: intNs, info_owner: strNs, info_surface: strNs, info_roof: strNs,
  info_address: strNs, info_postal_code: strNs, info_surface_raw: strNs, info_status: strNs,
  name_wikidata_id: strs, name_name: strs, name_from_year: intNs, name_until_year: intNs, name_is_current: z.array(z.boolean()),
});
export type VenuePack = z.infer<typeof venuePackSchema>;

function same(label: string, ...lists: readonly (readonly unknown[])[]): number {
  const n = lists[0].length;
  if (lists.some((l) => l.length !== n)) throw new Error(`venue_pack: the ${label} columns are not the same length`);
  return n;
}

/** The rows of api.venue_place, in the order of league, franchise_id, home_venue and wikidata_id. */
export function placeRowsFromPack(p: VenuePack) {
  const n = same("place", p.place_league, p.place_franchise_id, p.place_home_venue, p.place_latitude, p.place_longitude, p.place_city, p.place_region, p.place_country_code, p.place_wikipedia_title, p.place_wikidata_id);
  return Array.from({ length: n }, (_, i) => ({
    league: p.place_league[i], franchise_id: p.place_franchise_id[i], home_venue: p.place_home_venue[i], latitude: p.place_latitude[i], longitude: p.place_longitude[i],
    city: p.place_city[i], region: p.place_region[i], country_code: p.place_country_code[i], wikipedia_title: p.place_wikipedia_title[i], wikidata_id: p.place_wikidata_id[i],
  }));
}

/** The rows of api.venue_info, in the order of wikidata_id. */
export function infoRowsFromPack(p: VenuePack) {
  const n = same("info", p.info_wikidata_id, p.info_capacity, p.info_opened_year, p.info_closed_year, p.info_owner, p.info_surface, p.info_roof, p.info_address, p.info_postal_code, p.info_surface_raw, p.info_status);
  return Array.from({ length: n }, (_, i) => ({
    wikidata_id: p.info_wikidata_id[i], capacity: p.info_capacity[i], opened_year: p.info_opened_year[i], closed_year: p.info_closed_year[i], owner: p.info_owner[i],
    surface: p.info_surface[i], roof: p.info_roof[i], address: p.info_address[i], postal_code: p.info_postal_code[i], surface_raw: p.info_surface_raw[i], status: p.info_status[i],
  }));
}

/** The rows of api.venue_name, in the order of wikidata_id, from_year (none first) and name. */
export function nameRowsFromPack(p: VenuePack) {
  const n = same("name", p.name_wikidata_id, p.name_name, p.name_from_year, p.name_until_year, p.name_is_current);
  return Array.from({ length: n }, (_, i) => ({
    wikidata_id: p.name_wikidata_id[i], name: p.name_name[i], from_year: p.name_from_year[i], until_year: p.name_until_year[i], is_current: p.name_is_current[i],
  }));
}

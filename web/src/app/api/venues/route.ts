import { respond } from "@/lib/apiResponse";
import { listVenues } from "@/lib/venueData";

/**
 * GET /api/venues: the home venues behind /venues, read-only JSON. Unknown parameters are ignored; a bad one is a 400 that names it.
 *   kind=home|spring|future, a comma list of them (kind=home,future) or all: home venues, spring training parks (Arizona's Cactus League, Florida's Grapefruit League) or venues planned for a club;
 *     left out, home only (the answer before 0.88.0); a value that is none of these, or one listed twice, is a 400 naming kind
 *   league=nhl|nba|mlb|nfl|cfl   q=<words of a venue name (or a former name), a city or a club, accents ignored>
 *   status=current|former: a club plays there now, or none does   nat=<two-letter country code, e.g. CA>
 *   from=<year> to=<year>   whole years 1800..2100, from not after to: keeps venues a club used in any year from..to; a venue whose years are unknown is kept; either alone leaves the other end open
 *   sort=name|city|country|league|years|opened|closed|games|capacity|clubs, each .asc or .desc, up to three, e.g. capacity.desc,name  (default name.asc; years is the first year used; empty values come last)
 *   limit=1..200 (50)   offset=n   after=<page.next of the previous page>   fields=name,city,... (id is always there)
 * Response: { data: [{ id (the Wikidata id, else geo:<lat>,<lon>), wikidata_id, name, former_names [{ name, from, until }], latitude, longitude, city, region (ISO 3166-2), country (ISO 3166-1 alpha-2),
 *   leagues, clubs [{ league, franchise_id, name, from, to }], first_year, last_year, current, opened, closed, capacity, roof, surface, wikipedia_title,
 *   kind (home|spring|future), status (a future venue's: proposed|approved|under_construction), spring_league (cactus|grapefruit), planned_open_year (as the source says; null if none), games (played there, on record) }], page: { limit, offset, sort, next, total } }.
 * Page with offset (total is counted) or follow page.next with after= (keyset: steady while the data changes, total is null).
 * Licence: Wikidata-derived fields are CC0 1.0; surface and roof may come from English Wikipedia (CC BY-SA 4.0, credit the article in wikipedia_title); see https://spxn.com/sources.
 * The whole list is also a download: /venues.csv and /venues.geojson, which are complete files (every kind, with a kind column), not filtered. Cached an hour. 429 and 502 carry Retry-After.
 */
export const GET = (request: Request) => respond(() => listVenues(new URL(request.url).searchParams));

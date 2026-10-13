import "server-only";
import { speaker } from "./i18n/i18n";
import { afterValues, parseListParams } from "./listParams";
import { searchWords } from "./listQuery";
import { memo } from "./memo";
import { getPaths } from "./teamSlugs";
import { getVenueList } from "./venueList";
import { queryVenues, RECORD_FIELDS, venueOrder, venueRecords, VENUE_SORTS, type VenuePage, type VenueQuery, type VenueRecord } from "./venueDataset";

/* The open dataset of home venues: the same list /venues draws (venueList.ts), in English, as records. The downloads and GET /api/venues only read it. */

const HOLD = 5 * 60_000;
const en = speaker("en");

/** Every venue as a record, kept a few minutes per server instance (the routes are also kept an hour by the CDN). */
export const getVenueRecords = memo(HOLD, async (): Promise<VenueRecord[]> => {
  const { rows, detail } = await getVenueList(await getPaths(), en.say);
  return venueRecords(rows, detail);
});

/** The page GET /api/venues answers: the query string checked (a bad value is a BadParams naming it), then the records filtered, sorted and cut. */
export async function listVenues(sp: URLSearchParams): Promise<VenuePage> {
  const { values: v, sort, sortText, fields, range } = parseListParams("venues", sp, { sorts: VENUE_SORTS, fields: RECORD_FIELDS, defSort: "name.asc" });
  const order = venueOrder(sort);
  const after = afterValues(v.after, sortText, order);
  const query: VenueQuery = { league: v.league, words: searchWords(v.q ?? ""), status: v.status, nat: v.nat, ...range };
  return queryVenues(await getVenueRecords(), query, { order, sortText, fields, limit: v.limit, offset: v.offset, after });
}

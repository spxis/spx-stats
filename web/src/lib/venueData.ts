import "server-only";
import { speaker } from "./i18n/speaker";
import { afterValues, BadParams, parseListParams } from "./listParams";
import { searchWords } from "./listQuery";
import { memo } from "./memo";
import { getPaths } from "./teamSlugs";
import { getVenueList } from "./venueList";
import { getVenueWikiCites } from "./venueName";
import { queryVenues, readKinds, RECORD_FIELDS, venueOrder, venueRecords, VENUE_SORTS, type VenuePage, type VenueQuery, type VenueRecord } from "./venueDataset";

/* The open dataset of home venues: the same list /venues draws (venueList.ts), in English, as records. The downloads and GET /api/venues only read it. */

const HOLD = 5 * 60_000;
const en = speaker("en");

/** The list /venues draws, in English, kept a few minutes per server instance (the routes are also kept an hour by the CDN). */
const getEnglishList = memo(HOLD, async () => getVenueList(await getPaths(), en.say));

/** Which facts of each home venue came from the English Wikipedia infobox, kept like the list. */
const getCites = memo(HOLD, getVenueWikiCites);

/** Every venue as a record. */
export const getVenueRecords = async (): Promise<VenueRecord[]> => {
  const [{ rows, detail }, cites] = await Promise.all([getEnglishList(), getCites()]);
  return venueRecords(rows, detail, cites);
};

/** The address of every venue's page (/venue/<slug>), for the sitemap. */
export const getVenueSlugs = async (): Promise<string[]> => {
  const { rows, unplaced } = await getEnglishList();
  return [...rows, ...unplaced].filter((r) => r.kind === "home" || r.kind === "soccer").map((r) => r.slug);
};

/** The page GET /api/venues answers: the query string checked (a bad value is a BadParams naming it), then the records filtered, sorted and cut. */
export async function listVenues(sp: URLSearchParams): Promise<VenuePage> {
  const { values: v, sort, sortText, fields, range } = parseListParams("venues", sp, { sorts: VENUE_SORTS, fields: RECORD_FIELDS, defSort: "name.asc" });
  const order = venueOrder(sort);
  const after = afterValues(v.after, sortText, order);
  const kinds = readKinds(v.kind);
  if (!kinds.ok) throw new BadParams([{ param: "kind", message: kinds.message }]);
  const query: VenueQuery = { kind: kinds.kinds, league: v.league, words: searchWords(v.q ?? ""), status: v.status, nat: v.nat, ...range };
  return queryVenues(await getVenueRecords(), query, { order, sortText, fields, limit: v.limit, offset: v.offset, after });
}

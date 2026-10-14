import "server-only";
import { currentSpeaker } from "./i18n/currentLocale";
import { memo } from "./memo";
import { getPaths } from "./teamSlugs";
import type { VenueDetail } from "./venueDataset";
import { getVenueList } from "./venueList";
import type { VenueRow } from "./venueModel";
import { resolveVenue } from "./venueSlug";
import type { SoccerVenue } from "./venueSoccerRows";

/** A venue's row in the /venues list, with what the open dataset adds to it and, for a stadium that staged World Cup or MLS matches, what the archive holds of them. */
export interface VenueEntry { row: VenueRow; detail: VenueDetail; soccer: SoccerVenue | null }

/** What a venue's page is drawn from: every venue by its page address, and the address of each venue that has a Wikidata id. */
export interface VenueIndex {
  bySlug: Map<string, VenueEntry>;
  /** The page address of the venue with a Wikidata id (upper case). */
  byWid: Map<string, string>;
}

const HOLD = 5 * 60_000;
const held = new Map<string, () => Promise<VenueIndex>>();

/**
 * The venues of the /venues list in the reader's language, found by address: the home venues, and the world soccer stadiums (those with no coordinates
 * included: they have a page, not a dot). Kept a few minutes per server instance and language, so a crowd of venue pages drawn together (a crawler walking
 * the sitemap) builds the list once, not once per page; each page is kept a day.
 */
export async function getVenueIndex(): Promise<VenueIndex> {
  const { say, locale } = await currentSpeaker();
  let load = held.get(locale);
  if (!load) {
    load = memo(HOLD, async () => {
      const { rows, detail, soccer, unplaced } = await getVenueList(await getPaths(), say, locale);
      const bySlug = new Map<string, VenueEntry>();
      const byWid = new Map<string, string>();
      for (const row of [...rows, ...unplaced]) {
        if (row.kind !== "home" && row.kind !== "soccer") continue;
        const d = detail.get(row.id) ?? { wid: null, city: null, iso: null, names: [] };
        bySlug.set(row.slug, { row, detail: d, soccer: d.wid ? soccer.get(d.wid.toUpperCase()) ?? null : null });
        if (d.wid) byWid.set(d.wid.toUpperCase(), row.slug);
      }
      return { bySlug, byWid };
    });
    held.set(locale, load);
  }
  return load();
}

/** The venue an address names: a slug, or a Wikidata id (then `redirect` is the slug to go to). */
export const findVenue = (index: VenueIndex, segment: string) => resolveVenue(index.bySlug, index.byWid, segment);

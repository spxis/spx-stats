import "server-only";
import { getSeasonAlignment } from "./alignmentData";
import { getAbbrs, getBrands, getSeasonStandings, getSummary } from "./data";
import type { Speaker } from "./i18n/i18n";
import { LG } from "./leagues";
import { neighbours } from "./outageData";
import { seasonLabel } from "./leagues";
import { getPaths } from "./teamSlugs";
import { clubPins } from "./venueMap";
import { getVenuePlaces } from "./venuePlace";
import { getVenueFacts, getVenueNames } from "./venueName";
import type { Pin } from "@/components/mapDraw";

export interface OutageMapView { pins: Pin[]; title: string; note: string }

/**
 * The map of every club of the season before a gap, each at the venue it used then (the section of a season-outage page, components/OutageMapNear.tsx fetches it from
 * `rows/outage-map` when the reader gets near it): the pins, the title the picture goes by and the line under it. Null when the season has no season before it or no club can be placed.
 */
export async function outageMapView(lg: string, year: number, sp: Pick<Speaker, "say">): Promise<OutageMapView | null> {
  const { say } = sp;
  const { seasons } = await getSummary();
  const { before } = neighbours(seasons, lg, year);
  if (!before) return null;
  const [brands, abbrs, paths, standings, alignment, places, names, facts] = await Promise.all([
    getBrands(), getAbbrs(lg), getPaths(),
    getSeasonStandings(lg, before.year).catch(() => []), getSeasonAlignment(lg, before.year), getVenuePlaces(lg), getVenueNames(), getVenueFacts(),
  ]);
  const pins = clubPins({
    year: before.year, me: -1, clubs: standings, brands, abbrs, alignment, places, names, facts, say, href: (f) => paths.teamSeason(lg, f, before.year),
  });
  if (!pins.length) return null;
  const total = new Set(standings.map((r) => r.franchise_id)).size;
  return { pins, title: say("map.label", { league: LG[lg as keyof typeof LG] ?? lg, season: seasonLabel(lg, before.year) }), note: say("outage.mapNote", { n: pins.length, total }) };
}

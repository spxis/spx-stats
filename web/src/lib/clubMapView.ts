import "server-only";
import type { Pin } from "@/components/mapDraw";
import { getSeasonAlignment } from "./alignmentData";
import { getAbbrs, getBrands, getSeasonStandings } from "./data";
import type { Speaker } from "./i18n/i18n";
import { seasonClubName } from "./seasonClubName";
import { getPaths } from "./teamSlugs";
import { clubPins } from "./venueMap";
import { getVenuePlaces } from "./venuePlace";
import { getVenueFacts, getVenueNames } from "./venueName";

/** What the big map on a club's season shows: a pin for every club of the league that season (`pins`, with the club's own among them) and how many clubs the league had. */
export async function clubMapView(lg: string, y: number, f: number, say: Speaker["say"]): Promise<{ pins: Pin[]; clubCount: number }> {
  const [leagueSt, brands, abbrs, alignment, places, paths, names, facts] = await Promise.all([
    getSeasonStandings(lg, y), getBrands(), getAbbrs(lg), getSeasonAlignment(lg, y), getVenuePlaces(lg), getPaths(), getVenueNames(), getVenueFacts(),
  ]);
  const clubs: { franchise_id: number; team: string | null }[] = [...leagueSt];
  if (!clubs.some((c) => c.franchise_id === f)) {
    // A club with games but no standings row: named as its page names it.
    clubs.push({ franchise_id: f, team: await seasonClubName(lg, y, f, leagueSt) });
  }
  const pins = clubPins({
    year: y, me: f, clubs, brands, abbrs, alignment, places, names, facts, say,
    href: (c) => paths.teamSeason(lg, c, y), slug: (c) => paths.season(lg, c, y),
  });
  return { pins, clubCount: new Set(leagueSt.map((r) => r.franchise_id)).size || pins.length };
}

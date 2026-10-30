import "server-only";
import { getSeasonAlignment } from "./alignmentData";
import { getAbbrs, getBrands, getClubs, getTeamStandings } from "./data";
import type { Speaker } from "./i18n/i18n";
import { LG, seasonLabel } from "./leagues";
import { placeFor } from "./venue";
import { clubPins, getVenueTeams } from "./venueMap";
import { getVenuePlaces } from "./venuePlace";
import { getVenueFacts, getVenueNames } from "./venueName";
import { getPaths } from "./teamSlugs";
import type { FranchiseMapView } from "./mapView";

/**
 * What the two maps of a franchise's page draw besides the club's own pin, as plain data (lib/mapView.ts): where every club of the club's latest
 * season plays, and every venue of every club. They were sent with the page (a hundred clubs' venues, addresses and logos, over 60 KB twice); now the
 * browser fetches them when a map is opened or the venue section is near (the route `rows/map`). The club choice of the venue map, the same for every club of
 * the league, is its own route (`rows/venues`, `leagueVenueTeams`) so it is worked out once per league.
 */
export async function franchiseMapView(lg: string, f: number, say: Speaker["say"]): Promise<FranchiseMapView> {
  const [rows, brands, abbrs, paths, venuePlaces, venueNames, venueFacts] = await Promise.all([
    getTeamStandings(lg, f), getBrands(), getAbbrs(lg), getPaths(), getVenuePlaces(lg), getVenueNames(), getVenueFacts(),
  ]);
  const lastYear = rows.length ? Math.max(...rows.map((r) => r.year)) : null;
  const me = lastYear != null ? placeFor(brands, f, lastYear) : null;
  let league: FranchiseMapView["league"] = null;
  let clubCount = 0;
  if (lastYear != null && me && me.latitude != null && me.longitude != null) {
    const [clubs, alignment] = await Promise.all([getClubs(lg, lastYear), getSeasonAlignment(lg, lastYear)]);
    league = clubPins({ year: lastYear, me: f, clubs, brands, abbrs, alignment, places: venuePlaces, names: venueNames, facts: venueFacts, say, href: (c) => paths.team(lg, c) });
    clubCount = clubs.length;
  }
  return { league, clubCount, seasonLabel: lastYear != null ? seasonLabel(lg, lastYear) : "", leagueShort: LG[lg as keyof typeof LG] ?? lg.toUpperCase() };
}

/** Every club of a league with a venue on record, for the venue map's club choice (the route `rows/venues`). */
export async function leagueVenueTeams(lg: string, say: Speaker["say"]) {
  const [brands, paths] = await Promise.all([getBrands(), getPaths()]);
  return getVenueTeams(lg, brands, paths, say);
}

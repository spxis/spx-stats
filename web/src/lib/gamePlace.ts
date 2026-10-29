import "server-only";
import type { BrandMap } from "./brand";
import { homeVenueIn, neutralSite, parkFits, parkOf, type HomeVenue } from "./gameSurface";
import { getGameVenue } from "./gameVenue";
import { getVenueFacts, getVenueNames, nameIn } from "./venueName";
import { getVenuePlaces, placeKey } from "./venuePlace";

/** The game a drawing is made from: both clubs by franchise (for their colours, logos and, failing api.game_venue, home venue) and what each scored. */
export interface DrawnGame {
  /** The game's id in the archive: api.game_venue says where it was played. */
  id: number;
  date: string;
  phase: string;
  /** The league's last game of the season (a series' last game in the final). */
  final?: boolean;
  home: { f: number | null; name: string; score: number | null };
  away: { f: number | null; name: string; score: number | null };
  overtime: boolean;
}

/**
 * Where a game was played, and whether to say so. api.game_venue (data release 2026.10.13-20) names the venue of every game it knows: the home club's
 * (basis `home`) or the one a source gives (a Super Bowl, a Grey Cup, a 2020 World Series). A game it places nowhere gets the standard surface with no
 * venue named, and so does a `home` game of a bubble season (the 2019-20 NHL and NBA playoffs were played in hubs). When api.game_venue or api.venue_ref
 * (migration 082) cannot be read, the venue is the home club's of that season from the brand eras, as before the release, and a neutral-site final gets
 * the standard surface.
 */
async function whereOf(lg: string, year: number, game: DrawnGame, brands: BrandMap): Promise<{ venue: HomeVenue | null; neutral: boolean }> {
  const gv = await getGameVenue(game.id);
  const names = await getVenueNames();
  if (gv?.wid) {
    if (gv.basis === "home" && neutralSite(lg, year, game.phase, !!game.final)) return { venue: null, neutral: true };
    return { venue: { name: nameIn(names.get(gv.wid), year, gv.name ?? ""), wid: gv.wid, current: false }, neutral: false };
  }
  if (gv && (gv.venueId == null || gv.basis !== "home")) return { venue: null, neutral: false };
  if (neutralSite(lg, year, game.phase, !!game.final)) return { venue: null, neutral: true };
  const [places, facts] = await Promise.all([getVenuePlaces(lg), getVenueFacts()]);
  const venue = homeVenueIn(brands, game.home.f, game.date, year, {
    place: (f, v, lat, lon) => { const p = places.get(placeKey(f, v, lat, lon) ?? ""); return p ? { wid: p.wid, city: p.city } : null; },
    span: (wid) => { const x = facts.get(wid); return x ? { opened: x.opened, closed: x.closed } : null; },
    nameIn: (wid, y, fallback) => nameIn(names.get(wid), y, fallback),
  });
  return { venue, neutral: false };
}

/**
 * Where a game was played, as the page that shows it says it: the venue (null when none is known or claimed), whether it was a neutral site, and for an MLB game the kyogijo
 * park. A park kyogijo knows to have stood in other years is not the park of this season, so nothing is claimed about the venue then. The game page names the venue with it,
 * so the name and the drawing always agree; the reads are the same ones the drawing makes, kept once per render.
 */
export async function placeOf(lg: string, year: number, game: DrawnGame, brands: BrandMap): Promise<{ venue: HomeVenue | null; neutral: boolean; park: string | null }> {
  const where = await whereOf(lg, year, game, brands);
  let venue = where.venue;
  let park = lg === "mlb" ? parkOf(venue) : null;
  if (park && !parkFits(park, year)) { park = null; venue = null; }
  return { venue, neutral: where.neutral, park };
}


import "server-only";
import { drawSurface, parkById } from "@johnmorrisdotca/kyogijo";
import type { VenueDetail } from "./venueDataset";
import type { VenueRow } from "./venueModel";
import { parkIdFor, SURFACE_SPORT, type SurfaceSport } from "./venuePark";

/** One drawing of a venue: the surface of a sport, as the SVG text kyogijo makes. `park` is the ballpark whose fence it follows, when it is one. */
export interface Surface { sport: SurfaceSport; park: string | null; parkName: string | null; svg: string }

/**
 * The drawings of a venue, one for each sport of the leagues that played there, drawn here on the server (the page is kept, so this runs
 * about once an hour at most, and the browser needs no script for it). The stylesheet is left out of each drawing (`style: "none"`) and
 * the page links it once (components/kyogijo.css, a copy of KYOGIJO_STYLE that a test keeps equal to the package); colours follow the page's light and dark setting through kyogijo's custom properties.
 * A football field leaves out its small markings (hash marks), which halves its size; the page carries every drawing twice (in its HTML and in its data). A ballpark a club plays in today is drawn with its own fence; every other venue gets the sport's standard surface.
 */
export function surfacesFor(row: VenueRow, detail: VenueDetail, language: "en" | "ja"): Surface[] {
  const sports = [...new Set(row.leagues.map((l) => (SURFACE_SPORT as Record<string, SurfaceSport | undefined>)[l]).filter((s): s is SurfaceSport => !!s))];
  return sports.map((sport) => {
    const park = sport === "mlb" ? parkIdFor([row.name, ...detail.names.map((n) => n.name)], row.clubs.some((c) => c.lg === "mlb" && c.to == null)) : null;
    return { sport, park, parkName: park ? parkById(park)?.name ?? null : null, svg: drawSurface({ sport, language, style: "none", ...(sport === "nfl" || sport === "cfl" ? { detail: "simple" as const } : {}), ...(park ? { park } : {}) }) };
  });
}

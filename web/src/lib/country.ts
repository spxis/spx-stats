import "server-only";
import WORLD from "@johnmorrisdotca/chizu/world";
import { distanceToRing, parseMapRings, pointInRing, projectPoint, type MapRing } from "@johnmorrisdotca/chizu";

/**
 * The country of a team's home, found from the venue's coordinates (the api views do not carry
 * core.franchise_identity.country_code). Only the three countries that hold teams are tried; a point that falls in none
 * takes the nearest coast, so a stadium on a harbour still reads right.
 */
const CODES = ["CA", "US", "MX"] as const;
let rings: [string, MapRing[]][] | null = null;

export function countryAt(lat: number | null | undefined, lon: number | null | undefined): string | null {
  if (lat == null || lon == null) return null;
  const p = projectPoint(WORLD, lon, lat);
  if (!p) return null;
  rings ??= CODES.map((c) => [c, parseMapRings(WORLD.regions.find((r) => r.code === c)?.path ?? "")]);
  let near: [string, number] | null = null;
  for (const [code, rs] of rings) {
    if (rs.some((r) => pointInRing(p[0], p[1], r))) return code;
    for (const r of rs) {
      const d = distanceToRing(p[0], p[1], r);
      if (!near || d < near[1]) near = [code, d];
    }
  }
  return near && near[1] < 6 ? near[0] : null;
}

export const COUNTRY_NAME: Record<string, string> = { CA: "Canada", US: "United States", MX: "Mexico" };

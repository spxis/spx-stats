import { geoAlbers, geoConicConformal } from "d3";
import { naPoint } from "./northAmerica";

/**
 * Chizu's maps of the states and of the provinces are drawn in projections of their own, so its projectPoint cannot place
 * a point on them. These are the same projections (d3-geo, as the package's data says), with the scale and offset that
 * fit them to the package's canvases, found by laying the Natural Earth outline on each canvas (better than a pixel).
 */
const PROJECTIONS = {
  // geoAlbers for the lower 48, on a canvas 1000 wide and 740 tall (Alaska and Hawaii sit in boxes of their own)
  US: geoAlbers().scale(1316).translate([499.7, 294.9]),
  // geoConicConformal, parallels 49 and 77, rotated 96 degrees, on a canvas 1000 by 720
  CA: geoConicConformal().parallels([49, 77]).rotate([96, 0]).scale(1009.1).translate([438.43, 1655.58]),
};

export type RegionCountry = keyof typeof PROJECTIONS;
/** A country's own map, or "NA": the states and provinces on one map (lib/northAmerica.ts). */
export type RegionView = RegionCountry | "NA";

/** Where a longitude and latitude fall on the country's map of states or provinces, or null. */
export function regionPoint(cc: RegionView, lon: number, lat: number): [number, number] | null {
  if (cc === "NA") return naPoint(lon, lat);
  const p = PROJECTIONS[cc]([lon, lat]);
  return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [p[0], p[1]] : null;
}

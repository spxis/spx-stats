import { geoAlbers, geoConicConformal } from "d3";
import type { ChizuMap } from "@johnmorrisdotca/chizu";

/**
 * One map of the states and the provinces together. Chizu draws the two countries on canvases of their own (the lower 48 in Albers,
 * Canada in a conformal conic), so they cannot sit side by side. This takes each outline back to longitude and latitude (the same
 * projections regionProject.ts uses) and draws them again in one Albers conic framed on both. Alaska and Hawaii sit in boxes of their
 * own on the US canvas, so they are left out.
 */
const US = geoAlbers().scale(1316).translate([499.7, 294.9]);
const CA = geoConicConformal().parallels([49, 77]).rotate([96, 0]).scale(1009.1).translate([438.43, 1655.58]);

/** The combined map's size and the offset that puts its outlines inside it (found by projecting every outline with a zero offset). */
export const NA_SIZE = { width: 1000, height: 1130, dx: 438, dy: 599 };
export const NA = geoAlbers().rotate([96, 0]).center([0, 52]).parallels([35, 62]).scale(1130).translate([0, 0]);

/** Where a longitude and latitude fall on the combined map, or null. */
export function naPoint(lon: number, lat: number): [number, number] | null {
  const p = NA([lon, lat]);
  return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [p[0] + NA_SIZE.dx, p[1] + NA_SIZE.dy] : null;
}

type Region = ChizuMap["regions"][number];

function redraw(path: string, from: typeof US): string {
  return path.replace(/([MLZ])([^MLZ]*)/g, (_m, cmd: string, rest: string) => {
    if (cmd === "Z") return "Z";
    const [x, y] = rest.split(",").map(Number);
    const ll = from.invert?.([x, y]);
    const p = ll ? naPoint(ll[0], ll[1]) : null;
    return p ? `${cmd}${Math.round(p[0] * 10) / 10},${Math.round(p[1] * 10) / 10}` : "";
  });
}

/** The lower 48 and the provinces, as one Chizu map. */
export function northAmericaMap(us: ChizuMap, ca: ChizuMap): ChizuMap {
  const move = (r: Region, from: typeof US): Region => {
    const path = redraw(r.path, from);
    const nums = [...path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const xs = nums.map((n) => n[0]), ys = nums.map((n) => n[1]);
    const c = from.invert?.(r.centroid as [number, number]);
    const centroid = (c ? naPoint(c[0], c[1]) : null) ?? [0, 0];
    return { ...r, path, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], centroid };
  };
  const regions = [
    ...us.regions.filter((r) => r.code !== "AK" && r.code !== "HI").map((r) => move(r, US)),
    ...ca.regions.map((r) => move(r, CA)),
  ];
  return {
    ...us, id: "divisions-na", name: "North America", nameJa: "北アメリカ", regionName: "State / province", regionNamePlural: "States and provinces",
    viewBox: `0 0 ${NA_SIZE.width} ${NA_SIZE.height}`, width: NA_SIZE.width, height: NA_SIZE.height, insets: [], regions,
  };
}

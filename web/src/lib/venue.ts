import type { TeamBrandRow } from "./api/types";
import type { BrandMap } from "./brand";

/**
 * Where a franchise plays in a year: the brand era that covers the end of that year and has a venue with coordinates;
 * failing that the nearest era that has them. (Brand eras overlap and many carry no venue, so the first era covering a
 * year can have none while another does.)
 */
export function placeFor(brands: BrandMap, f: number | null | undefined, year?: number): TeamBrandRow | null {
  if (f == null) return null;
  const placed = (brands[f] ?? []).filter((b) => b.latitude != null && b.longitude != null);
  if (!placed.length) return null;
  const day = year ? `${year}-12-31` : null;
  if (!day) return placed.find((b) => !b.brand_to) ?? placed.at(-1) ?? null;
  const covering = placed.filter((b) => (!b.brand_from || b.brand_from <= day) && (!b.brand_to || b.brand_to > day));
  if (covering.length) return covering.at(-1) ?? null;
  const t = Date.parse(day);
  const gap = (b: TeamBrandRow) => Math.min(
    b.brand_from ? Math.abs(Date.parse(b.brand_from) - t) : Infinity,
    b.brand_to ? Math.abs(Date.parse(b.brand_to) - t) : Infinity,
  );
  return [...placed].sort((a, b) => gap(a) - gap(b))[0] ?? null;
}

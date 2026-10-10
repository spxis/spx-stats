import type { TeamBrandRow } from "./api/types";

export type BrandMap = Record<number, TeamBrandRow[]>;

/** A franchise's brand eras. One franchise can span many (new logo, new colours). */
export function groupBrands(all: TeamBrandRow[]): BrandMap {
  const by: BrandMap = {};
  for (const b of all) (by[b.franchise_id] ??= []).push(b);
  return by;
}

/** The brand era covering the end of `year`; failing that the current era, failing that the latest. */
export function brandFor(brands: BrandMap, f: number | null | undefined, year?: number): TeamBrandRow | null {
  if (f == null) return null;
  const list = brands[f] ?? [];
  if (!list.length) return null;
  const y = year ? `${year}-12-31` : null;
  return (
    (y && list.find((b) => (!b.brand_from || b.brand_from <= y) && (!b.brand_to || b.brand_to > y))) ||
    list.find((b) => !b.brand_to) ||
    list.at(-1) ||
    null
  );
}

const lum = (hex: string): number => {
  const c = [0, 2, 4]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/** The page backgrounds, in light and dark (the --paper tokens in globals.css). */
export const PAPER = { light: "f5f6f2", dark: "12161b" } as const;

/**
 * The accent of a team page: whichever team colour reads (contrast of 3 or more) on the page
 * background. Worked out for both themes so the switch needs no script; null keeps the league colour.
 */
export function teamAccent(b: TeamBrandRow | null): { light: string | null; dark: string | null } {
  const colours = [b?.primary_hex, b?.secondary_hex].filter((h): h is string => !!h);
  const pick = (paper: string) => colours.find((h) => contrast(h, paper) >= 3) ?? null;
  return { light: pick(PAPER.light), dark: pick(PAPER.dark) };
}

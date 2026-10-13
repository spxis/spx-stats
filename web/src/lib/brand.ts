import type { TeamBrandRow } from "./api/types";

export type BrandMap = Record<number, TeamBrandRow[]>;

/** A franchise's brand eras. One franchise can span many (new logo, new colours). */
export function groupBrands(all: TeamBrandRow[]): BrandMap {
  const by: BrandMap = {};
  for (const b of all) (by[b.franchise_id] ??= []).push(b);
  return by;
}

/**
 * The brand era covering the end of `year`; failing that the current era, failing that the latest. Eras overlap and
 * some carry no colours, so an era with colours wins over one without; with no year, the latest era with colours
 * stands in for a current era that has none.
 */
export function brandFor(brands: BrandMap, f: number | null | undefined, year?: number): TeamBrandRow | null {
  if (f == null) return null;
  const list = brands[f] ?? [];
  if (!list.length) return null;
  const y = year ? `${year}-12-31` : null;
  const covering = y ? list.filter((b) => (!b.brand_from || b.brand_from <= y) && (!b.brand_to || b.brand_to > y)) : [];
  const open = list.filter((b) => !b.brand_to);
  const pick = (rows: TeamBrandRow[]) => rows.find((b) => b.primary_hex) ?? rows[0];
  const found = (covering.length ? pick(covering) : null) || (open.length ? pick(open) : null) || list.at(-1) || null;
  return found?.primary_hex || year ? found : list.findLast((b) => b.primary_hex) ?? found;
}

/**
 * The logo a franchise wore in a year: the era covering the end of that year, or none. A year no logo era covers is a club
 * under another name (the Houston Oilers, the Los Angeles Raiders) whose own logo we do not hold, and the logo of the
 * name before or after it would be the wrong one. With no year, the current logo.
 */
export function logoFor(brands: BrandMap, f: number | null | undefined, year?: number): string | null {
  if (f == null) return null;
  const logos = (brands[f] ?? []).filter((b) => b.logo_url);
  if (!logos.length) return null;
  if (!year) return (logos.find((b) => !b.brand_to) ?? logos.at(-1))!.logo_url;
  const day = `${year}-12-31`;
  const covering = logos.filter((b) => (!b.brand_from || b.brand_from <= day) && (!b.brand_to || b.brand_to > day));
  return covering.at(-1)?.logo_url ?? null;
}

/** WCAG relative luminance of a hex colour (no #), 0 for black to 1 for white. */
export const lum = (hex: string): number => {
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

/**
 * A team's colour for a diagram, in both themes: whichever of its colours reads on the page background, written as light-dark() so the
 * switch needs no script. A team with no readable colour gets the fallback (a CSS colour or variable).
 */
export function teamTone(b: TeamBrandRow | null, fallback = "var(--muted)"): string {
  const a = teamAccent(b);
  if (!a.light && !a.dark) return fallback;
  return `light-dark(${a.light ? `#${a.light}` : fallback}, ${a.dark ? `#${a.dark}` : fallback})`;
}

import type { TeamAbbrRow } from "./api/types";

/** A league's team abbreviations by franchise, oldest first (api.team_abbr: core.franchise_identity.abbreviation). */
export type AbbrMap = Record<number, TeamAbbrRow[]>;

export function groupAbbrs(all: TeamAbbrRow[]): AbbrMap {
  const by: AbbrMap = {};
  for (const a of all) (by[a.franchise_id] ??= []).push(a);
  return by;
}

/**
 * The abbreviation a franchise used in a season: the era covering the end of that year (a season is named for the year
 * it starts), else the nearest era; with no year, the current one. Null when the database has none.
 */
export function officialAbbr(abbrs: AbbrMap | null | undefined, f: number | null | undefined, year?: number): string | null {
  if (f == null) return null;
  const list = abbrs?.[f] ?? [];
  if (!list.length) return null;
  if (year == null) return (list.find((a) => !a.valid_to) ?? list.at(-1))!.abbreviation;
  const day = `${year}-12-31`, t = Date.parse(day);
  const covering = list.filter((a) => (!a.valid_from || a.valid_from <= day) && (!a.valid_to || a.valid_to > day));
  if (covering.length) return covering.at(-1)!.abbreviation;
  const gap = (a: TeamAbbrRow) => Math.min(
    a.valid_from ? Math.abs(Date.parse(a.valid_from) - t) : Infinity,
    a.valid_to ? Math.abs(Date.parse(a.valid_to) - t) : Infinity,
  );
  return [...list].sort((x, y) => gap(x) - gap(y))[0].abbreviation;
}

/** The abbreviation for tight places: the database's, else the first letters of the name (never longer than four). */
export function abbrFor(abbrs: AbbrMap | null | undefined, f: number | null | undefined, year: number | undefined, name: string | null | undefined): string {
  const a = officialAbbr(abbrs, f, year);
  if (a) return a;
  const words = String(name || "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join("") : words[0] ?? "—").slice(0, 4).toUpperCase();
}

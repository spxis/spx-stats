import type { BrandMap } from "./brand.ts";
import { logoKey, type LogoFit } from "./logoFit.ts";

/** One logo image of the contact sheet (/admin/logos): the file, who wears it, in which years, and its licence. */
export interface SheetLogo {
  file: string;
  url: string;
  licence: string | null;
  page: string | null;
  league: string;
  teams: { f: number; name: string }[];
  from: string | null;
  to: string | null;
  fit: LogoFit | null;
}

const LEAGUES = ["nhl", "nba", "mlb", "nfl", "cfl"];

/**
 * Every distinct logo image the brand rows carry, once, with the franchises that use it, ordered by league and name.
 * `names` maps "league|franchise" to the team's current name; `fits` are all the logo_fit rows, whatever their status.
 */
export function sheetLogos(brands: BrandMap, names: Map<string, string>, fits: LogoFit[]): SheetLogo[] {
  const byFile = new Map<string, SheetLogo>();
  const fitOf = new Map(fits.map((f) => [f.logo_file, f]));
  for (const rows of Object.values(brands)) {
    for (const b of rows) {
      const file = logoKey(b.logo_url);
      if (!b.logo_url || !file) continue;
      let l = byFile.get(file);
      if (!l) {
        l = { file, url: b.logo_url, licence: b.logo_licence, page: b.logo_page, league: b.league, teams: [], from: b.brand_from, to: b.brand_to, fit: fitOf.get(file) ?? null };
        byFile.set(file, l);
      }
      if (!l.teams.some((t) => t.f === b.franchise_id)) l.teams.push({ f: b.franchise_id, name: names.get(`${b.league}|${b.franchise_id}`) ?? `Franchise ${b.franchise_id}` });
      if (b.brand_from === null || (l.from !== null && b.brand_from < l.from)) l.from = b.brand_from;
      if (b.brand_to === null || (l.to !== null && b.brand_to > l.to)) l.to = b.brand_to;    }
  }
  const rank = (lg: string) => { const i = LEAGUES.indexOf(lg); return i < 0 ? LEAGUES.length : i; };
  return [...byFile.values()].sort((a, b) => rank(a.league) - rank(b.league) || a.teams[0].name.localeCompare(b.teams[0].name) || a.file.localeCompare(b.file));
}

/** "1967–1999", "since 1999", "to 1967" or "all years" for the years a logo was worn. */
export function wornYears(from: string | null, to: string | null): string {
  const y = (d: string | null) => (d ? d.slice(0, 4) : null);
  const a = y(from), b = y(to);
  if (a && b) return `${a}–${b}`;
  if (a) return `since ${a}`;
  if (b) return `to ${b}`;
  return "all years";
}

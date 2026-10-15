import { CHILDREN, isLeague, leagueInfo, LG, PARENT, type LeagueCode } from "./leagues.ts";

/** What a parent league's page says about each rival or predecessor league: its years, seasons and champions (kept apart from the parent's own). */
export interface OtherLeague { code: LeagueCode; name: string; short: string; first: string; last: string; seasons: number; champions: number }

export function otherLeagues(lg: string, seasons: { league: string; year: number; label: string; champion: string | null }[]): OtherLeague[] {
  return (CHILDREN[lg as LeagueCode] ?? []).flatMap((code) => {
    const rows = seasons.filter((x) => x.league === code).sort((a, b) => a.year - b.year);
    const info = leagueInfo(code);
    return rows.length && info
      ? [{ code, name: info.name, short: info.short, first: rows[0].label, last: rows[rows.length - 1].label, seasons: rows.length, champions: rows.filter((x) => x.champion).length }]
      : [];
  });
}

/** The trail of a page of a rival league from its address parts (["afl", "1964", "team", ...]): "NFL > AFL > 1964"; null for any other page. */
export function leagueTrail(parts: readonly string[]): { parent: LeagueCode; lg: LeagueCode; year: string | null; deeper: boolean } | null {
  const lg = parts[0];
  if (!lg || !isLeague(lg)) return null;
  const parent = PARENT[lg];
  if (!parent) return null;
  return { parent, lg, year: /^\d{4}$/.test(parts[1] ?? "") ? parts[1]! : null, deeper: parts.length > 1 };
}

export const trailLabels = (t: NonNullable<ReturnType<typeof leagueTrail>>): string[] => [LG[t.parent], LG[t.lg], ...(t.year ? [t.year] : [])];

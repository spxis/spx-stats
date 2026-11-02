import { leagueInfo, type LeagueCode } from "./leagues.ts";

/** One league on the football page: its years, how many seasons and champions it has on record, and the rival or predecessor leagues listed under it. */
export interface FootballLeague {
  code: LeagueCode;
  name: string;
  short: string;
  first: string;
  last: string;
  seasons: number;
  champions: number;
}

export interface FootballGroup extends FootballLeague { rivals: FootballLeague[] }

/** The football page's leagues, in the order of the menu's second line. The AFL and the AAFC hang under the NFL, as they do on the NFL's own page; every league keeps its own records. */
export const FOOTBALL_GROUPS: readonly { code: LeagueCode; rivals: readonly LeagueCode[] }[] = [
  { code: "nfl", rivals: ["afl", "aafc"] },
  { code: "ncaaf", rivals: [] },
  { code: "cfl", rivals: [] },
];

interface SeasonLike { league: string; year: number; label: string; champion: string | null }

function statsOf(code: LeagueCode, seasons: readonly SeasonLike[]): FootballLeague | null {
  const rows = seasons.filter((s) => s.league === code).sort((a, b) => a.year - b.year);
  const info = leagueInfo(code);
  if (!rows.length || !info) return null;
  return { code, name: info.name, short: info.short, first: rows[0].label, last: rows[rows.length - 1].label, seasons: rows.length, champions: rows.filter((s) => s.champion).length };
}

/** The leagues of the football page that the archive holds (a league with no season is left out, a rival with none too). Nothing is added across leagues. */
export function footballGroups(seasons: readonly SeasonLike[]): FootballGroup[] {
  return FOOTBALL_GROUPS.flatMap((g) => {
    const main = statsOf(g.code, seasons);
    return main ? [{ ...main, rivals: g.rivals.flatMap((r) => statsOf(r, seasons) ?? []) }] : [];
  });
}

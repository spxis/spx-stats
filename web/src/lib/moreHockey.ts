import { leagueInfo, MORE_HOCKEY_LEVEL, type LeagueCode } from "./leagues.ts";

/** The levels of the More hockey page, in the order it lists them (college and women's hockey will be levels of their own). */
export const HOCKEY_LEVELS = ["minor", "junior", "defunct"] as const;
export type HockeyLevel = (typeof HOCKEY_LEVELS)[number];

export interface MoreHockeyLeague {
  code: LeagueCode;
  name: string;
  short: string;
  first: string;
  last: string;
  seasons: number;
  champions: number;
  /** The newest season with a champion. */
  latest: { year: number; label: string; champion: string; franchise: number | null } | null;
}

export interface MoreHockeyGroup { level: HockeyLevel; leagues: MoreHockeyLeague[] }

interface SeasonLike { league: string; year: number; label: string; champion: string | null; champion_franchise?: number | null }

/**
 * The leagues of the More hockey page by level: only those the archive holds (a league with no season is left out, and so is a level with no league), in the
 * order of MORE_HOCKEY_LEVEL within a level. Each carries its years, how many seasons and champions it has and its latest champion.
 */
export function moreHockeyGroups(seasons: readonly SeasonLike[]): MoreHockeyGroup[] {
  return HOCKEY_LEVELS.flatMap((level) => {
    const leagues = (Object.keys(MORE_HOCKEY_LEVEL) as LeagueCode[]).filter((c) => MORE_HOCKEY_LEVEL[c] === level).flatMap((code) => {
      const rows = seasons.filter((s) => s.league === code).sort((a, b) => a.year - b.year);
      const info = leagueInfo(code);
      if (!rows.length || !info) return [];
      const champ = [...rows].reverse().find((s) => s.champion);
      return [{
        code, name: info.name, short: info.short, first: rows[0].label, last: rows[rows.length - 1].label, seasons: rows.length, champions: rows.filter((s) => s.champion).length,
        latest: champ?.champion ? { year: champ.year, label: champ.label, champion: champ.champion, franchise: champ.champion_franchise ?? null } : null,
      } satisfies MoreHockeyLeague];
    });
    return leagues.length ? [{ level, leagues }] : [];
  });
}

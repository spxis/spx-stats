import { isMoreHockey, LG, leagueInfo, type LeagueCode } from "./leagues.ts";
import { MLS_PATH, mlsSeasonPath } from "./mlsPath.ts";
import { SOCCER_PATH, tournamentPath, WORLDCUP_PATH } from "./soccerPath.ts";
import { seasonPath } from "./slug.ts";

/**
 * Display families for the home archive chart and the home cards. Separate from PARENT (rival and predecessor
 * leagues that hang off the menu): PWHL, WNBA and NWSL stay in the menu, and fold here only. NFL and CFL are
 * never one family. Virtual members `soccer` (World Cups) and `mls` are not LeagueCodes.
 */
export type FamilyId = "nhl" | "nba" | "mlb" | "nfl" | "ncaaf" | "cfl" | "soccer";

export interface LeagueFamily {
  id: FamilyId;
  /** Colour token and the family's main page (`/nhl`, `/soccer`, …). */
  primary: string;
  /** Leagues drawn on this family's row, primary first. */
  members: readonly string[];
  /** A + after the short name: the family has, or can have, siblings. */
  plus: boolean;
  /** The sport the family plays: its name in a sentence ("Other leagues in the hockey family"). */
  sport: "hockey" | "basketball" | "baseball" | "football" | "soccer";
  /** The name the menu and the chart show when the short code is not what a reader looks for ("College football", not NCAAF). */
  name?: string;
  /** The short code on a chart row, where a long name does not fit ("NCAAF"). */
  chart?: string;
}

export const FAMILIES: readonly LeagueFamily[] = [
  { id: "nhl", primary: "nhl", members: ["nhl", "pwhl", "nha", "pcha", "wchl", "wha"], plus: true, sport: "hockey" },
  { id: "nba", primary: "nba", members: ["nba", "wnba"], plus: true, sport: "basketball" },
  { id: "mlb", primary: "mlb", members: ["mlb", "na", "aa", "ua", "pl", "fl"], plus: true, sport: "baseball" },
  { id: "nfl", primary: "nfl", members: ["nfl", "afl", "aafc"], plus: true, sport: "football" },
  { id: "ncaaf", primary: "ncaaf", members: ["ncaaf"], plus: false, sport: "football", name: "College football", chart: "NCAAF" },
  { id: "cfl", primary: "cfl", members: ["cfl"], plus: false, sport: "football" },
  { id: "soccer", primary: "soccer", members: ["soccer", "nwsl", "mls"], plus: true, sport: "soccer" },
];

export const GROW_KEY = "spxn-archive-grow";

/** The page of hockey beyond the NHL (the AHL and the leagues that follow it): one link under the NHL in the menu. */
export const MORE_HOCKEY_PATH = "/more-hockey";

export const familyOf = (code: string): LeagueFamily | undefined => FAMILIES.find((f) => f.members.includes(code));

/** Short name of a league or a virtual soccer code. The virtual `soccer` code is the FIFA competitions: `internationalWord` is the translated "International". */
export function codeLabel(code: string, internationalWord = "International"): string {
  if (code === "soccer") return internationalWord;
  if (code === "mls") return "MLS";
  return LG[code as LeagueCode] ?? code.toUpperCase();
}

/** NHL+, Soccer+, CFL, College football. */
export function familyTitle(family: LeagueFamily, soccerWord = "Soccer"): string {
  const base = family.id === "soccer" ? soccerWord : family.name ?? LG[family.primary as LeagueCode] ?? family.primary.toUpperCase();
  return family.plus ? `${base}+` : base;
}

/**
 * The site's top menu, header and footer: one entry per family, in FAMILIES order, so the menu cannot drift from the
 * archive chart and the home cards. Women's, rival and predecessor leagues (PWHL, WNBA, NWSL, NHA, AFL, MLS, ...) are not
 * entries: they are members of a family and are reached from its page (FamilyNav, "Other leagues") and from the chart.
 */
export interface MenuEntry {
  id: FamilyId;
  /** The family's main page (`/nhl`, `/soccer`). */
  href: string;
  /** NHL+, NBA+, MLB+, NFL+, CFL, Soccer: "+" when the family has siblings, but never on Soccer in the menu. */
  label: string;
  /** The league whose all-time page the footer links (none for soccer: it has no single table). */
  allTime: string | null;
}

/** Soccer is plain in the menu (John, 2026-10-18): the page itself is "Soccer+". */
export function menuLabel(family: LeagueFamily, soccerWord = "Soccer"): string {
  return family.id === "soccer" ? soccerWord : familyTitle(family, soccerWord);
}

export function menuEntries(soccerWord = "Soccer"): MenuEntry[] {
  return FAMILIES.map((f) => ({
    id: f.id,
    href: familyHref(f),
    label: menuLabel(f, soccerWord),
    allTime: f.id === "soccer" ? null : f.primary,
  }));
}

/** The family a first address segment belongs to (`wnba` -> nba, `pwhl` -> nhl, `worldcup` and `mls` -> soccer, the More hockey page and its leagues -> nhl): the menu entry to light. */
export function menuFamilyOf(segment: string | undefined): FamilyId | undefined {
  if (!segment) return undefined;
  if (segment === "worldcup") return "soccer";
  if (segment === MORE_HOCKEY_PATH.slice(1) || isMoreHockey(segment)) return "nhl";
  return familyOf(segment)?.id;
}

export function familyHref(family: LeagueFamily): string {
  return family.primary === "soccer" ? SOCCER_PATH : `/${family.primary}`;
}

/** The page of a family member (a league, the World Cups, or MLS). */
export function memberHref(code: string): string {
  if (code === "soccer") return WORLDCUP_PATH;
  if (code === "mls") return MLS_PATH;
  return `/${code}`;
}

/** The season (or tournament) a square opens. */
export function seasonHref(league: string, year: number): string {
  if (league === "soccer") return tournamentPath(year);
  if (league === "mls") return mlsSeasonPath(year);
  return seasonPath(league, year);
}

export function memberName(code: string, internationalWord = "International"): string {
  if (code === "soccer") return internationalWord;
  if (code === "mls") return "MLS";
  return leagueInfo(code)?.name ?? codeLabel(code, internationalWord);
}

/** A season as the archive chart draws it (the home Heatmap's row). */
export interface HeatSeasonLike {
  league: string;
  year: number;
  label: string;
  games: number;
  finals: number;
  share: number;
  champion: string | null;
}

/** One year on a condensed family row: the main square plus smaller sibling chips. */
export interface FamilyYearCell {
  year: number;
  /** The square: the primary league if it played, else the first sibling that did. */
  main: HeatSeasonLike;
  /** Other family members that also played that year. */
  chips: HeatSeasonLike[];
}

export function indexSeasons(seasons: readonly HeatSeasonLike[]): Map<string, Map<number, HeatSeasonLike>> {
  const m = new Map<string, Map<number, HeatSeasonLike>>();
  for (const s of seasons) {
    let row = m.get(s.league);
    if (!row) m.set(s.league, (row = new Map()));
    row.set(s.year, s);
  }
  return m;
}

export function familyYearCell(
  year: number,
  family: LeagueFamily,
  byLeagueYear: Map<string, Map<number, HeatSeasonLike>>,
): FamilyYearCell | null {
  const present = family.members.flatMap((lg) => {
    const s = byLeagueYear.get(lg)?.get(year);
    return s ? [s] : [];
  });
  if (!present.length) return null;
  const main = present.find((s) => s.league === family.primary) ?? present[0]!;
  return { year, main, chips: present.filter((s) => s !== main) };
}

/** Years any member of the family holds, oldest first. */
export function familyYears(family: LeagueFamily, seasons: readonly { league: string; year: number }[]): number[] {
  const set = new Set(family.members);
  return [...new Set(seasons.filter((s) => set.has(s.league)).map((s) => s.year))].sort((a, b) => a - b);
}

/** Members that have at least one season, in family order: the expanded chart's rows. */
export function expandedLeagues(family: LeagueFamily, seasons: readonly { league: string }[]): string[] {
  const have = new Set(seasons.map((s) => s.league));
  return family.members.filter((m) => have.has(m));
}

/** Families that have at least one season in the list, in FAMILIES order. */
export function familiesWithData(seasons: readonly { league: string }[]): LeagueFamily[] {
  const have = new Set(seasons.map((s) => s.league));
  return FAMILIES.filter((f) => f.members.some((m) => have.has(m)));
}

/** Everyone in the family except this league (or virtual code). */
export function familySiblings(code: string): string[] {
  const f = familyOf(code);
  return f ? f.members.filter((m) => m !== code) : [];
}

/**
 * A slightly different fill from the parent's token for predecessor leagues that share it
 * (--nha is --nhl today), so pre-NHL years read as hockey but not as the NHL itself.
 */
export function heatCellColor(league: string): string {
  const tint: Record<string, string> = {
    nha: "color-mix(in srgb, var(--nhl) 68%, #123a72)",
    pcha: "color-mix(in srgb, var(--nhl) 68%, #0a6a7a)",
    wchl: "color-mix(in srgb, var(--nhl) 68%, #3a2a8a)",
    wha: "color-mix(in srgb, var(--nhl) 68%, #1a5aaa)",
    na: "color-mix(in srgb, var(--mlb) 68%, #6a4a1a)",
    aa: "color-mix(in srgb, var(--mlb) 68%, #8a2a2a)",
    ua: "color-mix(in srgb, var(--mlb) 68%, #1a6a4a)",
    pl: "color-mix(in srgb, var(--mlb) 68%, #5a2a8a)",
    fl: "color-mix(in srgb, var(--mlb) 68%, #1a4a8a)",
    afl: "color-mix(in srgb, var(--nfl) 68%, #2a8a40)",
    aafc: "color-mix(in srgb, var(--nfl) 68%, #0a4a30)",
    soccer: "var(--soccer)",
    mls: "color-mix(in srgb, var(--soccer) 75%, #0a4a40)",
  };
  return tint[league] ?? `var(--${league})`;
}

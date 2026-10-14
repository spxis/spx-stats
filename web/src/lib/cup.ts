import type { Stay } from "./cityModel.ts";

/**
 * Stanley Cup titles won before the NHL's first season (api.cup_title, db/build/210_stanley_cup_pre_nhl.sql, docs/stanley-cup-pre-nhl.md):
 * a club and a year. The clubs were in the AHAC, CAHL, FAHL, ECAHA, ECHA, NHA, PCHA and other leagues, so no NHL season exists for them;
 * `franchise` is the NHL franchise the club is part of, when core holds it (the Vancouver Millionaires, the Ottawa Senators of 1903), else null.
 */
export interface CupTitle {
  year: number;
  /** The name the club wore in its last win of the year. */
  team: string;
  /** The league it played in, as Wikipedia prints it (AHAC, PCHA...). */
  league: string | null;
  /** The club under one name. */
  club: string;
  franchise: number | null;
  /** A ref.city slug. */
  city: string | null;
  /** Cup series won that year. */
  wins: number;
}

/** A club that lost one of the finals outside an NHL season (api.cup_finalist). */
export interface CupFinalist { year: number; team: string; league: string | null; club: string; franchise: number | null; city: string | null }

/** The titles of one NHL franchise, oldest first. */
export const cupTitlesOf = (all: CupTitle[], franchise: number): CupTitle[] =>
  all.filter((t) => t.franchise === franchise).sort((a, b) => a.year - b.year);

/** Stand-in franchise numbers for clubs core has no franchise for: negative, so they can never be a real one. */
const standIn = (club: string, clubs: string[]) => -1 - clubs.indexOf(club);

/**
 * Adds the Stanley Cup titles won before the NHL to the city stays.
 *  - A club that is an NHL franchise core holds (the Vancouver Millionaires, the Ottawa Senators of 1903) gets them on its stay in the title's
 *    city, or on its earliest stay: they go into `titles` (so every count and ranking sees them) and are named in `before`, the years that
 *    have no NHL season to link to. The stay's `first` moves back to the first of them.
 *  - Any other club that won the Cup, or lost one of the finals, in a city (Montreal Shamrocks, Kenora Thistles, the Portland Rosebuds) gets a
 *    stay of its own with no seasons (`cup`): it is a club of the city that never played an NHL season.
 * Nothing here makes an NHL season. A club with no city is left out.
 */
export function withCupTitles(stays: Stay[], titles: CupTitle[], finalists: CupFinalist[] = []): Stay[] {
  const extra = new Map<Stay, CupTitle[]>();
  const alone = new Map<string, { city: string; teams: Map<number, string>; league: string | null; finals: Set<number>; titles: Set<number> }>();
  const clubs = [...new Set([...titles.map((t) => t.club), ...finalists.map((t) => t.club)])].sort();
  const lone = (c: { club: string; city: string | null; team: string; league: string | null; year: number }) => {
    if (!c.city) return null;
    const k = `${c.club}|${c.city}`;
    const cur = alone.get(k) ?? { city: c.city, teams: new Map(), league: null, finals: new Set(), titles: new Set() };
    cur.league = c.league ?? cur.league;
    alone.set(k, cur);
    return { k, cur };
  };
  for (const t of titles) {
    const mine = t.franchise == null ? [] : stays.filter((s) => s.league === "nhl" && s.f === t.franchise);
    const at = mine.find((s) => s.city === t.city) ?? [...mine].sort((a, b) => a.first - b.first)[0];
    if (at) { extra.set(at, [...(extra.get(at) ?? []), t]); continue; }
    const x = lone(t);
    if (x) { x.cur.teams.set(t.year, t.team); x.cur.titles.add(t.year); }
  }
  for (const f of finalists) {
    // a finalist that is an NHL franchise with a stay is already a club of its city
    if (f.franchise != null && stays.some((s) => s.league === "nhl" && s.f === f.franchise)) continue;
    const x = lone(f);
    if (x) { x.cur.teams.set(f.year, f.team); x.cur.finals.add(f.year); }
  }
  const out = stays.map((s): Stay => {
    const add = extra.get(s);
    if (!add) return s;
    const list = [...add].sort((a, b) => a.year - b.year);
    return {
      ...s, first: Math.min(s.first, list[0].year),
      titles: [...list.map((t) => t.year), ...s.titles], titleTeams: [...list.map((t) => t.team), ...s.titleTeams], before: list.map((t) => t.year),
    };
  });
  for (const [k, c] of alone) {
    const club = k.slice(0, k.lastIndexOf("|"));
    const years = [...c.titles, ...c.finals].sort((a, b) => a - b);
    const titleYears = [...c.titles].sort((a, b) => a - b);
    const names = [...new Set(years.map((y) => c.teams.get(y) as string))];
    out.push({
      league: "nhl", f: standIn(club, clubs), city: c.city, name: c.teams.get(years[years.length - 1]) as string, names,
      first: years[0], last: years[years.length - 1], runs: [], seasons: 0,
      titles: titleYears, titleTeams: titleYears.map((y) => c.teams.get(y) as string), before: titleYears,
      rows: [], w: 0, l: 0, t: 0, otl: 0, share: null, active: false,
      cup: true, leagueLabel: c.league, finals: [...c.finals].sort((a, b) => a - b),
    });
  }
  return out.sort((a, b) => a.first - b.first || a.league.localeCompare(b.league) || a.f - b.f);
}

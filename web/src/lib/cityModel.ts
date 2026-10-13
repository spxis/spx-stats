/**
 * The city pages' numbers, worked out from three lists the database gives (no server code here, so a node script can test it):
 * the cities (api.city), the city of every club season (api.team_season_city) and the club seasons (api.team_seasons).
 * Which city a season belongs to is decided in the database (db/build/197_city.sql, scripts/city/README.md); this file only adds up.
 */

export interface CityRef {
  slug: string; name: string; nameFr: string | null; region: string; country: string;
  lat: number | null; lon: number | null; metro: string | null; metroName: string | null; metroNameFr: string | null;
}
export interface Placement { league: string; year: number; f: number; city: string; basis: string; venueLat: number | null; venueLon: number | null; venueCity: string | null }
export interface ClubSeason { league: string; year: number; f: number; team: string | null; w: number | null; l: number | null; t: number | null; otl: number | null; champion: boolean }

/** One club in one city: its seasons there, its record and its titles while it was there. */
export interface Stay {
  league: string; f: number; city: string;
  /** The name it wore last in this city. */
  name: string;
  names: string[];
  first: number; last: number;
  /** Runs of consecutive seasons (a season the league did not play does not break a run): [from, to]. */
  runs: [number, number][];
  seasons: number;
  titles: number[];
  /** The name it wore in each of those title seasons, in the same order. */
  titleTeams: string[];
  /** Each season there: [year, champion (0 or 1), wins, losses, ties, overtime losses], a missing record as -1. */
  rows: [number, number, number, number, number, number][];
  w: number; l: number; t: number; otl: number;
  /** Win share (a tie counts half, an overtime loss is a loss), null with no record. */
  share: number | null;
  active: boolean;
}

export const winShare = (w: number, l: number, t: number, otl: number): number | null => (w + l + t + otl > 0 ? (w + t / 2) / (w + l + t + otl) : null);

/** The key of a club season. */
export const seasonKey = (league: string, year: number, f: number) => `${league}|${year}|${f}`;

/** Every club of every city: its seasons there, joined from the placements and the club seasons. A season with no placement belongs to no city. */
export function buildStays(placements: Placement[], seasons: ClubSeason[]): Stay[] {
  const where = new Map(placements.map((p) => [seasonKey(p.league, p.year, p.f), p.city]));
  const leagueYears = new Map<string, number[]>();
  for (const s of seasons) { const l = leagueYears.get(s.league) ?? []; l.push(s.year); leagueYears.set(s.league, l); }
  const yearsOf = new Map<string, number[]>();
  for (const [lg, ys] of leagueYears) yearsOf.set(lg, [...new Set(ys)].sort((a, b) => a - b));
  const newest = new Map([...yearsOf].map(([lg, ys]) => [lg, ys[ys.length - 1]]));
  const by = new Map<string, { s: ClubSeason; city: string }[]>();
  for (const s of seasons) {
    const city = where.get(seasonKey(s.league, s.year, s.f));
    if (!city) continue;
    const k = `${s.league}|${s.f}|${city}`;
    const list = by.get(k) ?? [];
    list.push({ s, city });
    by.set(k, list);
  }
  const out: Stay[] = [];
  for (const list of by.values()) {
    list.sort((a, b) => a.s.year - b.s.year);
    const { league, f } = list[0].s;
    const order = yearsOf.get(league) ?? [];
    const at = new Map(order.map((y, i) => [y, i]));
    const runs: [number, number][] = [];
    for (const { s } of list) {
      const run = runs[runs.length - 1];
      if (run && at.get(s.year) === (at.get(run[1]) ?? -9) + 1) run[1] = s.year; else runs.push([s.year, s.year]);
    }
    let w = 0, l = 0, t = 0, otl = 0;
    for (const { s } of list) { w += s.w ?? 0; l += s.l ?? 0; t += s.t ?? 0; otl += s.otl ?? 0; }
    const named = list.filter((x) => x.s.team);
    out.push({
      league, f, city: list[0].city,
      name: named.at(-1)?.s.team ?? "",
      names: [...new Set(named.map((x) => x.s.team as string))],
      first: list[0].s.year, last: list[list.length - 1].s.year, runs,
      seasons: list.length, titles: list.filter((x) => x.s.champion).map((x) => x.s.year), titleTeams: list.filter((x) => x.s.champion).map((x) => x.s.team ?? named.at(-1)?.s.team ?? ""),
      rows: list.map(({ s }) => [s.year, s.champion ? 1 : 0, s.w ?? -1, s.l ?? -1, s.t ?? 0, s.otl ?? 0]),
      w, l, t, otl, share: winShare(w, l, t, otl),
      active: list[list.length - 1].s.year === newest.get(league),
    });
  }
  return out.sort((a, b) => a.first - b.first || a.league.localeCompare(b.league) || a.f - b.f);
}

export interface Totals { clubs: number; active: number; seasons: number; titles: number; w: number; l: number; t: number; otl: number; share: number | null; first: number | null; last: number | null; leagues: string[] }

export function totalsOf(stays: Stay[]): Totals {
  const sum = (k: "seasons" | "w" | "l" | "t" | "otl") => stays.reduce((a, s) => a + s[k], 0);
  const w = sum("w"), l = sum("l"), t = sum("t"), otl = sum("otl");
  return {
    clubs: stays.length, active: stays.filter((s) => s.active).length, seasons: sum("seasons"), titles: stays.reduce((a, s) => a + s.titles.length, 0),
    w, l, t, otl, share: winShare(w, l, t, otl),
    first: stays.length ? Math.min(...stays.map((s) => s.first)) : null, last: stays.length ? Math.max(...stays.map((s) => s.last)) : null,
    leagues: [...new Set(stays.map((s) => s.league))].sort(),
  };
}

/** Championships by league and decade: decade (1990 for 1990-1999) to league to count. */
export function titlesByDecade(stays: Stay[]): Map<number, Record<string, number>> {
  const out = new Map<number, Record<string, number>>();
  for (const s of stays) for (const y of s.titles) {
    const d = Math.floor(y / 10) * 10;
    const row = out.get(d) ?? {};
    row[s.league] = (row[s.league] ?? 0) + 1;
    out.set(d, row);
  }
  return out;
}

/** The unit a city is ranked and grouped as: its metro area, or itself when it belongs to none. */
export const unitOf = (c: Pick<CityRef, "slug" | "metro">) => c.metro ?? c.slug;

/** A club's seasons that fall in from..to (a stay's seasons are not kept one by one, so a run that straddles the edge counts the years inside it). */
export function runYearsIn(runs: [number, number][], from: number, to: number): boolean {
  return runs.some(([a, b]) => a <= to && b >= from);
}

/** Least club seasons a city or metro area needs to be ranked by title rate and by win share: below it one lucky decade decides. */
export const MIN_RANKED_SEASONS = 100;

export type RankKey = "titles" | "rate" | "share";
export interface Rank { rank: number; of: number; value: number | null }
export interface UnitTotals extends Totals { unit: string }

/** The totals of every ranking unit (city or metro area), keyed by the unit's slug. */
export function unitTotals(cities: CityRef[], stays: Stay[]): Map<string, UnitTotals> {
  const unit = new Map(cities.map((c) => [c.slug, unitOf(c)]));
  const groups = new Map<string, Stay[]>();
  for (const s of stays) {
    const u = unit.get(s.city);
    if (!u) continue;
    groups.set(u, [...(groups.get(u) ?? []), s]);
  }
  return new Map([...groups].map(([u, list]) => [u, { unit: u, ...totalsOf(list) }]));
}

/** Where a unit stands among all units with a club, by one measure: competition ranking (ties share a place); null when it has no value or too few seasons. */
export function rankOf(all: Map<string, Totals>, key: string, by: RankKey): Rank | null {
  const value = (t: Totals): number | null =>
    by === "titles" ? t.titles
      : t.seasons < MIN_RANKED_SEASONS ? null
        : by === "rate" ? (100 * t.titles) / t.seasons
          : t.share;
  const mine = all.get(key);
  if (!mine) return null;
  const v = value(mine);
  if (v == null) return null;
  const others = [...all.values()].map(value).filter((x): x is number => x != null);
  return { rank: 1 + others.filter((x) => x > v + 1e-12).length, of: others.length, value: v };
}

import { plainName } from "./words.ts";

/**
 * Who a club, or a building, was on a given day. A dated fact names a club by what it was called THEN: "the Colorado Avalanche retired Adam Foote's No. 52" in 2013, never "the Quebec
 * Nordiques" (the franchise's first name, which the meigen-sports data wrote for a retired number). The identities are the database's: `api.franchise_names` (each name with the
 * day it began and ended) and, where those leave a gap, `api.team_season_index` (the name each season was played under). A name that cannot be settled gives `null`, and the
 * build drops the fact (or the clause) rather than guess. Pure functions over rows passed in, so a test can use a handful of rows.
 */

export interface NameRow { league: string; franchise_id: number; name: string; name_from: string | null; name_to: string | null }
export interface SeasonName { league: string; franchise_id: number; year: number; team: string }
export interface VenueNameRow { wikidata_id: string; name: string; from_year: number | null; until_year: number | null }

export class ClubNames {
  private windows = new Map<string, NameRow[]>();
  private seasons = new Map<string, Map<number, string>>();

  constructor(rows: readonly NameRow[], seasons: readonly SeasonName[]) {
    for (const r of rows) { const k = `${r.league}|${r.franchise_id}`; (this.windows.get(k) ?? this.windows.set(k, []).get(k)!).push(r); }
    for (const s of seasons) { const k = `${s.league}|${s.franchise_id}`; (this.seasons.get(k) ?? this.seasons.set(k, new Map()).get(k)!).set(s.year, s.team); }
  }

  /** The franchise's name on `date` ("YYYY-MM-DD"): the one name in force that day; else the one name of the seasons that day can belong to (the year before and the year itself, as a
   * season runs across New Year); null when there is none, or two (a rename between them that the dates do not settle). */
  at(league: string, franchise: number, date: string): string | null {
    const inForce = new Set((this.windows.get(`${league}|${franchise}`) ?? []).filter((w) => (!w.name_from || w.name_from <= date) && (!w.name_to || date < w.name_to)).map((w) => w.name));
    if (inForce.size === 1) return [...inForce][0];
    if (inForce.size > 1) return null;
    const y = Number(date.slice(0, 4));
    const s = this.seasons.get(`${league}|${franchise}`);
    const named = new Set([s?.get(y - 1), s?.get(y)].filter((x): x is string => !!x));
    return named.size === 1 ? [...named][0] : null;
  }

  /** Every name the franchise carried at any time from the season `fromYear` to the end of the season `toYear` (a season ends in the next calendar year), as plain names. */
  duringSeasons(league: string, franchise: number, fromYear: number, toYear: number): Set<string> {
    const lo = `${fromYear}-01-01`, hi = `${toYear + 1}-12-31`;
    const out = new Set<string>();
    for (const w of this.windows.get(`${league}|${franchise}`) ?? []) if ((!w.name_to || w.name_to > lo) && (!w.name_from || w.name_from <= hi)) out.add(plainName(w.name));
    const s = this.seasons.get(`${league}|${franchise}`);
    for (let y = fromYear; y <= toYear; y++) { const t = s?.get(y); if (t) out.add(plainName(t)); }
    return out;
  }
}

export class VenueNames {
  private byName = new Map<string, Set<string>>();
  private byId = new Map<string, VenueNameRow[]>();

  constructor(rows: readonly VenueNameRow[]) {
    for (const r of rows) {
      const k = plainName(r.name);
      (this.byName.get(k) ?? this.byName.set(k, new Set()).get(k)!).add(r.wikidata_id);
      (this.byId.get(r.wikidata_id) ?? this.byId.set(r.wikidata_id, []).get(r.wikidata_id)!).push(r);
    }
  }

  /** What a building was called in `year`, given the name a fact uses (usually today's). `{ keep }` when the database knows no history for that name (it never changed, as far as it says) or the
   * name is the one in that year; `{ name }` the name of that year when it differs; `null` when the building had names but none covers that year, or the name could be two buildings that disagree. */
  in(name: string, year: number): { keep: true } | { name: string } | null {
    const ids = this.byName.get(plainName(name));
    if (!ids) return { keep: true };
    const answers = new Set<string>();
    for (const id of ids) {
      const covering = (this.byId.get(id) ?? []).filter((r) => (r.from_year == null || r.from_year <= year) && (r.until_year == null || year <= r.until_year));
      const names = new Set(covering.map((r) => r.name));
      if (names.size !== 1) return null;
      answers.add([...names][0]);
    }
    if (answers.size !== 1) return null;
    const there = [...answers][0];
    return plainName(there) === plainName(name) ? { keep: true } : { name: there };
  }
}

/** The clubs a person's sentence names (those of `clubNames`, written with their years) that are not a name of any club he played for while he played for it (`his`, plain names). */
export function unknownClubs(sentence: string, clubNames: readonly string[], his: ReadonlySet<string>): string[] {
  const plain = plainName(sentence);
  return clubNames.map((c) => c.replace(/ \([^)]*\)$/, "")).filter((c) => plain.includes(plainName(c)) && !his.has(plainName(c)));
}

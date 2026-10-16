/**
 * The PostgREST query behind the admin people search. Pure: nothing a caller types reaches the
 * query unchecked. Used by the admin page and by scripts/adminPeople.test.ts.
 */
import { searchFilters, searchWords } from "./listQuery.ts";

export { searchWords };

export const PEOPLE_PER_PAGE = 50;
export const PERSON_ADMIN_VIEW = "person_admin";
export const PERSON_ADMIN_SELECT = [
  "person_id",
  "name",
  "kind",
  "country",
  "birth_date",
  "death_date",
  "birth_year",
  "death_year",
  "qid",
  "sports",
  "leagues",
  "has_seasons",
  "seasons_played",
  "first_season",
  "last_season",
  "sources",
] as const;

const SPORT = /^[a-z][a-z0-9_]{0,39}$/;
const SOURCE = /^[a-z][a-z0-9_]{0,39}$/;
const COUNTRY = /^[A-Za-z]{2}$/;

export type SeasonsFilter = "yes" | "no";

export interface PeopleSearch {
  words: readonly string[];
  sport?: string;
  country?: string;
  bornFrom?: number;
  bornTo?: number;
  seasons?: SeasonsFilter;
  source?: string;
}

export function readSport(raw: string | null | undefined): string | undefined {
  const s = (raw ?? "").trim().toLowerCase();
  return SPORT.test(s) ? s : undefined;
}

export function readSource(raw: string | null | undefined): string | undefined {
  const s = (raw ?? "").trim().toLowerCase();
  return SOURCE.test(s) ? s : undefined;
}

export function readCountry(raw: string | null | undefined): string | undefined {
  const s = (raw ?? "").trim();
  return COUNTRY.test(s) ? s.toUpperCase() : undefined;
}

export function readYear(raw: string | null | undefined): number | undefined {
  const n = Number((raw ?? "").trim());
  return Number.isInteger(n) && n >= 1800 && n <= 2100 ? n : undefined;
}

export function readSeasons(raw: string | null | undefined): SeasonsFilter | undefined {
  return raw === "yes" || raw === "no" ? raw : undefined;
}

export function readPage(raw: string | null | undefined): number {
  const n = Number((raw ?? "").trim());
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

/** True when the form has at least one filter, so the page should ask the database. */
export function hasPeopleFilter(f: PeopleSearch): boolean {
  return Boolean(f.words.length || f.sport || f.country || f.bornFrom || f.bornTo || f.seasons || f.source);
}

export function parsePeopleSearch(q: Record<string, string | string[] | undefined>): PeopleSearch & { page: number } {
  const one = (k: string) => {
    const v = q[k];
    return Array.isArray(v) ? v[0] : v;
  };
  let bornFrom = readYear(one("born_from"));
  let bornTo = readYear(one("born_to"));
  if (bornFrom != null && bornTo != null && bornFrom > bornTo) [bornFrom, bornTo] = [bornTo, bornFrom];
  return {
    words: searchWords(one("q") ?? ""),
    sport: readSport(one("sport")),
    country: readCountry(one("country")),
    bornFrom,
    bornTo,
    seasons: readSeasons(one("seasons")),
    source: readSource(one("source")),
    page: readPage(one("page")),
  };
}

/** PostgREST filters for api.person_admin. Each value is already allow-listed. */
export function peopleAdminFilters(f: PeopleSearch): string[] {
  return [
    ...searchFilters(f.words),
    f.sport ? `sports=cs.${encodeURIComponent(`{${f.sport}}`)}` : "",
    f.country ? `country=eq.${encodeURIComponent(f.country)}` : "",
    f.bornFrom != null ? `birth_year=gte.${f.bornFrom}` : "",
    f.bornTo != null ? `birth_year=lte.${f.bornTo}` : "",
    f.seasons === "yes" ? "has_seasons=eq.true" : f.seasons === "no" ? "has_seasons=eq.false" : "",
    f.source ? `sources=cs.${encodeURIComponent(`{${f.source}}`)}` : "",
  ].filter(Boolean);
}

export function peopleAdminQuery(f: PeopleSearch): string {
  return [...peopleAdminFilters(f), `select=${PERSON_ADMIN_SELECT.join(",")}`, "order=name.asc,person_id.asc"].join("&");
}

/** Fallback on api.people when person_admin is not installed: name, country, birth dates, seasons_played. No sport, QID or source. */
export function peopleFallbackQuery(f: PeopleSearch): string {
  const filters = [
    ...f.words.map((w) => `name=ilike.${encodeURIComponent(`*${w}*`)}`),
    f.country ? `or=${encodeURIComponent(`(birth_country_code.eq.${f.country},nationality_code.eq.${f.country})`)}` : "",
    f.bornFrom != null ? `birth_date=gte.${f.bornFrom}-01-01` : "",
    f.bornTo != null ? `birth_date=lte.${f.bornTo}-12-31` : "",
    f.seasons === "yes" ? "seasons_played=gt.0" : f.seasons === "no" ? "seasons_played=eq.0" : "",
  ].filter(Boolean);
  return [...filters, "select=person_id,name,kind,birth_country_code,nationality_code,birth_date,death_date,leagues,seasons_played,first_season,last_season", "order=name.asc,person_id.asc"].join("&");
}

/**
 * The PostgREST query behind the admin people list. Pure: nothing a caller types reaches the
 * query unchecked. Same filter keys as /players (`q`, `nat`, `letter`, `letter_by`, `from`, `to`,
 * `league`, `sort`, `page`, `after`) plus `sport`, `seasons` and `source`. Used by the admin page
 * and by scripts/adminPeople.test.ts.
 */
import { isLeague } from "./leagues.ts";
import { letterFilterPlain, listQuery, orderOf, readLetter, searchFilters, searchWords, type Col, type LetterBy, type Order, type Val } from "./listQuery.ts";
import type { SortKey } from "./sort.ts";

export { searchWords, readLetter };
export type { LetterBy, Order, Val };

export const PEOPLE_PER_PAGE = 100;
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
  league?: string;
  from?: number;
  to?: number;
  seasons?: SeasonsFilter;
  source?: string;
  letter?: string;
  letterBy?: LetterBy;
  /** Opaque keyset cursor (`?after=`), the same encoding as the list APIs. */
  after?: string;
}

/** The columns of the people table, by the field of api.person_admin each sorts on. */
export const PEOPLE_SORTS: Record<string, Col> = {
  name: { field: "name" },
  sports: { field: "sports", noCursor: true },
  country: { field: "country", nullable: true },
  born: { field: "birth_year", num: true, nullable: true },
  leagues: { field: "leagues", noCursor: true },
  seasons: { field: "seasons_played", num: true },
  qid: { field: "qid", nullable: true },
  sources: { field: "sources", noCursor: true },
};
export const PEOPLE_TIE: Col[] = [{ field: "name" }, { field: "person_id", num: true }];
export const peopleOrder = (sort: readonly SortKey[]): Order => orderOf(sort, PEOPLE_SORTS, PEOPLE_TIE);

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

const one = (q: Record<string, string | string[] | undefined>, k: string) => {
  const v = q[k];
  return Array.isArray(v) ? v[0] : v;
};

export function parsePeopleSearch(q: Record<string, string | string[] | undefined>): PeopleSearch & { page: number } {
  let from = readYear(one(q, "from") ?? one(q, "born_from"));
  let to = readYear(one(q, "to") ?? one(q, "born_to"));
  if (from != null && to != null && from > to) [from, to] = [to, from];
  const askedLeague = (one(q, "league") ?? "").trim().toLowerCase();
  const letter = readLetter(one(q, "letter"));
  const after = (one(q, "after") ?? "").trim();
  return {
    words: searchWords(one(q, "q") ?? ""),
    sport: readSport(one(q, "sport")),
    country: readCountry(one(q, "nat") ?? one(q, "country")),
    league: isLeague(askedLeague) ? askedLeague : undefined,
    from,
    to,
    seasons: readSeasons(one(q, "seasons")),
    source: readSource(one(q, "source")),
    letter: letter ?? undefined,
    letterBy: one(q, "letter_by") === "first" ? "first" : "last",
    after: after || undefined,
    page: readPage(one(q, "page")),
  };
}

/** PostgREST filters for api.person_admin. Each value is already allow-listed. A-Z uses the indexed letter columns (migration 123). Birth years use from/to (the same slider as /players). */
export function peopleAdminFilters(f: PeopleSearch): string[] {
  const letter = readLetter(f.letter);
  const letterCol = (f.letterBy ?? "last") === "first" ? "letter_first" : "letter_last";
  return [
    ...searchFilters(f.words),
    f.sport ? `sports=cs.${encodeURIComponent(`{${f.sport}}`)}` : "",
    f.country ? `country=eq.${encodeURIComponent(f.country)}` : "",
    f.league ? `leagues=cs.${encodeURIComponent(`{${f.league}}`)}` : "",
    f.from != null ? `birth_year=gte.${f.from}` : "",
    f.to != null ? `birth_year=lte.${f.to}` : "",
    f.seasons === "yes" ? "has_seasons=eq.true" : f.seasons === "no" ? "has_seasons=eq.false" : "",
    f.source ? `sources=cs.${encodeURIComponent(`{${f.source}}`)}` : "",
    letter ? `${letterCol}=eq.${letter}` : "",
  ].filter(Boolean);
}

export function peopleAdminQuery(f: PeopleSearch, order: Order = peopleOrder([{ key: "name", dir: "asc" }]), after?: readonly Val[] | null): string {
  return listQuery({ filters: peopleAdminFilters(f), select: PERSON_ADMIN_SELECT, order, after });
}

/** Fallback on api.people when person_admin is not installed: name, country, birth dates, seasons_played. No sport, QID or source. */
export function peopleFallbackQuery(f: PeopleSearch, order: Order = peopleOrder([{ key: "name", dir: "asc" }]), after?: readonly Val[] | null): string {
  const letter = readLetter(f.letter);
  const filters = [
    ...f.words.map((w) => `name=ilike.${encodeURIComponent(`*${w}*`)}`),
    f.country ? `or=${encodeURIComponent(`(birth_country_code.eq.${f.country},nationality_code.eq.${f.country})`)}` : "",
    f.league ? `leagues=cs.${encodeURIComponent(`{${f.league}}`)}` : "",
    f.from != null ? `birth_date=gte.${f.from}-01-01` : "",
    f.to != null ? `birth_date=lte.${f.to}-12-31` : "",
    f.seasons === "yes" ? "seasons_played=gt.0" : f.seasons === "no" ? "seasons_played=eq.0" : "",
    letter ? letterFilterPlain(letter, f.letterBy ?? "last") : "",
  ].filter(Boolean);
  return listQuery({
    filters,
    select: ["person_id", "name", "kind", "birth_country_code", "nationality_code", "birth_date", "death_date", "leagues", "seasons_played", "first_season", "last_season"],
    order: order.map((c) => (c.field === "birth_year" ? { ...c, field: "birth_date", num: false } : c)).filter((c) => !["sports", "qid", "sources", "has_seasons"].includes(c.field)),
    after,
  });
}

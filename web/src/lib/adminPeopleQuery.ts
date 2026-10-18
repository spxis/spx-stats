/**
 * The SQL behind the admin people list (Turso table api_person_admin). Pure: nothing a caller types reaches the
 * query unchecked. Same filter keys as /players (`q`, `nat`, `letter`, `letter_by`, `from`, `to`,
 * `league`, `sort`, `page`, `after`) plus `sport`, `seasons`, `source` and `role`. Used by the admin page
 * and by scripts/adminPeople.test.ts.
 */
import { isLeague } from "./leagues.ts";
import { orderOf, readLetter, searchWords, type Col, type LetterBy, type Order, type Val } from "./listQuery.ts";
import type { SortKey } from "./sort.ts";

export { searchWords, readLetter };
export type { LetterBy, Order, Val };

export const PEOPLE_PER_PAGE = 100;
export const PERSON_ADMIN_TABLE = "api_person_admin";
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
const ROLE = /^[a-z][a-z0-9_]{0,39}$/;
const COUNTRY = /^[A-Za-z]{2}$/;

/** The sport filter's code for people with no sport or activity at all (derived, never stored). */
export const NO_SPORT = "none";

/** Codes that are the same sport: choosing one matches both. */
const SAME_SPORT: Record<string, readonly string[]> = { hockey: ["hockey", "ice_hockey"], ice_hockey: ["hockey", "ice_hockey"] };
export const sportCodes = (code: string): readonly string[] => SAME_SPORT[code] ?? [code];

export type SeasonsFilter = "yes" | "no";

export interface PeopleSearch {
  words: readonly string[];
  sport?: string;
  country?: string;
  league?: string;
  from?: number;
  to?: number;
  seasons?: SeasonsFilter;
  /** Only people with a known year (a club season or a birth year) when a range is set. */
  dated?: boolean;
  source?: string;
  /** core.person.kind: player, coach, referee, executive... */
  role?: string;
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

export function readRole(raw: string | null | undefined): string | undefined {
  const s = (raw ?? "").trim().toLowerCase();
  return ROLE.test(s) ? s : undefined;
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
    dated: one(q, "dated") === "yes" ? true : undefined,
    source: readSource(one(q, "source")),
    role: readRole(one(q, "role")),
    letter: letter ?? undefined,
    letterBy: one(q, "letter_by") === "first" ? "first" : "last",
    after: after || undefined,
    page: readPage(one(q, "page")),
  };
}

/** A value bound to a `?` of the query. Nothing a caller types is ever put into the SQL text: only these allow-listed column names are. */
export type Arg = string | number | null;
export interface Sql { sql: string; args: Arg[] }

const inList = (col: string) => `exists (select 1 from json_each(${col}) where value = ?)`;

/**
 * The year range, over the years we know for each person: their club seasons when they have any, else their birth year. A person with no
 * years at all stays in the list, unless the reader asks for `dated` only.
 */
export function yearWhere(f: Pick<PeopleSearch, "from" | "to" | "dated">): Sql | null {
  if (f.from == null && f.to == null) return f.dated ? { sql: "(first_season is not null or birth_year is not null)", args: [] } : null;
  const lo = f.from ?? -9999;
  const hi = f.to ?? 9999;
  const clauses = ["(first_season <= ? and last_season >= ?)", "(first_season is null and birth_year >= ? and birth_year <= ?)"];
  const args: Arg[] = [hi, lo, lo, hi];
  if (!f.dated) clauses.push("(first_season is null and birth_year is null)");
  return { sql: `(${clauses.join(" or ")})`, args };
}

/** The WHERE of the people table: one `like` per search word on the folded name, the other filters allow-listed. */
export function peopleWhere(f: PeopleSearch): Sql {
  const letter = readLetter(f.letter);
  const letterCol = (f.letterBy ?? "last") === "first" ? "letter_first" : "letter_last";
  const parts: Sql[] = [
    ...f.words.map((w): Sql => ({ sql: "search like ?", args: [`%${w}%`] })),
    ...(f.sport === NO_SPORT ? [{ sql: "json_array_length(sports) = 0", args: [] }] : []),
    ...(f.sport && f.sport !== NO_SPORT
      ? [{ sql: `exists (select 1 from json_each(sports) where value in (${sportCodes(f.sport).map(() => "?").join(", ")}))`, args: [...sportCodes(f.sport)] }]
      : []),
    ...(f.country ? [{ sql: "country = ?", args: [f.country] }] : []),
    ...(f.league ? [{ sql: inList("leagues"), args: [f.league] }] : []),
    ...(yearWhere(f) ? [yearWhere(f) as Sql] : []),
    ...(f.seasons ? [{ sql: `has_seasons = ${f.seasons === "yes" ? 1 : 0}`, args: [] }] : []),
    ...(f.source ? [{ sql: inList("sources"), args: [f.source] }] : []),
    ...(f.role ? [{ sql: "kind = ?", args: [f.role] }] : []),
    ...(letter ? [{ sql: `${letterCol} = ?`, args: [letter] }] : []),
  ];
  return { sql: parts.length ? ` where ${parts.map((p) => p.sql).join(" and ")}` : "", args: parts.flatMap((p) => p.args) };
}

/** `order by`, empty values last either way, the field names coming only from PEOPLE_SORTS and PEOPLE_TIE. */
export const orderSql = (o: Order): string => `order by ${o.map((c) => `${c.field} ${c.dir}${c.nullable ? " nulls last" : ""}`).join(", ")}`;

/** The rows after a cursor: the sort fields' values of the last row seen, with empty values last. */
export function afterSql(o: Order, vals: readonly Val[]): Sql {
  const same = (c: Order[number], v: Val): Sql => (v == null ? { sql: `${c.field} is null`, args: [] } : { sql: `${c.field} = ?`, args: [v] });
  const parts: Sql[] = [];
  o.forEach((c, i) => {
    const v = vals[i];
    if (v == null) return;
    const lead = o.slice(0, i).map((p, j) => same(p, vals[j]));
    const past: Sql = { sql: `${c.field} ${c.dir === "asc" ? ">" : "<"} ?`, args: [v] };
    for (const last of c.nullable ? [past, { sql: `${c.field} is null`, args: [] as Arg[] }] : [past]) {
      const all = [...lead, last];
      parts.push({ sql: `(${all.map((a) => a.sql).join(" and ")})`, args: all.flatMap((a) => a.args) });
    }
  });
  if (!parts.length) return { sql: "1 = 0", args: [] };
  return { sql: `(${parts.map((p) => p.sql).join(" or ")})`, args: parts.flatMap((p) => p.args) };
}

export function peopleCountQuery(f: PeopleSearch): Sql {
  const w = peopleWhere(f);
  return { sql: `select count(*) as n from ${PERSON_ADMIN_TABLE}${w.sql}`, args: w.args };
}

/** One page: `limit` rows from `offset`, or the `limit` rows after the cursor. */
export function peopleQuery(f: PeopleSearch, order: Order, limit: number, offset = 0, after?: readonly Val[] | null): Sql {
  const w = peopleWhere(f);
  const cursor = after ? afterSql(order, after) : null;
  const where = cursor ? `${w.sql ? `${w.sql} and ` : " where "}${cursor.sql}` : w.sql;
  return {
    sql: `select ${PERSON_ADMIN_SELECT.join(", ")} from ${PERSON_ADMIN_TABLE}${where} ${orderSql(order)} limit ${Math.trunc(limit)} offset ${Math.trunc(offset)}`,
    args: [...w.args, ...(cursor ? cursor.args : [])],
  };
}

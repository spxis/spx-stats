import "server-only";
import { z } from "zod";
import { ApiError } from "./api/error";
import {
  PEOPLE_PER_PAGE,
  PERSON_ADMIN_TABLE,
  peopleCountQuery,
  peopleOrder,
  peopleQuery,
  peopleWhere,
  NO_SPORT,
  searchWords,
  type PeopleSearch,
} from "./adminPeopleQuery";
import { tally, UNKNOWN, type Count } from "./countryModel";
import { cursorOf, readCursor, valuesOf } from "./listQuery";
import type { Span } from "./listSpan";
import type { Tally } from "./playerCountryModel";
import { getPlayerPaths } from "./playerLinks";
import { formatSort, type SortKey } from "./sort";
import { jsonStrings, tursoRows } from "./turso/client";

export {
  PEOPLE_PER_PAGE,
  NO_SPORT,
  PEOPLE_SORTS,
  parsePeopleSearch,
  peopleOrder,
  type PeopleSearch,
} from "./adminPeopleQuery";

const int = z.number();
const intN = z.number().nullable();
const str = z.string();
const strN = z.string().nullable();

/** A JSON array column (stored as text in Turso) as an array. */
const jsonList = z.string().nullable().transform((v) => jsonStrings(v));

/** A row of the Turso table api_person_admin as the page uses it: JSON text columns are arrays, 0/1 is a boolean. */
const personAdminRow = z.object({
  person_id: int,
  name: str,
  kind: str,
  country: strN,
  birth_date: strN,
  death_date: strN,
  birth_year: intN,
  death_year: intN,
  qid: strN,
  sports: jsonList,
  leagues: jsonList,
  has_seasons: z.number().transform((v) => v === 1),
  seasons_played: int,
  first_season: intN,
  last_season: intN,
  sources: jsonList,
});

export interface PersonAdminRow {
  person_id: number;
  name: string;
  kind: string;
  country: string | null;
  birth_date: string | null;
  death_date: string | null;
  birth_year: number | null;
  death_year: number | null;
  qid: string | null;
  sports: string[];
  leagues: string[] | null;
  has_seasons: boolean;
  seasons_played: number;
  first_season: number | null;
  last_season: number | null;
  sources: string[];
}

const toRow = (r: z.infer<typeof personAdminRow>): PersonAdminRow => ({ ...r, sports: r.sports ?? [], sources: r.sources ?? [] });

const OPTS = { tables: [PERSON_ADMIN_TABLE], live: true } as const;

/** Rows of a count/group query on the people table; null when Turso cannot answer, so a chip row simply does not draw. */
async function sliceOf<S extends z.ZodType>(sql: string, schema: S, args: readonly (string | number | null)[] = []): Promise<z.infer<S>[] | null> {
  try {
    return await tursoRows(sql, args, schema, OPTS);
  } catch {
    return null;
  }
}

export type PeopleSearchResult =
  | { kind: "ok"; rows: PersonAdminRow[]; total: number | null; page: number; pages: number; next: string | null; fallback: boolean; keyed: boolean }
  | { kind: "error"; message: string };

function nextOf(sortText: string, order: ReturnType<typeof peopleOrder>, rows: PersonAdminRow[], more: boolean): string | null {
  if (!more || !rows.length || order.some((c) => c.noCursor)) return null;
  return cursorOf(sortText, valuesOf(order, rows[rows.length - 1] as unknown as Record<string, unknown>));
}

/**
 * One page of every core.person, including athletes with no club season, from the Turso table api_person_admin (a copy of DS1's
 * api.person_admin, published by a data release). `?page=` is offset (numbered pager, same as /players). `?after=` is keyset (no total).
 */
export async function searchPeople(f: PeopleSearch, page: number, sort: readonly SortKey[] = [{ key: "name", dir: "asc" }]): Promise<PeopleSearchResult> {
  const order = peopleOrder(sort);
  const sortText = formatSort(sort) || "name.asc";
  const after = f.after && !order.some((c) => c.noCursor) ? readCursor(f.after, sortText, order) : null;
  const from = (page - 1) * PEOPLE_PER_PAGE;
  try {
    if (after) {
      const q = peopleQuery(f, order, PEOPLE_PER_PAGE + 1, 0, after);
      const extra = (await tursoRows(q.sql, q.args, personAdminRow, OPTS)).map(toRow);
      const rows = extra.slice(0, PEOPLE_PER_PAGE);
      const more = extra.length > PEOPLE_PER_PAGE;
      return { kind: "ok", rows, total: null, page: 1, pages: more ? 2 : 1, next: nextOf(sortText, order, rows, more), fallback: false, keyed: true };
    }
    const q = peopleQuery(f, order, PEOPLE_PER_PAGE, from);
    const c = peopleCountQuery(f);
    const [list, count] = await Promise.all([tursoRows(q.sql, q.args, personAdminRow, OPTS), tursoRows(c.sql, c.args, z.object({ n: int }), OPTS)]);
    const rows = list.map(toRow);
    const total = count[0]?.n ?? 0;
    const pages = Math.max(1, Math.ceil(total / PEOPLE_PER_PAGE));
    return { kind: "ok", rows, total, page, pages, next: nextOf(sortText, order, rows, from + rows.length < total), fallback: false, keyed: false };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : "Couldn't load" };
  }
}

const spanSchema = z.object({ min_year: intN, max_year: intN });

/** The year slider's min..max: the earliest birth year in the people table to the current year (club seasons run to now). Null when Turso or the years are missing. */
export async function peopleSpan(): Promise<Span | null> {
  const r = await sliceOf(`select min(birth_year) as min_year, max(birth_year) as max_year from ${PERSON_ADMIN_TABLE} where birth_year is not null`, spanSchema);
  const g = r?.[0];
  if (!g || g.min_year == null || g.max_year == null) return null;
  return { min: g.min_year, max: Math.max(g.max_year, g.min_year, new Date().getFullYear()) };
}

const countryCountSchema = z.object({ country: strN, n: int });
const sportCountSchema = z.object({ sport: str, n: int });
const sourceCountSchema = z.object({ source: str, n: int });
const letterCountSchema = z.object({ letter: str, n: int });

/**
 * Country chips for the people list. Built from known countries only so the players chip row still draws
 * when most people have no country yet (PlayerCountries hides itself under 10% known).
 */
export async function peopleCountries(): Promise<Tally | null> {
  const rows = await sliceOf(`select country, count(*) as n from ${PERSON_ADMIN_TABLE} where country is not null group by country order by n desc limit 300`, countryCountSchema);
  if (!rows?.length) return null;
  const pairs: [string, number][] = rows.filter((r) => r.country && r.country !== UNKNOWN).map((r) => [r.country!, r.n]);
  return pairs.length ? tally(pairs) : null;
}

/** The sport / activity chips' counts, people counted once (hockey and ice hockey together), then a last row `none` for people with no sport or activity. */
export async function peopleSports(): Promise<Count[] | null> {
  const [rows, none] = await Promise.all([
    sliceOf(`select case j.value when 'hockey' then 'ice_hockey' else j.value end as sport, count(distinct p.person_id) as n from ${PERSON_ADMIN_TABLE} p, json_each(p.sports) j group by 1 order by n desc limit 300`, sportCountSchema),
    sliceOf(`select count(*) as n from ${PERSON_ADMIN_TABLE} where json_array_length(sports) = 0`, z.object({ n: int })),
  ]);
  if (!rows?.length) return null;
  return [...rows.map((r) => ({ code: r.sport, n: r.n })), ...(none?.[0]?.n ? [{ code: NO_SPORT, n: none[0].n }] : [])];
}

/** The source chips' counts: the people the other filters leave, by source; the source filter itself is not applied, so the chips stay choosable. */
export async function peopleSources(f: PeopleSearch): Promise<Count[] | null> {
  const w = peopleWhere({ ...f, source: undefined });
  const rows = await sliceOf(`select j.value as source, count(*) as n from (select sources from ${PERSON_ADMIN_TABLE}${w.sql}) p, json_each(p.sources) j group by j.value order by n desc limit 80`, sourceCountSchema, w.args);
  if (!rows?.length) return null;
  return rows.map((r) => ({ code: r.source, n: r.n }));
}

/** The role chips' counts (core.person.kind): the people the other filters leave, by kind; the role filter itself is not applied. */
export async function peopleRoles(f: PeopleSearch): Promise<Count[] | null> {
  const w = peopleWhere({ ...f, role: undefined });
  const rows = await sliceOf(`select kind, count(*) as n from ${PERSON_ADMIN_TABLE}${w.sql} group by kind order by n desc limit 20`, z.object({ kind: str, n: int }), w.args);
  if (!rows?.length) return null;
  return rows.map((r) => ({ code: r.kind, n: r.n }));
}

/** A–Z counts of the people table. Null greys nothing, as /players does without player_letters. */
export async function peopleLetterCounts(by: "last" | "first"): Promise<Map<string, number> | null> {
  const col = by === "first" ? "letter_first" : "letter_last";
  const rows = await sliceOf(`select ${col} as letter, count(*) as n from ${PERSON_ADMIN_TABLE} where ${col} is not null group by ${col} order by n desc limit 26`, letterCountSchema);
  if (!rows?.length) return null;
  const out = new Map<string, number>();
  for (const r of rows) {
    const letter = r.letter.toLowerCase();
    if (/^[a-z]$/.test(letter)) out.set(letter, r.n);
  }
  return out.size ? out : null;
}

const suggestSchema = z.object({ person_id: int, name: str, sports: jsonList, leagues: jsonList, birth_year: intN, first_season: intN, last_season: intN });
export interface PersonSuggestion { id: number; name: string; league: string; first_season: number | null; last_season: number | null; url: string }

/**
 * Up to 10 people for the admin search box, from the people table (so athletes with no club season are found): names that start with the text,
 * then words that start with it, then names that contain it. Players link to their page, everyone else to the filtered list.
 */
export async function suggestPeople(raw: string): Promise<PersonSuggestion[]> {
  const q = searchWords(raw).join(" ");
  if (!q) return [];
  const tiers = [`${q}%`, `% ${q}%`, ...(q.length >= 3 ? [`%${q}%`] : [])];
  const sql = `select person_id, name, sports, leagues, birth_year, first_season, last_season from ${PERSON_ADMIN_TABLE} where search like ? order by name asc, person_id asc limit 10`;
  const found = await Promise.all(tiers.map((t) => tursoRows(sql, [t], suggestSchema, OPTS).catch(() => null)));
  if (found.every((f) => f === null)) throw new ApiError(`${PERSON_ADMIN_TABLE}: couldn't read`, 502, true);
  const seen = new Set<number>();
  const picked = found.flatMap((f) => f ?? []).filter((p) => !seen.has(p.person_id) && !!seen.add(p.person_id)).slice(0, 10);
  const player = await getPlayerPaths();
  return picked.map((p) => {
    const sports = p.sports ?? [];
    return {
      id: p.person_id,
      name: p.name,
      league: [p.leagues?.[0]?.toUpperCase() ?? sports[0]?.replaceAll("_", " "), p.first_season == null && p.birth_year != null ? `b. ${p.birth_year}` : ""].filter(Boolean).join(" · "),
      first_season: p.first_season,
      last_season: p.last_season,
      url: p.leagues?.[0] ? player(p.person_id, p.name, p.leagues[0]) : `/admin/people?q=${encodeURIComponent(p.name)}`,
    };
  });
}

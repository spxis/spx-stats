import "server-only";
import { z } from "zod";
import { API_KEY, REST_URL } from "./api/config";
import { ApiError } from "./api/client";
import { isTransient } from "./api/failure";
import {
  PEOPLE_PER_PAGE,
  PERSON_ADMIN_VIEW,
  peopleAdminQuery,
  peopleFallbackQuery,
  peopleOrder,
  type PeopleSearch,
} from "./adminPeopleQuery";
import { tally, UNKNOWN, type Count } from "./countryModel";
import { cursorOf, readCursor, valuesOf } from "./listQuery";
import type { Span } from "./listSpan";
import type { Tally } from "./playerCountryModel";
import { formatSort, type SortKey } from "./sort";

export {
  PEOPLE_PER_PAGE,
  PEOPLE_SORTS,
  parsePeopleSearch,
  peopleOrder,
  type PeopleSearch,
} from "./adminPeopleQuery";

const int = z.number();
const intN = z.number().nullable();
const str = z.string();
const strN = z.string().nullable();
const strs = z.array(str).nullable();

export const personAdminSchema = z.object({
  person_id: int,
  name: str,
  kind: str,
  country: strN,
  birth_date: strN,
  death_date: strN,
  birth_year: intN,
  death_year: intN,
  qid: strN,
  sports: z.array(str),
  leagues: strs,
  has_seasons: z.boolean(),
  seasons_played: int,
  first_season: intN,
  last_season: intN,
  sources: z.array(str),
});
export type PersonAdminRow = z.infer<typeof personAdminSchema>;

const peopleFallbackSchema = z.object({
  person_id: int,
  name: str,
  kind: str,
  birth_country_code: strN,
  nationality_code: strN,
  birth_date: strN,
  death_date: strN,
  leagues: strs,
  seasons_played: int,
  first_season: intN,
  last_season: intN,
});

function fromPeople(row: z.infer<typeof peopleFallbackSchema>): PersonAdminRow {
  const country = row.birth_country_code ?? row.nationality_code;
  const year = (iso: string | null) => (iso && /^\d{4}/.test(iso) ? Number(iso.slice(0, 4)) : null);
  return {
    person_id: row.person_id,
    name: row.name,
    kind: row.kind,
    country,
    birth_date: row.birth_date,
    death_date: row.death_date,
    birth_year: year(row.birth_date),
    death_year: year(row.death_date),
    qid: null,
    sports: [],
    leagues: row.leagues,
    has_seasons: row.seasons_played > 0,
    seasons_played: row.seasons_played,
    first_season: row.first_season,
    last_season: row.last_season,
    sources: [],
  };
}

const TIMEOUT_MS = 8000;

async function windowOf<S extends z.ZodType>(
  view: string,
  query: string,
  from: number,
  size: number,
  schema: S,
): Promise<{ rows: z.infer<S>[]; total: number }> {
  let last = "";
  let threw = false;
  for (let attempt = 0; attempt <= 1; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 300));
    try {
      const res = await fetch(`${REST_URL}${view}?${query}`, {
        headers: {
          apikey: API_KEY,
          "Accept-Profile": "api",
          Range: `${from}-${from + size - 1}`,
          Prefer: "count=exact",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const total = /\/(\d+)$/.exec(res.headers.get("content-range") ?? "")?.[1];
      if ((res.ok || res.status === 416) && total != null) {
        const part = res.ok ? ((await res.json()) as unknown) : [];
        if (!Array.isArray(part)) throw new ApiError(`${view}: expected a list of rows`);
        const rows: z.infer<S>[] = [];
        for (const row of part) {
          const parsed = schema.safeParse(row);
          if (!parsed.success) {
            throw new ApiError(`${view}: unexpected row shape (${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message})`);
          }
          rows.push(parsed.data);
        }
        return { rows, total: Number(total) };
      }
      last = String(res.status);
      threw = false;
      if (res.status < 500) throw new ApiError(`${view}: ${last}`, res.status, false);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      last = e instanceof Error ? e.message : "network error";
      threw = true;
    }
  }
  const status = threw ? undefined : Number(last) || undefined;
  throw new ApiError(`${view}: ${last}`, status, isTransient(status, threw));
}

async function sliceOf<S extends z.ZodType>(view: string, query: string, schema: S, size = 200): Promise<z.infer<S>[] | null> {
  try {
    const res = await fetch(`${REST_URL}${view}?${query}`, {
      headers: { apikey: API_KEY, "Accept-Profile": "api", Range: `0-${size - 1}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const part = (await res.json()) as unknown;
    if (!Array.isArray(part)) return null;
    const rows: z.infer<S>[] = [];
    for (const row of part) {
      const parsed = schema.safeParse(row);
      if (!parsed.success) return null;
      rows.push(parsed.data);
    }
    return rows;
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
 * One page of every core.person, including athletes with no club season. Uses api.person_admin
 * (migration 122, matview 123); if that view is missing, api.people with the filters it can honour.
 * `?page=` is offset (numbered pager, same as /players). `?after=` is keyset (no total).
 */
export async function searchPeople(f: PeopleSearch, page: number, sort: readonly SortKey[] = [{ key: "name", dir: "asc" }]): Promise<PeopleSearchResult> {
  const order = peopleOrder(sort);
  const sortText = formatSort(sort) || "name.asc";
  const after = f.after && !order.some((c) => c.noCursor) ? readCursor(f.after, sortText, order) : null;
  const from = (page - 1) * PEOPLE_PER_PAGE;
  try {
    if (after) {
      const extra = await sliceOf(PERSON_ADMIN_VIEW, peopleAdminQuery(f, order, after), personAdminSchema, PEOPLE_PER_PAGE + 1);
      if (!extra) throw new ApiError(`${PERSON_ADMIN_VIEW}: couldn't read`, 502, true);
      const rows = extra.slice(0, PEOPLE_PER_PAGE);
      const more = extra.length > PEOPLE_PER_PAGE;
      return { kind: "ok", rows, total: null, page: 1, pages: more ? 2 : 1, next: nextOf(sortText, order, rows, more), fallback: false, keyed: true };
    }
    const { rows, total } = await windowOf(PERSON_ADMIN_VIEW, peopleAdminQuery(f, order), from, PEOPLE_PER_PAGE, personAdminSchema);
    const pages = Math.max(1, Math.ceil(total / PEOPLE_PER_PAGE));
    return { kind: "ok", rows, total, page, pages, next: nextOf(sortText, order, rows, from + rows.length < total), fallback: false, keyed: false };
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) {
      return { kind: "error", message: e instanceof Error ? e.message : "Couldn't load" };
    }
    if (f.sport || f.source) {
      return { kind: "error", message: "person_admin is not installed, so sport and source filters need migration 122." };
    }
    try {
      if (after) {
        const extra = await sliceOf("people", peopleFallbackQuery(f, order, after), peopleFallbackSchema, PEOPLE_PER_PAGE + 1);
        if (!extra) throw new ApiError("people: couldn't read", 502, true);
        const rows = extra.slice(0, PEOPLE_PER_PAGE).map(fromPeople);
        const more = extra.length > PEOPLE_PER_PAGE;
        return { kind: "ok", rows, total: null, page: 1, pages: more ? 2 : 1, next: nextOf(sortText, order, rows, more), fallback: true, keyed: true };
      }
      const { rows, total } = await windowOf("people", peopleFallbackQuery(f, order), from, PEOPLE_PER_PAGE, peopleFallbackSchema);
      const pages = Math.max(1, Math.ceil(total / PEOPLE_PER_PAGE));
      const mapped = rows.map(fromPeople);
      return { kind: "ok", rows: mapped, total, page, pages, next: nextOf(sortText, order, mapped, from + mapped.length < total), fallback: true, keyed: false };
    } catch (err) {
      return { kind: "error", message: err instanceof Error ? err.message : "Couldn't load" };
    }
  }
}

const yearSchema = z.object({ birth_year: z.number() });
const spanSchema = z.object({ min_year: int, max_year: int });

/** Birth-year ends of api.person_admin: the year slider's min..max. Null when the view or the years are missing. */
export async function peopleSpan(): Promise<Span | null> {
  const grouped = await sliceOf("person_admin_span", "select=min_year,max_year", spanSchema, 1);
  if (grouped?.[0] && grouped[0].min_year != null && grouped[0].max_year != null) {
    return { min: grouped[0].min_year, max: Math.max(grouped[0].max_year, grouped[0].min_year) };
  }
  const [lo, hi] = await Promise.all([
    sliceOf(PERSON_ADMIN_VIEW, "select=birth_year&birth_year=not.is.null&order=birth_year.asc", yearSchema, 1),
    sliceOf(PERSON_ADMIN_VIEW, "select=birth_year&birth_year=not.is.null&order=birth_year.desc", yearSchema, 1),
  ]);
  if (!lo?.length || !hi?.length) return null;
  return { min: lo[0].birth_year, max: Math.max(hi[0].birth_year, lo[0].birth_year) };
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
  const grouped = await sliceOf("person_admin_countries", "select=country,n&order=n.desc", countryCountSchema, 300);
  const rows = grouped ?? await sliceOf(PERSON_ADMIN_VIEW, "select=country,n:person_id.count()&country=not.is.null&order=n.desc", countryCountSchema, 300);
  if (!rows?.length) return null;
  const pairs: [string, number][] = rows.filter((r) => r.country && r.country !== UNKNOWN).map((r) => [r.country!, r.n]);
  return pairs.length ? tally(pairs) : null;
}

export async function peopleSports(): Promise<Count[] | null> {
  const rows = await sliceOf("person_admin_sports", "select=sport,n&order=n.desc", sportCountSchema, 80);
  if (!rows?.length) return null;
  return rows.map((r) => ({ code: r.sport, n: r.n }));
}

export async function peopleSources(): Promise<Count[] | null> {
  const rows = await sliceOf("person_admin_sources", "select=source,n&order=n.desc", sourceCountSchema, 80);
  if (!rows?.length) return null;
  return rows.map((r) => ({ code: r.source, n: r.n }));
}

/** A–Z counts from api.person_admin_letters (migration 123). Null greys nothing, as /players does without player_letters. */
export async function peopleLetterCounts(by: "last" | "first"): Promise<Map<string, number> | null> {
  const grouped = await sliceOf("person_admin_letters", `select=letter,n&kind=eq.${by}&order=n.desc`, letterCountSchema, 26);
  const col = by === "first" ? "letter_first" : "letter_last";
  const rows = grouped ?? await sliceOf(PERSON_ADMIN_VIEW, `select=letter:${col},n:person_id.count()&${col}=not.is.null&order=n.desc`, letterCountSchema, 26);
  if (!rows?.length) return null;
  const out = new Map<string, number>();
  for (const r of rows) {
    const letter = r.letter.toLowerCase();
    if (/^[a-z]$/.test(letter)) out.set(letter, r.n);
  }
  return out.size ? out : null;
}

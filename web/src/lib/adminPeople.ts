import "server-only";
import { z } from "zod";
import { API_KEY, REST_URL } from "./api/config";
import { ApiError } from "./api/client";
import { isTransient } from "./api/failure";
import {
  PEOPLE_PER_PAGE,
  PERSON_ADMIN_VIEW,
  hasPeopleFilter,
  peopleAdminQuery,
  peopleFallbackQuery,
  type PeopleSearch,
} from "./adminPeopleQuery";

export { PEOPLE_PER_PAGE, hasPeopleFilter, parsePeopleSearch, type PeopleSearch } from "./adminPeopleQuery";

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

export type PeopleSearchResult =
  | { kind: "idle" }
  | { kind: "ok"; rows: PersonAdminRow[]; total: number; page: number; pages: number; fallback: boolean }
  | { kind: "error"; message: string };

/**
 * One page of the admin people search. No database read until a filter is set. Uses api.person_admin
 * (migration 122); if that view is missing, api.people with the filters it can honour.
 */
export async function searchPeople(f: PeopleSearch, page: number): Promise<PeopleSearchResult> {
  if (!hasPeopleFilter(f)) return { kind: "idle" };
  const from = (page - 1) * PEOPLE_PER_PAGE;
  try {
    const { rows, total } = await windowOf(PERSON_ADMIN_VIEW, peopleAdminQuery(f), from, PEOPLE_PER_PAGE, personAdminSchema);
    const pages = Math.max(1, Math.ceil(total / PEOPLE_PER_PAGE));
    return { kind: "ok", rows, total, page, pages, fallback: false };
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) {
      return { kind: "error", message: e instanceof Error ? e.message : "Couldn't load" };
    }
    if (f.sport || f.source) {
      return { kind: "error", message: "person_admin is not installed, so sport and source filters need migration 122." };
    }
    try {
      const { rows, total } = await windowOf("people", peopleFallbackQuery(f), from, PEOPLE_PER_PAGE, peopleFallbackSchema);
      const pages = Math.max(1, Math.ceil(total / PEOPLE_PER_PAGE));
      return { kind: "ok", rows: rows.map(fromPeople), total, page, pages, fallback: true };
    } catch (err) {
      return { kind: "error", message: err instanceof Error ? err.message : "Couldn't load" };
    }
  }
}

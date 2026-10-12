import "server-only";
import { cache } from "react";
import type { z } from "zod";
import { API_KEY, PAGE_SIZE, REST_URL, REVALIDATE } from "./config";

/** A failed read of the archive (a busy or slow database, a bad answer). Pages show the inline "Couldn't load" note for it, not a 404 or 500. */
export class ApiError extends Error {
  name = "ApiError";
}

/** Seconds a request may take before it is given up on and tried again. */
const TIMEOUT_MS = 8000;

/**
 * One page of a view. The request is tried once more after a short pause when the database answers 5xx (including a statement timeout),
 * the network drops or it takes too long; 4xx answers are final. Each try carries its own abort signal, which also keeps Next from
 * handing the retry the failed answer it remembered for the first try. Asked once per page render (`cache()`), so the same page
 * of a view read twice in one render costs one request, and each reader gets its own copy of the answer.
 */
const fetchPage = cache(async (view: string, query: string, from: number, size: number, count: boolean): Promise<Response> => {
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 300));
    try {
      const res = await fetch(`${REST_URL}${view}?${query}`, {
        headers: { apikey: API_KEY, "Accept-Profile": "api", Range: `${from}-${from + size - 1}`, ...(count ? { Prefer: "count=exact" } : {}) },
        next: { revalidate: REVALIDATE },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok || (count && res.status === 416)) return res;
      last = String(res.status);
      if (res.status < 500) break;
    } catch (e) {
      last = e instanceof Error ? e.message : "network error";
    }
  }
  throw new ApiError(`${view}: ${last}`);
});

async function get(view: string, query: string, from: number, size = PAGE_SIZE, count = false): Promise<Response> {
  return (await fetchPage(view, query, from, size, count)).clone();
}

/** How many rows of an `api` view match a query, without reading them (PostgREST's exact count, from the Content-Range header). */
export async function countRows(view: string, query: string): Promise<number> {
  const res = await get(view, query, 0, 1, true);
  const total = /\/(\d+)$/.exec(res.headers.get("content-range") ?? "")?.[1];
  if (!res.ok || total == null) throw new ApiError(`${view}: no row count`);
  return Number(total);
}

/**
 * Reads every row of an `api` view, PAGE_SIZE rows per request (Range header), validating each
 * row against its Zod schema. Runs on the server only; each page of rows is kept by Next's
 * data cache for REVALIDATE seconds, so a page request normally costs no round trip at all.
 */
export async function rows<S extends z.ZodType>(view: string, query: string, schema: S): Promise<z.infer<S>[]> {
  const out: z.infer<S>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const res = await get(view, query, from);
    const part = (await res.json()) as unknown;
    if (!Array.isArray(part)) throw new ApiError(`${view}: expected a list of rows`);
    for (const row of part) {
      const parsed = schema.safeParse(row);
      if (!parsed.success) throw new ApiError(`${view}: unexpected row shape (${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message})`);
      out.push(parsed.data);
    }
    if (part.length < PAGE_SIZE) return out;
  }
}

/**
 * One window of a view (`size` rows from row `from`) and, in the same request, how many rows match in all (PostgREST's exact
 * count). A window past the end is not an error: it comes back empty with the total.
 */
export async function rowsWindow<S extends z.ZodType>(view: string, query: string, from: number, size: number, schema: S): Promise<{ rows: z.infer<S>[]; total: number }> {
  const res = await get(view, query, from, size, true);
  const total = /\/(\d+)$/.exec(res.headers.get("content-range") ?? "")?.[1];
  if (total == null) throw new ApiError(`${view}: no row count`);
  const part = res.ok ? ((await res.json()) as unknown) : [];
  if (!Array.isArray(part)) throw new ApiError(`${view}: expected a list of rows`);
  const out: z.infer<S>[] = [];
  for (const row of part) {
    const parsed = schema.safeParse(row);
    if (!parsed.success) throw new ApiError(`${view}: unexpected row shape (${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message})`);
    out.push(parsed.data);
  }
  return { rows: out, total: Number(total) };
}

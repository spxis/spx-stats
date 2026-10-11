import "server-only";
import type { z } from "zod";
import { API_KEY, PAGE_SIZE, REST_URL, REVALIDATE } from "./config";

/** One page of a view. A busy or timed-out database (5xx, network) is tried again a couple of times before giving up. */
async function get(view: string, query: string, from: number): Promise<Response> {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 400 * attempt));
    try {
      const res = await fetch(`${REST_URL}${view}?${query}`, {
        headers: { apikey: API_KEY, "Accept-Profile": "api", Range: `${from}-${from + PAGE_SIZE - 1}` },
        next: { revalidate: REVALIDATE },
      });
      if (res.ok) return res;
      last = String(res.status);
      if (res.status < 500) break;
    } catch (e) {
      last = e instanceof Error ? e.message : "network error";
    }
  }
  throw new Error(`${view}: ${last}`);
}

/** How many rows of an `api` view match a query, without reading them (PostgREST's exact count, from the Content-Range header). */
export async function countRows(view: string, query: string): Promise<number> {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 400 * attempt));
    try {
      const res = await fetch(`${REST_URL}${view}?${query}`, {
        headers: { apikey: API_KEY, "Accept-Profile": "api", Range: "0-0", Prefer: "count=exact" },
        next: { revalidate: REVALIDATE },
      });
      if (res.ok) {
        const total = /\/(\d+)$/.exec(res.headers.get("content-range") ?? "")?.[1];
        if (total == null) throw new Error(`${view}: no row count`);
        return Number(total);
      }
      last = String(res.status);
      if (res.status < 500) break;
    } catch (e) {
      last = e instanceof Error ? e.message : "network error";
    }
  }
  throw new Error(`${view}: ${last}`);
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
    if (!Array.isArray(part)) throw new Error(`${view}: expected a list of rows`);
    for (const row of part) {
      const parsed = schema.safeParse(row);
      if (!parsed.success) throw new Error(`${view}: unexpected row shape (${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message})`);
      out.push(parsed.data);
    }
    if (part.length < PAGE_SIZE) return out;
  }
}

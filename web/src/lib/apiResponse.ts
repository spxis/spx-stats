import "server-only";
import { ApiError } from "./api/client";
import { BadParams } from "./listParams";

/** What a list or suggest route sends: JSON that the CDN keeps an hour (the data changes when the archive is reloaded), readable from any site. */
const HEADERS = { "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" };
const KEEP = "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400";

const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}, retry?: number) =>
  Response.json({ error: { code, message, ...extra } }, {
    status,
    headers: { ...HEADERS, "Cache-Control": status === 400 ? "public, max-age=60, s-maxage=3600" : "no-store", ...(retry ? { "Retry-After": String(retry) } : {}) },
  });

/** Runs a route's work: 200 with the cache headers, 400 for a bad parameter (naming each), 429 when the database asks to slow down, 502 when it cannot be read. */
export async function respond(work: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await work(), { headers: { ...HEADERS, "Cache-Control": KEEP } });
  } catch (e) {
    if (e instanceof BadParams) return fail(400, "bad_request", "A parameter is not valid.", { problems: e.problems });
    if (e instanceof ApiError) {
      console.error(e);
      return e.status === 429 ? fail(429, "rate_limited", "Too many requests. Try again shortly.", {}, 5) : fail(502, "unavailable", "The archive could not be read. Try again shortly.", {}, 2);
    }
    throw e;
  }
}

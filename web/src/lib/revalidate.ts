import { createHash, timingSafeEqual } from "node:crypto";

/** Pure helpers of POST /api/revalidate (no Next imports, so they can be tested on their own). */

export const MIN_SECRET_LENGTH = 32;
export const MAX_TAGS = 100;
export const MAX_BODY_BYTES = 8192;
const TAG = /^[a-z0-9_:.-]{1,100}$/;

/** The secret from an "Authorization: Bearer <secret>" header, or "". */
export function bearer(header: string | null | undefined): string {
  const m = /^Bearer ([^\s]{1,512})$/.exec(header ?? "");
  return m ? m[1] : "";
}

/**
 * True when the request's secret equals the configured one. Both sides are hashed first, so the comparison is constant
 * time whatever their lengths. A configured secret shorter than 32 characters never matches (the route is then "not set up").
 */
export function secretMatches(given: string, expected: string | undefined): boolean {
  const want = (expected ?? "").trim();
  if (want.length < MIN_SECRET_LENGTH || given.length === 0) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(want).digest();
  return timingSafeEqual(a, b);
}

/** The tags to refresh from a request body, or null when the body is not `{ "tags": [1..100 tags like api:games:nhl] }`. */
export function parseTags(body: unknown): string[] | null {
  if (typeof body !== "object" || body === null) return null;
  const tags = (body as { tags?: unknown }).tags;
  if (!Array.isArray(tags) || tags.length < 1 || tags.length > MAX_TAGS) return null;
  if (!tags.every((t): t is string => typeof t === "string" && TAG.test(t))) return null;
  return [...new Set(tags)];
}

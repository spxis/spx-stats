/**
 * What a failed read of the archive means for the page that made it (no imports, so a test can run it as it is).
 *
 * A read that fails because the database could not answer (a 5xx, a statement timeout, a dropped connection, too slow) is
 * transient. In production a page throws on a transient failure instead of drawing the inline "Couldn't load" note: Next keeps
 * the last good copy of a kept page when its regeneration throws (and retries on the next request), where a page that drew the
 * note would be stored and served as it is for the hour. With no copy to keep (a path never drawn before) or a page drawn per
 * request, the throw lands on the route's error.tsx, which shows the same note with a retry button. A 4xx answer, a row that
 * does not fit its schema and anything else a page does wrong are not transient: they keep the inline note, as does `next dev`.
 */

/** Whether a read failed for lack of an answer: its last try threw (network, timeout) or the database answered 5xx. */
export function isTransient(status: number | undefined, threw: boolean): boolean {
  return threw || (status !== undefined && status >= 500);
}

/** Whether a page should throw, not draw the inline note, for a failed read. `nodeEnv` is `process.env.NODE_ENV`. */
export function shouldThrow(failure: { transient?: boolean }, nodeEnv: string | undefined): boolean {
  return failure.transient === true && nodeEnv === "production";
}

/**
 * Whether a section that is only an extra on its page may fall back to an empty answer for a failure: only for a failed read of the
 * archive (`isApiError`) and, in production, not one the database could not answer (see `shouldThrow`). A section that swallowed a
 * transient failure would bake a partial page into the cache for the hour, where a throw keeps the last good copy.
 */
export function mayFallBack(isApiError: boolean, failure: { transient?: boolean }, nodeEnv: string | undefined): boolean {
  return isApiError && !shouldThrow(failure, nodeEnv);
}

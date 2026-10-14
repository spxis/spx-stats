import "server-only";
import { ApiError } from "./client";
import { mayFallBack } from "./failure";

/** Whether a section may draw its empty answer for this failure instead of failing the page (see `mayFallBack`). */
export function canFallBack(e: unknown): boolean {
  return e instanceof ApiError && mayFallBack(true, e, process.env.NODE_ENV);
}

/** `catch` for a read that is an extra on its page: its `fallback` for a failure that may be softened, anything else rethrown. */
export function orElse<T, F>(read: Promise<T>, fallback: F): Promise<T | F> {
  return read.catch((e: unknown) => {
    if (!canFallBack(e)) throw e;
    return fallback;
  });
}

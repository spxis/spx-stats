import "server-only";
import { greyOnlyRow, type GreyOnlyRow } from "@/lib/adminSources";
import { tursoConfigured, tursoGreyOnly } from "@/lib/turso/aggregates";
import { ApiError, rows } from "./client";

/**
 * Rows held only by a grey source (api.grey_only_rows, migration 153). The view reads meta.verification, which lives in Turso, so it cannot exist
 * on production: DS1 works the counts out and a release publishes them to Turso (api_grey_only_rows, scripts/release/turso.py). Without Turso set
 * up (a local preview on DS1's PostgREST) the view is read as before. `null` while the counts are not there yet (no such Turso table, which Turso answers
 * as a 400, or a 4xx answer from the view), so the page says so instead of drawing an empty report; any other failure throws.
 */
export async function greyOnlyRows(): Promise<GreyOnlyRow[] | null> {
  try {
    if (tursoConfigured()) return await tursoGreyOnly();
    return await rows("grey_only_rows", "select=source,entity_kind,n_rows&order=source,entity_kind", greyOnlyRow);
  } catch (e) {
    if (e instanceof ApiError && e.status !== undefined && e.status >= 400 && e.status < 500) return null;
    throw e;
  }
}

import "server-only";
import { greyOnlyRow, type GreyOnlyRow } from "@/lib/adminSources";
import { ApiError, rows } from "./client";

/**
 * Rows held only by a grey source (api.grey_only_rows, migration 153). `null` while the view is not on this database yet (a 4xx answer), so the
 * page says so instead of drawing an empty report; any other failure throws.
 */
export async function greyOnlyRows(): Promise<GreyOnlyRow[] | null> {
  try {
    return await rows("grey_only_rows", "select=source,entity_kind,n_rows&order=source,entity_kind", greyOnlyRow);
  } catch (e) {
    if (e instanceof ApiError && e.status !== undefined && e.status >= 400 && e.status < 500) return null;
    throw e;
  }
}

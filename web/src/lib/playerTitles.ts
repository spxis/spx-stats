import "server-only";
import { z } from "zod";
import { ApiError, rows } from "./api/client";
import { idFilter } from "./playerTeamModel";

const rowSchema = z.object({ person_id: z.number(), championship_count: z.number() });

/**
 * Career championships for these players: `api.people.championship_count`, the same number the player page shows.
 * Null when that read fails with a 4xx (the column is then left off). A player the view does not list counts as 0.
 * A database that could not answer throws, so a kept page keeps its last good copy.
 */
export async function championshipCounts(ids: readonly number[]): Promise<Map<number, number> | null> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  try {
    const found = await rows("people", `${idFilter(unique)}&select=person_id,championship_count`, rowSchema);
    const out = new Map<number, number>();
    for (const id of unique) out.set(id, 0);
    for (const r of found) out.set(r.person_id, r.championship_count);
    return out;
  } catch (e) {
    if (e instanceof ApiError && e.status != null && e.status >= 400 && e.status < 500) return null;
    throw e;
  }
}

import "server-only";
import { cache } from "react";
import { z } from "zod";
import { ApiError, rows } from "./api/client";
import { getSources } from "./data";
import type { ProvRow } from "./provenance";
import { tursoConfigured, tursoProvenance } from "./turso/aggregates";

const provSchema = z.object({
  kind: z.string(), league: z.string().nullable(), source: z.string().nullable(), checked_by: z.string().nullable(), outcome: z.string(), n: z.number(),
});

export interface ProvenanceData {
  rows: ProvRow[];
  /** By source group (SPX's databases are one): the name and the address of its page, when it has one. */
  sources: Record<string, { name: string; url: string | null }>;
}

/**
 * api.provenance (migration 056; in Turso once the check tables moved there) and the sources' names. Null while the view does not exist in the archive (PostgREST answers 404
 * for a missing view), so the page simply leaves the diagram out until the data release that creates it.
 */
export const getProvenance = cache(async (): Promise<ProvenanceData | null> => {
  let data: ProvRow[];
  try {
    data = tursoConfigured()
      ? await tursoProvenance()
      : await rows("provenance", "select=kind,league,source,checked_by,outcome,n&order=kind,league,source,checked_by,outcome", provSchema);
  } catch (e) {
    if (e instanceof ApiError && (e.message.endsWith(": 404") || /no such table/.test(e.message))) return null;
    throw e;
  }
  const list = await getSources();
  const sources: ProvenanceData["sources"] = {};
  for (const s of list) sources[s.code] = { name: s.name, url: s.url };
  return { rows: data, sources };
});

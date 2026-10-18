import "server-only";
import { z } from "zod";
import { qualitySchema } from "../api/schemas";
import type { QualityRow, TotalsRow } from "../api/types";
import { tursoConfigured, tursoRows } from "./client";

/**
 * The counts that are worked out from the check and issue tables (home page totals, /quality, /sources), which live in Turso. DS1 works
 * them out (scripts/release/turso.py, api_totals, api_quality, api_provenance) and a release publishes them. Without Turso set up, the
 * callers read the api views as before.
 */
export { tursoConfigured };

const totalsSchema = z.object({ lines: z.number(), confirmed: z.number(), issues: z.number() });

/** The three counts of api.totals that come from tables now in Turso; null when Turso has no row yet. */
export async function tursoTotals(): Promise<Pick<TotalsRow, "lines" | "confirmed" | "issues"> | null> {
  const r = await tursoRows("select lines, confirmed, issues from api_totals where id = 1", [], totalsSchema, { tables: ["api_totals"] });
  return r[0] ?? null;
}

const qualityRow = z.object({ kind: z.string(), source: z.string(), entity: z.string(), what: z.string(), resolution: z.string(), n: z.number() });

export async function tursoQuality(): Promise<QualityRow[]> {
  const r = await tursoRows("select kind, source, entity, what, resolution, n from api_quality order by n desc", [], qualityRow, { tables: ["api_quality"] });
  return r.map((x) => qualitySchema.parse({ ...x, resolution: x.resolution || null }));
}

const provRow = z.object({ kind: z.string(), league: z.string(), source: z.string(), checked_by: z.string(), outcome: z.string(), n: z.number() });

export async function tursoProvenance() {
  const r = await tursoRows("select kind, league, source, checked_by, outcome, n from api_provenance order by kind, league, source, checked_by, outcome", [], provRow, { tables: ["api_provenance"] });
  return r.map((x) => ({ ...x, league: x.league || null, source: x.source || null, checked_by: x.checked_by || null }));
}

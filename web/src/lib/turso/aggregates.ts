import "server-only";
import { z } from "zod";
import { qualitySchema } from "../api/schemas.ts";
import type { QualityRow, TotalsRow } from "../api/types";
import { greyOnlyRow } from "../adminSources.ts";
import { tursoConfigured, tursoRows } from "./client.ts";
import { QUALITY_CHECKS_SQL, QUALITY_ISSUES_SQL } from "./qualitySql.ts";

/**
 * The counts that are worked out from the check and issue tables (home page totals, /quality, /sources), which live in Turso. DS1 works
 * them out (scripts/release/turso.py, api_totals, api_quality, api_provenance, api_grey_only_rows) and a release publishes them. Without Turso set up, the
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
  const opts = { tables: ["api_quality"] };
  const [checks, issues] = await Promise.all([
    tursoRows(QUALITY_CHECKS_SQL, [], qualityRow, opts),
    tursoRows(QUALITY_ISSUES_SQL, [], qualityRow, opts),
  ]);
  return [...checks, ...issues].map((x) => qualitySchema.parse({ ...x, resolution: x.resolution || null }));
}

const provRow = z.object({ kind: z.string(), league: z.string(), source: z.string(), checked_by: z.string(), outcome: z.string(), n: z.number() });

export async function tursoProvenance() {
  const r = await tursoRows("select kind, league, source, checked_by, outcome, n from api_provenance order by kind, league, source, checked_by, outcome", [], provRow, { tables: ["api_provenance"] });
  return r.map((x) => ({ ...x, league: x.league || null, source: x.source || null, checked_by: x.checked_by || null }));
}

/** Rows held only by a grey source (api_grey_only_rows, DS1's api.grey_only_rows): one row per grey source and kind of row, a few dozen at most. */
export async function tursoGreyOnly() {
  return tursoRows("select source, entity_kind, n_rows from api_grey_only_rows order by source, entity_kind limit 500", [], greyOnlyRow, { tables: ["api_grey_only_rows"] });
}

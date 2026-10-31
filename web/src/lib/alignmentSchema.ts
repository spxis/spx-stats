import { z } from "zod";
import { VIEW_IDS, type AlignmentChangeRow, type AlignmentRow } from "./alignment";

/* The zod schemas of lib/alignment.ts, apart from it: alignment.ts is imported by Client Components, and zod (30 kB of script) would come with it. */

const strN = z.string().nullable();

/* ---------- api.alignment, api.alignment_changes ----------------------------------------------------- */

export const alignmentSchema = z.object({
  league: z.string(), year: z.number(), conference: strN, division: strN, franchise_id: z.number(), team: strN,
  conference_short: strN, division_short: strN, team_id: z.number(),
}) satisfies z.ZodType<AlignmentRow>;

export const alignmentChangeSchema = z.object({
  league: z.string(), year: z.number(), franchise_id: z.number(), team: strN,
  from_conference: strN, from_division: strN, to_conference: strN, to_division: strN, from_year: z.number().nullable(),
  from_conference_short: strN, from_division_short: strN, to_conference_short: strN, to_division_short: strN,
}) satisfies z.ZodType<AlignmentChangeRow>;

/* ---------- the standings views ---------------------------------------------------------------------- */

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** ?view= : anything that is not one of the four falls back to the whole league. */
export const viewSchema = z.preprocess(first, z.enum(VIEW_IDS)).catch("league");
/** ?date=YYYY-MM-DD, a real calendar day; anything else is no date. */
export const dateSchema = z.preprocess(first, z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
  .refine((s) => { const t = Date.parse(`${s}T00:00:00Z`); return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s; })).catch("");
/** ?season= on the alignment browser. */
export const yearSchema = z.preprocess(first, z.string().regex(/^\d{4}$/).transform(Number)).catch(0);

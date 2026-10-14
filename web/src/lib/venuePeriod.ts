import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import type { VenuePeriod } from "./venueSurface";

/**
 * The surface and roof of one home venue by period (api.venue_period, migration 089): "AstroTurf 1989-2004, FieldTurf 2005-2010 ...", each product as the source
 * wrote it. Read for the venue's own page only, never for the /venues list. Empty while the view is not on the server (or cannot be read), so the page shows nothing,
 * not an error.
 */

const periodRow = z.object({
  wikidata_id: z.string(), kind: z.string(), seq: z.number(), value: z.string(), raw: z.string().nullable(),
  from_year: z.number().nullable(), until_year: z.number().nullable(), sport: z.string().nullable(), source: z.string(), source_key: z.string(),
});

export const getVenuePeriods = cache(async (wid: string): Promise<VenuePeriod[]> => {
  if (!/^Q[1-9]\d{0,14}$/i.test(wid)) return [];
  try {
    const list = await rows("venue_period", `wikidata_id=eq.${wid.toUpperCase()}&select=wikidata_id,kind,seq,value,raw,from_year,until_year,sport,source,source_key&order=kind,seq`, periodRow);
    return list.flatMap((r) =>
      r.kind === "surface" || r.kind === "roof" ? [{ kind: r.kind, seq: r.seq, value: r.value, raw: r.raw, from: r.from_year, until: r.until_year, sport: r.sport }] : []);
  } catch {
    return [];
  }
});

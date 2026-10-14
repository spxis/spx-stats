import "server-only";
import { z } from "zod";
import { rowsSlice } from "./api/client";

/** The first and last season a list's rows reach: the ends of the year slider. */
export interface Span { min: number; max: number }

const firstSchema = z.object({ first_season: z.number() });
const lastSchema = z.object({ last_season: z.number() });

/**
 * The earliest first season and the latest last season of an `api` list view under some filters (a league), two one-row reads that the data
 * cache keeps for a day. It throws when no row has a season.
 */
export async function readSpan(view: string, filters: readonly string[]): Promise<Span> {
  const [lo, hi] = await Promise.all([
    rowsSlice(view, [...filters, "select=first_season", "first_season=not.is.null", "order=first_season.asc"].join("&"), 0, 1, firstSchema),
    rowsSlice(view, [...filters, "select=last_season", "last_season=not.is.null", "order=last_season.desc"].join("&"), 0, 1, lastSchema),
  ]);
  if (!lo.length || !hi.length) throw new Error(`${view}: no seasons`);
  return { min: lo[0].first_season, max: Math.max(hi[0].last_season, lo[0].first_season) };
}

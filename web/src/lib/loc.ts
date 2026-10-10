/**
 * The Home / Road / All filter of the team charts: the shape of ?loc= in the address, how it is validated, and the
 * records worked out from a standings row's home and road strings ("20-10-2").
 */
import { z } from "zod";
import type { StandingRow } from "./api/types";

export type Loc = "all" | "home" | "road";

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** ?loc=home|road|all : anything else is all. */
export const locSchema = z.preprocess(first, z.enum(["all", "home", "road"])).catch("all");
export const parseLoc = (raw: unknown): Loc => locSchema.parse(raw);

export const LOCS: [Loc, string][] = [["all", "All games"], ["home", "Home"], ["road", "Road"]];

export interface Rec { w: number; l: number; t: number; otl: number }
export const EMPTY: Rec = { w: 0, l: 0, t: 0, otl: 0 };

/** A written record: "50-31", "17-18-5" or "5-4-1-2". The third number is overtime losses when the standings count them, else ties. */
export function parseRec(text: string | null | undefined, hasOtl: boolean): Rec | null {
  const n = String(text || "").match(/\d+/g)?.map(Number);
  if (!n || n.length < 2) return null;
  const [w, l, a = 0, b = 0] = n;
  if (n.length >= 4) return { w, l, t: a, otl: b };
  return hasOtl ? { w, l, t: 0, otl: a } : { w, l, t: a, otl: 0 };
}

/** The record of a standings row at home, on the road, or in all, or null when the row does not say. */
export function recordAt(r: StandingRow, loc: Loc): Rec | null {
  if (loc === "all") return r.w == null ? null : { w: r.w, l: r.l ?? 0, t: r.t ?? 0, otl: r.otl ?? 0 };
  return parseRec(loc === "home" ? r.home : r.road, r.otl != null);
}

/** Wins over decisions, a tie counting half. Overtime losses are losses. */
export function share(r: Rec | null): number | null {
  if (!r) return null;
  const n = r.w + r.l + r.t + r.otl;
  return n ? (r.w + r.t / 2) / n : null;
}

export const addRec = (a: Rec, b: Rec | null): Rec => (b ? { w: a.w + b.w, l: a.l + b.l, t: a.t + b.t, otl: a.otl + b.otl } : a);

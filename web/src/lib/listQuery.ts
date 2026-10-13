/**
 * The query builder behind the players and teams lists, the list APIs and the autocomplete: it turns validated values into the
 * PostgREST query of an allow-listed `api` view. Nothing a caller types ever becomes part of a query unchecked: search words are
 * folded to letters and digits, sort keys must be in the view's list, and cursor values are quoted. Pure, so the pages, the route
 * handlers and a node script can all use it.
 */
import { fold } from "./fold.ts";
import type { SortKey } from "./sort";

export { fold };

/** The words of a search, each one a piece of a name (so "gretzky wayne" finds Wayne Gretzky); only letters and digits are left in them. */
export const searchWords = (q: string): string[] => fold(q).split(" ").filter(Boolean).slice(0, 4).map((w) => w.slice(0, 30));

export type Val = string | number | null;
/** A sortable field of a view; `num` for numbers, `nullable` for fields that can be empty (those sort last either way). */
export interface Col { field: string; num?: boolean; nullable?: boolean; noCursor?: boolean }
export type Order = (Col & { dir: "asc" | "desc" })[];

/** The order of a list: the sort asked for (by column key), then the tie-break fields so every row has one place and a cursor can say where it stopped. */
export function orderOf(sort: readonly SortKey[], cols: Record<string, Col>, tie: readonly Col[]): Order {
  const out: Order = [];
  for (const s of sort) {
    const c = cols[s.key];
    if (c && !out.some((o) => o.field === c.field)) out.push({ ...c, dir: s.dir });
  }
  for (const t of tie) if (!out.some((o) => o.field === t.field)) out.push({ ...t, dir: "asc" });
  return out;
}

export const orderParam = (o: Order): string => `order=${o.map((c) => `${c.field}.${c.dir}${c.nullable ? ".nullslast" : ""}`).join(",")}`;

const lit = (v: string | number): string => (typeof v === "number" ? String(v) : `"${v.replace(/[\\"]/g, "\\$&")}"`);

/** The rows after a cursor, as an encoded PostgREST `or=` filter: the sort fields' values of the last row seen, with empty values last. */
export function afterParam(o: Order, vals: readonly Val[]): string {
  const same = (c: Order[number], v: Val) => (v == null ? `${c.field}.is.null` : `${c.field}.eq.${lit(v)}`);
  const parts: string[] = [];
  o.forEach((c, i) => {
    const v = vals[i];
    if (v == null) return;
    const lead = o.slice(0, i).map((p, j) => same(p, vals[j]));
    const past = `${c.field}.${c.dir === "asc" ? "gt" : "lt"}.${lit(v)}`;
    for (const last of c.nullable ? [past, `${c.field}.is.null`] : [past]) {
      const all = [...lead, last];
      parts.push(all.length > 1 ? `and(${all.join(",")})` : all[0]);
    }
  });
  return `or=${encodeURIComponent(`(${parts.join(",")})`)}`;
}

/** A cursor: the sort it belongs to and the sort fields' values of the last row, opaque to the caller. */
export const cursorOf = (sortText: string, vals: readonly Val[]): string => Buffer.from(JSON.stringify([sortText, vals])).toString("base64url");

/** The values inside a cursor for this sort and order; null when it is not one (wrong sort, wrong shape, wrong type). */
export function readCursor(raw: string, sortText: string, o: Order): Val[] | null {
  try {
    const [s, vals] = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as [unknown, unknown];
    if (s !== sortText || !Array.isArray(vals) || vals.length !== o.length) return null;
    const ok = vals.every((v, i) => (v == null ? !!o[i].nullable : o[i].num ? typeof v === "number" && Number.isFinite(v) : typeof v === "string" && v.length <= 200));
    return ok ? (vals as Val[]) : null;
  } catch {
    return null;
  }
}

/** The values of the order's fields in a row, for the cursor that points past it. */
export const valuesOf = (o: Order, row: Record<string, unknown>): Val[] => o.map((c) => (row[c.field] ?? null) as Val);

/** The PostgREST query string: filters (already encoded), the cursor, the columns, the order. */
export function listQuery(p: { filters: string[]; select: readonly string[]; order: Order; after?: readonly Val[] | null }): string {
  return [...p.filters, p.after ? afterParam(p.order, p.after) : "", `select=${p.select.join(",")}`, orderParam(p.order)].filter(Boolean).join("&");
}

/** One filter per search word, each a piece of the folded name(s) in `search`. */
export const searchFilters = (words: readonly string[]): string[] => words.map((w) => `search=like.${encodeURIComponent(`*${w}*`)}`);

/**
 * The filter every list of players carries: a row of `api.player_index` must have a league. The index holds every `core.person` of kind
 * player, which includes the World Cup's soccer people (none of the five leagues, so `leagues` is null); they are reached from /worldcup,
 * never from the five-league lists, their counts, their paging or their suggestions. (`leagues <> '{}'` is also false for null.)
 */
export const PLAYER_LISTED = "leagues=neq.%7B%7D";

/** `listQuery` for a view of players (`player_index`, `player_search`): the same query with PLAYER_LISTED among the filters, always. */
export const playerQuery = (p: Parameters<typeof listQuery>[0]): string => listQuery({ ...p, filters: [PLAYER_LISTED, ...p.filters] });

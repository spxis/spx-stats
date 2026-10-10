/**
 * Sorting for the site's tables: the shape of a sort in the address, how it is validated, and the
 * comparison itself. Pure and shared by the server (which reads ?sort= to render the right order and to
 * ask the API for it) and the client (the one SortTable component).
 *
 * The address carries a sort as `?sort=<column>.<asc|desc>` (the shape PostgREST uses for order=), a list
 * for more than one: `w.desc,l.asc`. A second table on a page uses `sort_<name>`.
 */
import type { ReactNode } from "react";
import { z } from "zod";

export type SortDir = "asc" | "desc";
export interface SortKey { key: string; dir: SortDir }
export type SortValue = string | number | null | undefined;

const part = z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/), dir: z.enum(["asc", "desc"]) });

/** A raw query value ("w.desc,l.asc", or a list when the key repeats) to a list of sort keys; anything malformed is dropped whole. */
export const sortParamSchema = z
  .preprocess((v) => (Array.isArray(v) ? v[0] : v), z.string().max(300))
  .transform((text) =>
    text.split(",").map((p) => p.trim()).filter(Boolean).map((p) => {
      const [key, dir] = p.split(".");
      return { key, dir: dir === "desc" ? "desc" : "asc" };
    }),
  )
  .pipe(z.array(part).max(6))
  .catch([]);

/** The sort a request asks for: its keys that name a column, else the table's default. */
export function parseSort(raw: unknown, known: readonly string[], def?: string | null): SortKey[] {
  const fromUrl = sortParamSchema.parse(raw).filter((s) => known.includes(s.key));
  if (fromUrl.length) return fromUrl;
  return def ? sortParamSchema.parse(def).filter((s) => known.includes(s.key)) : [];
}

export const formatSort = (spec: readonly SortKey[]): string => spec.map((s) => `${s.key}.${s.dir}`).join(",");

/** A column of a sortable table. `rest` names the API field it maps to, for a table that loads its order from REST. */
export interface SortColumn {
  key: string;
  label: string;
  num?: boolean;
  title?: string;
  cls?: string;
  rest?: string;
  /** The label is for screen readers only (a column of icons); the header still sorts. */
  hideLabel?: boolean;
}

/** One row: what each cell draws, and the value each column sorts by (a column without one sorts as blank). */
export interface SortRow {
  id: string | number;
  cells: Record<string, ReactNode>;
  sort: Record<string, SortValue>;
  className?: string;
  /** The section it sits in, when the table is drawn in groups (SortTable `groups`). */
  group?: string;
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
export const isBlank = (v: SortValue): v is null | undefined | "" => v == null || v === "" || (typeof v === "number" && Number.isNaN(v));

/** Stable sort: numbers as numbers, text with numbers inside it in order, blanks last whichever way it runs. */
export function sortRows<T>(rows: readonly T[], spec: readonly SortKey[], value: (row: T, key: string) => SortValue): T[] {
  if (!spec.length) return [...rows];
  const at = new Map(rows.map((r, i) => [r, i]));
  return [...rows].sort((a, b) => {
    for (const { key, dir } of spec) {
      const x = value(a, key), y = value(b, key), bx = isBlank(x), by = isBlank(y);
      if (bx || by) { if (bx && by) continue; return bx ? 1 : -1; }
      const c = typeof x === "number" && typeof y === "number" ? x - y : collator.compare(String(x), String(y));
      if (c) return dir === "desc" ? -c : c;
    }
    return (at.get(a) ?? 0) - (at.get(b) ?? 0);
  });
}

export interface ColumnSpec<T> extends SortColumn {
  /** What the column sorts by; by default the text of the cell. */
  get?: (item: T) => SortValue;
  /** What the cell draws; by default the sort value. */
  cell?: (item: T) => ReactNode;
}

/** Turns items and column specs (which hold functions) into the plain columns and rows a SortTable takes. */
export function tableOf<T>(items: readonly T[], specs: readonly ColumnSpec<T>[], id: (item: T, index: number) => string | number, rowClass?: (item: T) => string | undefined) {
  const columns: SortColumn[] = specs.map(({ get: _g, cell: _c, ...col }) => { void _g; void _c; return col; });
  const rows: SortRow[] = items.map((item, i) => {
    const cells: Record<string, ReactNode> = {};
    const sort: Record<string, SortValue> = {};
    for (const s of specs) {
      const v = s.get ? s.get(item) : undefined;
      sort[s.key] = v;
      cells[s.key] = s.cell ? s.cell(item) : v ?? "";
    }
    return { id: id(item, i), cells, sort, className: rowClass?.(item) };
  });
  return { columns, rows };
}

/** "20-10-2" -> share of games won (a tie counts half), for sorting a Home or Road record; null when blank. */
export function recShare(rec: string | null | undefined): number | null {
  const n = String(rec || "").match(/\d+/g);
  if (!n) return null;
  const [w, l = 0, t = 0, o = 0] = n.map(Number);
  const g = w + l + t + o;
  return g ? (w + t / 2) / g : null;
}

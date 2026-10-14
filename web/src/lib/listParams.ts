/**
 * The query string of the list and suggest APIs, checked: every value is validated before it can reach a query, and a bad one is
 * a 400 that names the parameter. Unknown parameters are ignored (a cache-buster is fine). Pure, so a node script can test it.
 */
import { z } from "zod";
import { LEAGUE_CODES } from "./leagues";
import { readRange } from "./listRange";
import { cursorOf, readCursor, readLetter, searchWords, valuesOf, type Order, type Val } from "./listQuery";
import type { SortKey } from "./sort";

export interface Problem { param: string; message: string }
export class BadParams extends Error {
  constructor(public problems: Problem[]) {
    super(problems.map((p) => `${p.param}: ${p.message}`).join("; "));
  }
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
export const SUGGEST_LIMIT = 10;

const blank = (v: unknown) => (v === "" ? undefined : v);
const text = (max: number) => z.preprocess(blank, z.string().max(max).optional());

const common = {
  league: z.preprocess(blank, z.enum(LEAGUE_CODES).optional()),
  q: text(80),
  limit: z.preprocess(blank, z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)),
  offset: z.preprocess(blank, z.coerce.number().int().min(0).max(1_000_000).default(0)),
  from: text(12),
  to: text(12),
  after: text(600),
  sort: text(80),
  fields: text(200),
};
const listSchemas = {
  players: z.object({
    ...common,
    position: z.preprocess(blank, z.string().regex(/^[A-Za-z0-9 /-]{1,24}$/, "letters, digits, spaces, / and - only").optional()),
    nat: z.preprocess(blank, z.string().regex(/^[A-Za-z]{2}$/, "a two-letter country code, e.g. CA").optional()),
    letter: z.preprocess(blank, z.string().max(4).refine((v) => readLetter(v) !== null, "one letter, A to Z (accents are ignored)").optional()),
    letter_by: z.preprocess(blank, z.enum(["last", "first"]).default("last")),
  }),
  teams: z.object({ ...common, status: z.preprocess(blank, z.enum(["all", "active", "defunct"]).default("all")) }),
  venues: z.object({
    ...common,
    status: z.preprocess(blank, z.enum(["all", "current", "former"]).default("all")),
    kind: text(40),
    nat: z.preprocess(blank, z.string().regex(/^[A-Za-z]{2}$/, "a two-letter country code, e.g. CA").optional()),
  }),
};
const suggestSchema = z.object({
  q: z.string({ error: "required" }).min(1, "required").max(60),
  league: common.league,
  limit: z.preprocess(blank, z.coerce.number().int().min(1).max(SUGGEST_LIMIT).default(SUGGEST_LIMIT)),
});

const fail = (e: z.ZodError): never => {
  throw new BadParams(e.issues.map((i) => ({ param: String(i.path[0] ?? "query"), message: i.message })));
};
const entries = (sp: URLSearchParams): Record<string, string> => Object.fromEntries([...sp.keys()].map((k) => [k, sp.get(k)!]));

/** The sort in `?sort=key.dir,key.dir` (dir defaults to asc), every key from the allow-list, at most three, none twice. */
export function parseSortParam(raw: string | undefined, allowed: readonly string[], def: string): SortKey[] {
  const out: SortKey[] = [];
  for (const part of (raw || def).split(",")) {
    const [key, dir = "asc", extra] = part.split(".");
    if (!allowed.includes(key) || (dir !== "asc" && dir !== "desc") || extra !== undefined) throw new BadParams([{ param: "sort", message: `use ${allowed.join(", ")}, each with .asc or .desc` }]);
    if (out.some((s) => s.key === key)) throw new BadParams([{ param: "sort", message: `${key} twice` }]);
    out.push({ key, dir });
  }
  if (out.length > 3) throw new BadParams([{ param: "sort", message: "at most three keys" }]);
  return out;
}

/** `?fields=a,b`: the output keys wanted, each from the allow-list (`id` is always there); null for all of them. */
export function parseFieldsParam(raw: string | undefined, allowed: readonly string[]): string[] | null {
  if (!raw) return null;
  const list = raw.split(",").map((f) => f.trim()).filter(Boolean);
  const bad = list.find((f) => !allowed.includes(f));
  if (bad || !list.length) throw new BadParams([{ param: "fields", message: `use ${allowed.join(", ")}` }]);
  return list;
}

export interface ListParams<K extends keyof typeof listSchemas> {
  values: z.infer<(typeof listSchemas)[K]>;
  sort: SortKey[];
  sortText: string;
  fields: string[] | null;
  /** The years asked for with `from` and `to` (an open end is undefined); the list keeps what was active in any season inside them. */
  range: { from: number | undefined; to: number | undefined };
}

export function parseListParams<K extends keyof typeof listSchemas>(kind: K, sp: URLSearchParams, o: { sorts: readonly string[]; fields: readonly string[]; defSort: string }): ListParams<K> {
  const r = listSchemas[kind].safeParse(entries(sp));
  if (!r.success) return fail(r.error);
  const values = r.data as ListParams<K>["values"];
  const sort = parseSortParam(values.sort, o.sorts, o.defSort);
  if (values.after && values.offset > 0) throw new BadParams([{ param: "after", message: "use either offset or after, not both" }]);
  const range = readRange(values.from, values.to);
  if (!range.ok) throw new BadParams([range.problem]);
  return { values, sort, sortText: sort.map((s) => `${s.key}.${s.dir}`).join(","), fields: parseFieldsParam(values.fields, o.fields), range: { from: range.from, to: range.to } };
}

export function parseSuggestParams(sp: URLSearchParams): { q: string; words: string[]; league: string | undefined; limit: number } {
  const r = suggestSchema.safeParse(entries(sp));
  if (!r.success) return fail(r.error);
  return { q: r.data.q, words: searchWords(r.data.q), league: r.data.league, limit: r.data.limit };
}

/** The values inside `?after=`, for this sort; a 400 when it is not a cursor this sort made. */
export function afterValues(after: string | undefined, sortText: string, order: Order): Val[] | null {
  if (!after) return null;
  if (order.some((c) => c.noCursor)) throw new BadParams([{ param: "after", message: "this sort pages with offset only" }]);
  const vals = readCursor(after, sortText, order);
  if (!vals) throw new BadParams([{ param: "after", message: "not a cursor for this sort" }]);
  return vals;
}

/** The cursor that points past the last row of a page (null when that page is the last). */
export const nextCursor = (more: boolean, sortText: string, order: Order, rows: readonly Record<string, unknown>[]): string | null =>
  more && rows.length ? cursorOf(sortText, valuesOf(order, rows[rows.length - 1])) : null;

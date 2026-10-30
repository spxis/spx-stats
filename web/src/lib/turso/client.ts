import "server-only";
import type { z } from "zod";
import { queuedAtBuild } from "../api/buildShare.ts";
import { RETRY_REVALIDATE, REVALIDATE } from "../api/config.ts";
import { ApiError } from "../api/error.ts";
import { isTransient } from "../api/failure.ts";

/**
 * The one reader of Turso, where the admin and bulky tables live (scripts/release/turso.py is the writer; AGENTS.md section 8). It speaks
 * the HTTP pipeline API with plain `fetch`, so there is no driver and Next's data cache keeps each answer like a PostgREST one: the same
 * revalidate time, and the tags `turso` and `turso:<table>` that the release runner revalidates after a release to that table.
 * TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are read by name at run time. Table names are schema_table (meta_verification).
 */

export type Arg = string | number | null;
type Cell = { type: "null" } | { type: "integer" | "float" | "text"; value: string | number } | { type: "blob"; base64: string };

const TIMEOUT_MS = 8000;

/**
 * Next's data cache refuses a fetch answer over 2 MB ("Failed to set Next.js data cache ... items over 2MB can not be cached"), so a read that big
 * is fetched again by every build worker and every regeneration. Keep each answer under this many bytes (scripts/tursoAnswerSize.test.ts holds the
 * readers to it) by asking for the rows a page draws, not the table; a run that gets one anyway says so in its log.
 */
export const TURSO_ANSWER_BUDGET = 1_500_000;
const AT_BUILD = process.env.NEXT_PHASE === "phase-production-build";
const PAUSES_MS = AT_BUILD ? [1000, 3000, 6000] : [300];

const env = (name: string): string => (process.env[name] ?? "").trim();

/** Whether this run has a Turso to read. A run without one (a local preview of DS1, a build on a Mac) reads the api views as it always did. */
export const tursoConfigured = (): boolean => env("TURSO_DATABASE_URL") !== "";

function endpoint(): string {
  const url = env("TURSO_DATABASE_URL").replace(/^libsql:\/\//, "https://").replace(/\/+$/, "");
  return `${url}/v2/pipeline`;
}

const arg = (v: Arg) =>
  v === null ? { type: "null" } : typeof v === "number" ? (Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v }) : { type: "text", value: v };

function decode(cell: Cell): unknown {
  if (cell.type === "null") return null;
  if (cell.type === "integer") return Number(cell.value);
  if (cell.type === "float") return Number(cell.value);
  if (cell.type === "text") return String(cell.value);
  return null;
}

export interface TursoOptions {
  /** Turso tables the query reads (schema_table), for the cache tags the release runner revalidates. */
  tables: readonly string[];
  /** Never cached: for the admin pages, which are drawn per request. */
  live?: boolean;
  /** Seconds the answer is kept, instead of a day (the live score layer asks for 30). */
  revalidate?: number;
}

/** The rows of one SELECT, each as {column: value}. Throws ApiError (transient when Turso could not answer) so the page shows its "Couldn't load" note. */
export async function tursoQuery(sql: string, args: readonly Arg[], opts: TursoOptions): Promise<Record<string, unknown>[]> {
  if (!tursoConfigured()) throw new ApiError("turso: not configured (TURSO_DATABASE_URL)", undefined, false);
  const body = JSON.stringify({ requests: [{ type: "execute", stmt: { sql, args: args.map(arg) } }, { type: "close" }] });
  const tags = ["turso", ...opts.tables.map((t) => `turso:${t}`)];
  let last = "";
  let threw = false;
  for (let attempt = 0; attempt <= PAUSES_MS.length; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, PAUSES_MS[attempt - 1]));
    try {
      const send = () =>
        fetch(endpoint(), {
          method: "POST",
          headers: { "content-type": "application/json", ...(env("TURSO_AUTH_TOKEN") ? { authorization: `Bearer ${env("TURSO_AUTH_TOKEN")}` } : {}) },
          body,
          ...(opts.live ? { cache: "no-store" as const } : { cache: "force-cache" as const, next: { revalidate: attempt ? RETRY_REVALIDATE : (opts.revalidate ?? REVALIDATE), tags } }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      const res = opts.live ? await send() : await queuedAtBuild(`turso|${sql}|${JSON.stringify(args)}`, send);
      if (res.ok) {
        const text = await res.text();
        if (text.length > TURSO_ANSWER_BUDGET) console.warn(`turso: answer of ${text.length} bytes is over the ${TURSO_ANSWER_BUDGET} byte budget (Next will not cache one over 2 MB): ${sql.slice(0, 120)}`);
        const data = JSON.parse(text) as { results?: { type: string; response?: { result?: { cols: { name: string }[]; rows: Cell[][] } }; error?: { message?: string } }[] };
        const first = data.results?.[0];
        if (first?.type !== "ok" || !first.response?.result) throw new ApiError(`turso: ${first?.error?.message ?? "no answer"}`.slice(0, 200), 400, false);
        const { cols, rows } = first.response.result;
        return rows.map((r) => Object.fromEntries(cols.map((c, i) => [c.name, decode(r[i])])));
      }
      last = String(res.status);
      threw = false;
      if (res.status < 500) break;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      last = e instanceof Error ? e.message : "network error";
      threw = true;
    }
  }
  const status = threw ? undefined : Number(last) || undefined;
  throw new ApiError(`turso: ${last}`, status, isTransient(status, threw));
}

/** `tursoQuery`, every row checked against its Zod schema. */
export async function tursoRows<S extends z.ZodType>(sql: string, args: readonly Arg[], schema: S, opts: TursoOptions): Promise<z.infer<S>[]> {
  const out: z.infer<S>[] = [];
  for (const row of await tursoQuery(sql, args, opts)) {
    const parsed = schema.safeParse(row);
    if (!parsed.success) throw new ApiError(`turso: unexpected row shape (${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message})`);
    out.push(parsed.data);
  }
  return out;
}

/** A JSON array column (stored as text) as an array of strings. */
export const jsonStrings = (v: unknown): string[] | null => {
  if (v === null || v === undefined) return null;
  try {
    const a = JSON.parse(String(v)) as unknown;
    return Array.isArray(a) ? a.map(String) : null;
  } catch {
    return null;
  }
};

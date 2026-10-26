import { type Progress, type ProgressStatus, isFinished, showLiveControls } from "./liveScope.ts";
import { type LiveRequest, parseLiveRequest } from "./liveRequest.ts";

export { isFinished, showLiveControls, type Progress, type ProgressStatus };

/**
 * The server side of the admin "Refresh" buttons, as functions with their dependencies passed in, so a test can check who may do what without a
 * database. The routes (app/api/admin/live) only wire the real session, Origin header, production RPC and Turso into these.
 *
 * Cost: a request is one RPC that inserts one row (the existing admin request path). A progress question is one Turso read of one row by its key, asked by
 * the admin's open tab no faster than every 15 seconds and only while that tab is visible. Nothing here fetches from a score source.
 */

export interface Admin { email: string; admin: boolean }
export interface Reply { status: number; body: unknown }

const NOT_FOUND: Reply = { status: 404, body: { error: "Not found." } };

/** Why the database refused a request, in words for the admin. `detail` is the message of the function (migration 156). */
export function refusalText(detail: string | undefined): string {
  const d = (detail ?? "").toLowerCase();
  if (d.includes("already open")) return "A request is already running. Wait for it to finish.";
  if (d.includes("30 seconds")) return "That was just asked for. Try again in about 30 seconds.";
  if (d.includes("10 minutes")) return "The last update of this kind ended recently. Try again in about 10 minutes.";
  return "The database refused the request.";
}

export class RefusedError extends Error {
  name = "RefusedError";
  detail: string | undefined;
  constructor(detail: string | undefined) {
    super(refusalText(detail));
    this.detail = detail;
  }
}

export interface QueueDeps {
  /** Insert the request row (production RPC request_live). Returns its id. Throws RefusedError when the database says no. */
  queue: (actor: string, req: LiveRequest) => Promise<number>;
}

/**
 * POST /api/admin/live: queue one refresh. 404 for anyone but an admin (as the admin pages do), 403 for a request from another site and for the
 * dev sign-in (whose fake admin must never write), 400 for a request that does not pass the rules, 429 when the database says wait.
 */
export async function handleLiveRequest(
  input: { user: Admin | null; devLogin: boolean; sameOrigin: boolean; body: unknown; today: string },
  deps: QueueDeps,
): Promise<Reply> {
  if (!input.user?.admin) return NOT_FOUND;
  if (input.devLogin) return { status: 403, body: { error: "Writes are turned off with the dev sign-in." } };
  if (!input.sameOrigin) return { status: 403, body: { error: "Request refused: it did not come from this site." } };
  const parsed = parseLiveRequest(input.body, input.today);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  try {
    return { status: 200, body: { ok: true, id: await deps.queue(input.user.email, parsed.value) } };
  } catch (e) {
    if (e instanceof RefusedError) return { status: 429, body: { error: e.message } };
    return { status: 502, body: { error: "The database did not answer. Reload the page to see whether the request was made." } };
  }
}

/** GET /api/admin/live/<id>: how one request is going. 404 for anyone but an admin. `read` is one Turso read of one row by id; null = the runner has not started it yet. */
export async function handleLiveProgress(input: { user: Admin | null; id: string }, deps: { read: (id: number) => Promise<Progress | null> }): Promise<Reply> {
  if (!input.user?.admin) return NOT_FOUND;
  if (!/^\d{1,12}$/.test(input.id)) return { status: 400, body: { error: "Not a request." } };
  try {
    const found = await deps.read(Number(input.id));
    const waiting: Progress = { status: "waiting", summary: null, items: [] };
    return { status: 200, body: found ?? waiting };
  } catch {
    return { status: 502, body: { error: "Turso did not answer." } };
  }
}

/** Turso's row of a request -> what the page shows. Anything unexpected becomes an empty list rather than an error. */
export function progressFromRow(row: Record<string, unknown>): Progress {
  const st = String(row.status ?? "");
  const status: ProgressStatus = st === "done" || st === "nothing" || st === "failed" ? st : "running";
  let items: [number, string, string][] = [];
  try {
    const parsed: unknown = typeof row.items === "string" ? JSON.parse(row.items) : [];
    if (Array.isArray(parsed)) items = parsed.filter((x): x is [number, string, string] => Array.isArray(x) && typeof x[0] === "number" && typeof x[1] === "string").map((x) => [x[0], x[1], String(x[2] ?? "")]);
  } catch {
    items = [];
  }
  return { status, summary: typeof row.summary === "string" ? row.summary : null, items };
}

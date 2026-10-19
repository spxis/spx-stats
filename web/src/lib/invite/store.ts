/**
 * The invite list and the sign-in log, in Turso (not production: it is nearly full, and this is admin data). Two small tables, created by the
 * first write (`create table if not exists`, like scripts/runlog/runlog.py does for the run log), so no migration is needed:
 *
 *   invite       (email primary key, invited_by, invited_at, note)         who an admin let in
 *   site_signin  (email primary key, first_at, last_at, signins)           every allowed sign-in, admins included
 *
 * Reads use the site's read token (TURSO_AUTH_TOKEN); writes need TURSO_RUNLOG_TOKEN, the same token the alert dismissals use. A table that does not
 * exist yet is an empty list, not a failure. No server-only import: the proxy reads the list too. The proxy asks for the whole list at most once a
 * minute per running instance (LIST_TTL_MS), so a signed-in request costs almost no database read and a signed-out one costs none; a removal
 * therefore takes effect within a minute. Never cached by Next's data cache (plain `fetch`, no-store).
 */
import { normalizeEmail } from "./rules.ts";

type Arg = string | number | null;
type Cell = { type: "null" } | { type: "integer" | "float" | "text"; value: string | number } | { type: "blob"; base64: string };

export const LIST_TTL_MS = 60_000;
const TIMEOUT_MS = 4000;
const MAX_INVITES = 1000;

const env = (name: string): string => (process.env[name] ?? "").trim();
const endpoint = (): string => `${env("TURSO_DATABASE_URL").replace(/^libsql:\/\//, "https://").replace(/\/+$/, "")}/v2/pipeline`;

export const inviteReadable = (): boolean => env("TURSO_DATABASE_URL") !== "";
/** Writes (add, remove, the sign-in log) need a token that can write. */
export const inviteWritable = (): boolean => inviteReadable() && env("TURSO_RUNLOG_TOKEN") !== "";

const arg = (v: Arg) => (v === null ? { type: "null" } : typeof v === "number" ? { type: "integer", value: String(v) } : { type: "text", value: v });
const decode = (c: Cell): unknown => (c.type === "null" || c.type === "blob" ? null : c.type === "text" ? String(c.value) : Number(c.value));

const noTable = (message: string): boolean => /no such table/i.test(message);

async function pipeline(token: string, statements: { sql: string; args?: Arg[] }[]): Promise<Record<string, unknown>[][]> {
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ requests: [...statements.map((s) => ({ type: "execute", stmt: { sql: s.sql, args: (s.args ?? []).map(arg) } })), { type: "close" }] }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`turso: ${res.status}`);
  const data = (await res.json()) as { results?: { type: string; response?: { result?: { cols: { name: string }[]; rows: Cell[][] } }; error?: { message?: string } }[] };
  const out: Record<string, unknown>[][] = [];
  for (let i = 0; i < statements.length; i++) {
    const r = data.results?.[i];
    if (r?.type !== "ok" || !r.response?.result) throw new Error(`turso: ${r?.error?.message ?? "no answer"}`.slice(0, 200));
    const { cols, rows } = r.response.result;
    out.push(rows.map((row) => Object.fromEntries(cols.map((c, j) => [c.name, decode(row[j]!)]))));
  }
  return out;
}

const SCHEMA = [
  "create table if not exists invite (email text primary key, invited_by text not null, invited_at text not null, note text)",
  "create table if not exists site_signin (email text primary key, first_at text not null, last_at text not null, signins integer not null default 1)",
];

const isoNow = (): string => new Date().toISOString().replace(/\.\d+Z$/, "Z");

export interface InviteRow { email: string; invited_by: string; invited_at: string; note: string | null; last_at: string | null; signins: number }
export interface SigninRow { email: string; first_at: string; last_at: string; signins: number }

async function read<T>(sql: string, map: (r: Record<string, unknown>) => T): Promise<T[]> {
  try {
    const [rows] = await pipeline(env("TURSO_AUTH_TOKEN"), [{ sql }]);
    return (rows ?? []).map(map);
  } catch (e) {
    if (e instanceof Error && noTable(e.message)) return [];
    throw e;
  }
}

// -------------------------------------------------------------------------------------------------------------- the list, as the gate reads it

let cache: { at: number; emails: Set<string> } | null = null;
let failedAt = 0;
const RETRY_AFTER_FAILURE_MS = 10_000;

/** The invited addresses, from a copy kept for LIST_TTL_MS. Throws when Turso cannot answer and no copy exists (and waits 10 s before asking again); a stale copy is used if one does. */
export async function invitedEmails(now: number = Date.now()): Promise<Set<string>> {
  if (cache && now - cache.at < LIST_TTL_MS) return cache.emails;
  if (!cache && now - failedAt < RETRY_AFTER_FAILURE_MS) throw new Error("turso: invite list unavailable (retrying shortly)");
  try {
    const rows = await read("select email from invite limit 5000", (r) => normalizeEmail(String(r.email)));
    cache = { at: now, emails: new Set(rows) };
    failedAt = 0;
  } catch (e) {
    if (cache) { cache = { at: now - LIST_TTL_MS + RETRY_AFTER_FAILURE_MS, emails: cache.emails }; return cache.emails; }
    failedAt = now;
    throw e;
  }
  return cache.emails;
}

/** Whether an address is invited: true or false, or null when the list cannot be read at all (see `verdict` in rules.ts). */
export async function isInvited(email: string, opts: { fresh?: boolean } = {}): Promise<boolean | null> {
  if (!inviteReadable()) return null;
  if (opts.fresh) cache = null;
  try {
    return (await invitedEmails()).has(normalizeEmail(email));
  } catch {
    return null;
  }
}

/** Forgets the kept copy (after an add or remove on this instance). */
export const forgetList = (): void => { cache = null; failedAt = 0; };

// -------------------------------------------------------------------------------------------------------------- the admin page

/** Every invite with its last sign-in, newest invite first. */
export async function listInvites(): Promise<InviteRow[]> {
  const invites = await read("select email, invited_by, invited_at, note from invite order by invited_at desc limit 2000", (r) => ({
    email: String(r.email), invited_by: String(r.invited_by), invited_at: String(r.invited_at), note: r.note === null ? null : String(r.note),
  }));
  const logins = new Map((await listSignins()).map((s) => [s.email, s]));
  return invites.map((i) => ({ ...i, last_at: logins.get(i.email)?.last_at ?? null, signins: logins.get(i.email)?.signins ?? 0 }));
}

/** Every address that has signed in since the gate closed. */
export async function listSignins(): Promise<SigninRow[]> {
  return read("select email, first_at, last_at, signins from site_signin order by last_at desc limit 5000", (r) => ({
    email: String(r.email), first_at: String(r.first_at), last_at: String(r.last_at), signins: Number(r.signins) || 0,
  }));
}

export type WriteResult = { ok: true } | { ok: false; message: string };

export async function addInvite(email: string, by: string, note: string | null): Promise<WriteResult> {
  if (!inviteWritable()) return { ok: false, message: "This server has no token that can write to the invite list (TURSO_RUNLOG_TOKEN)." };
  const e = normalizeEmail(email);
  try {
    const [, , count] = await pipeline(env("TURSO_RUNLOG_TOKEN"), [...SCHEMA.map((sql) => ({ sql })), { sql: "select count(*) as n from invite" }]);
    if (Number(count?.[0]?.n ?? 0) >= MAX_INVITES) return { ok: false, message: `The list is full (${MAX_INVITES} addresses).` };
    await pipeline(env("TURSO_RUNLOG_TOKEN"), [{ sql: "insert into invite (email, invited_by, invited_at, note) values (?, ?, ?, ?) on conflict (email) do update set note = coalesce(excluded.note, invite.note)", args: [e, by.slice(0, 200), isoNow(), note] }]);
    forgetList();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: `Turso did not accept the change: ${err instanceof Error ? err.message : "error"}`.slice(0, 200) };
  }
}

export async function removeInvite(email: string): Promise<WriteResult> {
  if (!inviteWritable()) return { ok: false, message: "This server has no token that can write to the invite list (TURSO_RUNLOG_TOKEN)." };
  try {
    await pipeline(env("TURSO_RUNLOG_TOKEN"), [...SCHEMA.map((sql) => ({ sql })), { sql: "delete from invite where email = ?", args: [normalizeEmail(email)] }]);
    forgetList();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: `Turso did not accept the change: ${err instanceof Error ? err.message : "error"}`.slice(0, 200) };
  }
}

/** Notes one allowed sign-in. Best effort: a failure, or no write token, changes nothing for the person signing in. */
export async function recordSignIn(email: string): Promise<void> {
  if (!inviteWritable()) return;
  const now = isoNow();
  try {
    await pipeline(env("TURSO_RUNLOG_TOKEN"), [
      ...SCHEMA.map((sql) => ({ sql })),
      { sql: "insert into site_signin (email, first_at, last_at, signins) values (?, ?, ?, 1) on conflict (email) do update set last_at = excluded.last_at, signins = site_signin.signins + 1", args: [normalizeEmail(email), now, now] },
    ]);
  } catch {
    /* the log is a convenience */
  }
}

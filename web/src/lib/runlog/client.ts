import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { z } from "zod";
import { tursoConfigured, tursoRows, type Arg } from "../turso/client.ts";
import { PAGE_SIZE, withStale, openCount, type AlertRow, type Filters, type RunLite, type Stale } from "./rules.ts";
import { staleLeagues } from "./stale.ts";

/**
 * The run log and the alerts, read from Turso (tables run_log, run_log_item and alert, written by scripts/runlog/runlog.py) with the same read
 * token as the other Turso tables, never cached by the data cache (these pages are drawn per request). Dismissing an alert is the one write the
 * site makes: it needs TURSO_RUNLOG_TOKEN (a token that can write) and touches only `alert`.
 * The banner and the count in the account menu read the alerts through a 60 second cache (`ALERT_TAG`), expired by a dismissal.
 */
export const ALERT_TAG = "runlog:alerts";
const LIVE = { live: true } as const;

const text = z.string();
const textN = z.string().nullable();
const int = z.coerce.number().int();

export const runSchema = z.object({
  id: int, uid: text, kind: text, job: text, scope: textN, actor: textN, host: textN, ref: textN, started_at: text, finished_at: textN, outcome: text,
  summary: textN, counts: textN, detail: textN, links: textN,
});
export const itemSchema = z.object({ seq: int, name: text, outcome: textN, summary: textN, counts: textN, detail: textN, at: textN });
export const alertSchema = z.object({
  id: int, key: text, job: text, scope: textN, severity: text, message: text, first_at: text, last_at: text, repeats: int, state: text,
  resolved_at: textN, dismissed_at: textN, dismissed_by: textN,
});
export type Run = z.infer<typeof runSchema>;
export type Item = z.infer<typeof itemSchema>;

const RUN_COLS = "id, uid, kind, job, scope, actor, host, ref, started_at, finished_at, outcome, summary, counts, detail, links";

/** The log has not been written yet when Turso says there is no such table: that is an empty log, not a failure. */
const noTable = (e: unknown) => e instanceof Error && /no such table/i.test(e.message);

/** One page of runs, newest first, narrowed by the filters. -> the rows and whether another page follows. */
export async function listRuns(f: Filters): Promise<{ rows: Run[]; more: boolean }> {
  const where: string[] = [];
  const args: Arg[] = [];
  if (f.kind) { where.push("kind = ?"); args.push(f.kind); }
  if (f.job) { where.push("job = ?"); args.push(f.job); }
  if (f.outcome) { where.push("outcome = ?"); args.push(f.outcome); }
  if (f.from) { where.push("started_at >= ?"); args.push(`${f.from}T00:00:00Z`); }
  if (f.to) { where.push("started_at < ?"); args.push(new Date(Date.parse(`${f.to}T00:00:00Z`) + 86_400_000).toISOString().replace(/\.\d+Z$/, "Z")); }
  try {
    const rows = await tursoRows(
      `select ${RUN_COLS} from run_log ${where.length ? `where ${where.join(" and ")}` : ""} order by started_at desc, id desc limit ? offset ?`,
      [...args, PAGE_SIZE + 1, (f.page - 1) * PAGE_SIZE], runSchema, { tables: ["run_log"], ...LIVE });
    return { rows: rows.slice(0, PAGE_SIZE), more: rows.length > PAGE_SIZE };
  } catch (e) {
    if (noTable(e)) return { rows: [], more: false };
    throw e;
  }
}

/** The runs that started from `since` (an ISO time), for the daily view: just what the expected-job check needs. */
export async function runsSince(since: string, until: string): Promise<RunLite[]> {
  try {
    return await tursoRows("select uid, job, outcome, started_at, finished_at, summary from run_log where started_at >= ? and started_at < ? and kind in ('job', 'ops') order by started_at desc limit 2000",
      [since, until], z.object({ uid: text, job: text, outcome: text, started_at: text, finished_at: textN, summary: textN }), { tables: ["run_log"], ...LIVE });
  } catch (e) {
    if (noTable(e)) return [];
    throw e;
  }
}

/** The distinct jobs in the log, for the job filter. */
export async function jobNames(): Promise<string[]> {
  try {
    return (await tursoRows("select distinct job from run_log order by job limit 200", [], z.object({ job: text }), { tables: ["run_log"], ...LIVE })).map((r) => r.job);
  } catch (e) {
    if (noTable(e)) return [];
    throw e;
  }
}

export async function getRun(uid: string): Promise<{ run: Run; items: Item[] } | null> {
  if (!/^[0-9a-f]{32}$/.test(uid)) return null;
  const [run] = await tursoRows(`select ${RUN_COLS} from run_log where uid = ?`, [uid], runSchema, { tables: ["run_log"], ...LIVE });
  if (!run) return null;
  const items = await tursoRows("select seq, name, outcome, summary, counts, detail, at from run_log_item where run_uid = ? order by seq", [uid], itemSchema, { tables: ["run_log_item"], ...LIVE });
  return { run, items };
}

// ---------------------------------------------------------------------------------------------------- alerts

async function storedAlerts(): Promise<AlertRow[]> {
  try {
    return await tursoRows("select id, key, job, scope, severity, message, first_at, last_at, repeats, state, resolved_at, dismissed_at, dismissed_by from alert order by last_at desc limit 200", [], alertSchema, { tables: ["alert"], ...LIVE });
  } catch (e) {
    if (noTable(e)) return [];
    throw e;
  }
}

/** Writes need a token that can write; without one the site only reads. */
export const canWriteLog = (): boolean => (process.env.TURSO_RUNLOG_TOKEN ?? "").trim() !== "" && tursoConfigured();

async function write(statements: { sql: string; args: Arg[] }[]): Promise<void> {
  const url = (process.env.TURSO_DATABASE_URL ?? "").trim().replace(/^libsql:\/\//, "https://").replace(/\/+$/, "");
  const arg = (v: Arg) => (v === null ? { type: "null" } : typeof v === "number" ? { type: "integer", value: String(v) } : { type: "text", value: v });
  const res = await fetch(`${url}/v2/pipeline`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${(process.env.TURSO_RUNLOG_TOKEN ?? "").trim()}` },
    body: JSON.stringify({ requests: [...statements.map((s) => ({ type: "execute", stmt: { sql: s.sql, args: s.args.map(arg) } })), { type: "close" }] }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`turso: ${res.status}`);
  const data = (await res.json()) as { results?: { type: string; error?: { message?: string } }[] };
  const bad = data.results?.find((r) => r.type === "error");
  if (bad) throw new Error(`turso: ${bad.error?.message ?? "error"}`.slice(0, 200));
}

/**
 * Stale-data alerts kept in the table, so a dismissal sticks: a stale league with no row (or a resolved one) opens one, a stale league with an
 * open row only touches it (a dismissal stays), and a league that is fresh again resolves its row. Best effort: a failed write changes nothing shown.
 */
async function syncStale(stale: readonly Stale[], stored: readonly AlertRow[], now: number): Promise<void> {
  if (!canWriteLog()) return;
  const t = new Date(now).toISOString().replace(/\.\d+Z$/, "Z");
  const statements: { sql: string; args: Arg[] }[] = [];
  const names = new Set(stale.map((s) => s.league));
  for (const s of stale) {
    const row = stored.find((a) => a.key === `stale:${s.league}`);
    if (row && row.state === "open") continue;
    const message = `${s.league.toUpperCase()} has had no score update for ${Math.max(2, Math.floor((now - Date.parse(`${s.since}T00:00:00Z`)) / 86_400_000))} days: games from ${s.since} still have no result.`;
    statements.push({
      sql: "insert into alert (key, job, scope, severity, message, first_at, last_at, repeats, state) values (?, 'stale-data', ?, 'error', ?, ?, ?, 1, 'open') "
        + "on conflict (key) do update set message = excluded.message, last_at = excluded.last_at, repeats = alert.repeats + 1, state = 'open', resolved_at = null, dismissed_at = null, dismissed_by = null",
      args: [`stale:${s.league}`, s.league, message, t, t],
    });
  }
  for (const a of stored) {
    if (a.key.startsWith("stale:") && a.state === "open" && !names.has(a.key.slice(6))) {
      statements.push({ sql: "update alert set state = 'resolved', resolved_at = ? where key = ? and state = 'open'", args: [t, a.key] });
    }
  }
  if (statements.length) await write(statements);
}

export type AlertView = { alerts: AlertRow[]; open: number; staleChecked: boolean };

const readAlerts = unstable_cache(async (): Promise<AlertView> => {
  const now = Date.now();
  const stored = await storedAlerts();
  let stale: Stale[] = [];
  let staleChecked = true;
  try {
    stale = await staleLeagues(now);
  } catch {
    staleChecked = false;
  }
  let all = withStale(stored, stale, now);
  try {
    await syncStale(stale, stored, now);
    if (canWriteLog() && stale.length) all = withStale(await storedAlerts(), stale, now);
  } catch {
    /* the rows could not be kept; the stale leagues are still shown */
  }
  return { alerts: all, open: openCount(all), staleChecked };
}, ["runlog-alerts"], { revalidate: 60, tags: [ALERT_TAG] });

/** The alerts for the banner and the menu count; never throws (an admin page must draw when Turso is down). */
export async function alertView(): Promise<AlertView & { error: boolean }> {
  if (!tursoConfigured()) return { alerts: [], open: 0, staleChecked: false, error: false };
  try {
    return { ...(await readAlerts()), error: false };
  } catch {
    return { alerts: [], open: 0, staleChecked: false, error: true };
  }
}

/** Dismiss one alert (`id` > 0) or, with no id, every alert that is shown. The one write the site makes to the log. */
export async function dismiss(id: number | null, by: string): Promise<void> {
  if (!canWriteLog()) throw new Error("The site has no token to write the alert table (TURSO_RUNLOG_TOKEN).");
  const t = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  await write([id === null
    ? { sql: "update alert set dismissed_at = ?, dismissed_by = ? where dismissed_at is null", args: [t, by] }
    : { sql: "update alert set dismissed_at = ?, dismissed_by = ? where id = ? and dismissed_at is null", args: [t, by, id] }]);
  revalidateTag(ALERT_TAG, { expire: 0 });
}

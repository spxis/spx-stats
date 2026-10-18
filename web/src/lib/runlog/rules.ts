/**
 * Pure rules of the run log pages (/admin/runs and the alert banner): which jobs are expected and when, how an expected job shows as "ran",
 * "missed" or "not due yet", the filters in the address, and what counts as an open alert. No network and no server-only, so a node test can
 * reason about each rule (scripts/runlog.test.ts). The writer is scripts/runlog/runlog.py; the tables are in Turso (lib/runlog/client.ts).
 */

export const KINDS = ["job", "data", "release", "approval", "deploy", "ops"] as const;
export const OUTCOMES = ["ok", "warning", "failed", "skipped", "running"] as const;
export type Kind = (typeof KINDS)[number];
export type Outcome = (typeof OUTCOMES)[number];

export const PAGE_SIZE = 50;

/**
 * The jobs that must show up on their own, and when. `daily`: at least one run that started on the UTC day, from `dueUtc` (HH:MM) on; before
 * that hour the day is "not due yet". `every`: at least one run in the last `hours`. A job that is not here (a deploy, a release, an approval)
 * happens when somebody does something and is never "missed".
 */
export type Expected = { job: string; label: string } & ({ cadence: "daily"; dueUtc: string } | { cadence: "every"; hours: number });
export const EXPECTED: readonly Expected[] = [
  { job: "daily-scores", label: "Daily scores", cadence: "daily", dueUtc: "16:00" },      // 10:00 Eastern, three tries an hour apart
  { job: "drift-check", label: "Nightly drift check", cadence: "daily", dueUtc: "06:00" }, // runs after 03:00 UTC, retried hourly
  { job: "harvest", label: "Harvester", cadence: "every", hours: 3 },                      // a cycle is about an hour, then a short wait
  { job: "raw-export", label: "Dropbox export", cadence: "every", hours: 3 },              // hourly on a Mac; asleep or off the network skips runs
  { job: "ops-snapshot", label: "Ops snapshot", cadence: "every", hours: 2 },              // written at least hourly
  { job: "watchdog", label: "API watchdog", cadence: "every", hours: 2 },                  // one entry an hour while probes answer
];

export type RunLite = { job: string; outcome: string; started_at: string; finished_at: string | null; summary: string | null; uid: string };
export type ExpectedState = "ran" | "failed" | "warning" | "missed" | "due-later" | "running";
export type ExpectedLine = { job: string; label: string; state: ExpectedState; count: number; last: RunLite | null };

const ms = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(t) ? 0 : t;
};

/** `day` is YYYY-MM-DD (UTC). Whether this day is the one in progress at `now`. */
const isToday = (day: string, now: number) => new Date(now).toISOString().slice(0, 10) === day;

/**
 * Each expected job against the runs in the log. For a past day a daily job either ran or was missed. For today a daily job before its hour is
 * "due later"; an `every` job looks back from `now` (and for a past day, over that whole day, where one run is enough).
 */
export function expectedLines(runs: readonly RunLite[], day: string, now: number = Date.now(), expected: readonly Expected[] = EXPECTED): ExpectedLine[] {
  const start = Date.parse(`${day}T00:00:00Z`);
  const end = start + 86_400_000;
  return expected.map((e) => {
    const mine = runs.filter((r) => r.job === e.job).sort((a, b) => ms(b.started_at) - ms(a.started_at));
    const inDay = mine.filter((r) => ms(r.started_at) >= start && ms(r.started_at) < end);
    const last = (e.cadence === "every" && isToday(day, now) ? mine.filter((r) => ms(r.started_at) >= now - e.hours * 3_600_000) : inDay)[0] ?? null;
    const count = inDay.length;
    if (!last) {
      if (e.cadence === "daily" && isToday(day, now)) {
        const [h, m] = e.dueUtc.split(":").map(Number);
        if (now < start + (h * 60 + m) * 60_000) return { job: e.job, label: e.label, state: "due-later", count, last: null };
      }
      return { job: e.job, label: e.label, state: "missed", count, last: mine[0] ?? null };
    }
    const bad = inDay.some((r) => r.outcome === "failed");
    const state: ExpectedState = last.outcome === "running" ? "running" : last.outcome === "failed" ? "failed" : bad || last.outcome === "warning" ? "warning" : "ran";
    return { job: e.job, label: e.label, state, count, last };
  });
}

// ---------------------------------------------------------------------------------------------------- filters in the address

export type Filters = { kind: Kind | ""; job: string; outcome: Outcome | ""; from: string; to: string; page: number };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";

/** The filters from the query, each one checked: an unknown kind, outcome or date is ignored, never passed on to the database. */
export function parseFilters(q: Record<string, string | string[] | undefined>): Filters {
  const kind = one(q.kind);
  const outcome = one(q.outcome);
  const job = one(q.job).trim();
  const day = (v: string) => (DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : "");
  const page = Number.parseInt(one(q.page), 10);
  return {
    kind: (KINDS as readonly string[]).includes(kind) ? (kind as Kind) : "",
    job: /^[a-z0-9][a-z0-9._:-]{0,59}$/i.test(job) ? job : "",
    outcome: (OUTCOMES as readonly string[]).includes(outcome) ? (outcome as Outcome) : "",
    from: day(one(q.from)),
    to: day(one(q.to)),
    page: Number.isInteger(page) && page > 0 && page < 10_000 ? page : 1,
  };
}

/** The query string for a set of filters (empty ones left out). */
export function filterQuery(f: Partial<Filters>): string {
  const p = new URLSearchParams();
  for (const k of ["kind", "job", "outcome", "from", "to"] as const) if (f[k]) p.set(k, String(f[k]));
  if (f.page && f.page > 1) p.set("page", String(f.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** The day shown in the daily view: `?day=` when it is a real day, else today (UTC). */
export function dayOf(v: string | string[] | undefined, now: number = Date.now()): string {
  const d = one(v);
  return DAY.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) ? d : new Date(now).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------------- alerts

export type AlertRow = {
  id: number; key: string; job: string; scope: string | null; severity: string; message: string;
  first_at: string; last_at: string; repeats: number; state: string; resolved_at: string | null; dismissed_at: string | null; dismissed_by: string | null;
};

/** What the banner lists: every alert nobody dismissed (an open one, and a resolved one until somebody dismisses it). Open ones first, newest first. */
export function shown(alerts: readonly AlertRow[]): AlertRow[] {
  return alerts
    .filter((a) => !a.dismissed_at)
    .sort((a, b) => Number(b.state === "open") - Number(a.state === "open") || ms(b.last_at) - ms(a.last_at));
}

/** The number beside "Data releases (N)" in the account menu: alerts still open and not dismissed. */
export const openCount = (alerts: readonly AlertRow[]): number => alerts.filter((a) => a.state === "open" && !a.dismissed_at).length;

// ---------------------------------------------------------------------------------------------------- stale data

/** A league with no score update for longer than this is raised, by a check that does not depend on the daily job. */
export const STALE_DAYS = 2;

export type Stale = { league: string; since: string };

/** The YYYY-MM-DD before which a regular season game that is still "scheduled" means its score never arrived. */
export const staleCutoff = (now: number = Date.now()): string => new Date(now - STALE_DAYS * 86_400_000).toISOString().slice(0, 10);

/** The alert row a stale league becomes (key `stale:<league>`). */
export function staleAlert(s: Stale, now: number = Date.now()): Omit<AlertRow, "id"> {
  const days = Math.max(STALE_DAYS, Math.floor((now - Date.parse(`${s.since}T00:00:00Z`)) / 86_400_000));
  const t = new Date(now).toISOString();
  return {
    key: `stale:${s.league}`, job: "stale-data", scope: s.league, severity: "error", state: "open", repeats: 1, resolved_at: null, dismissed_at: null, dismissed_by: null,
    message: `${s.league.toUpperCase()} has had no score update for ${days} days: games from ${s.since} still have no result.`, first_at: t, last_at: t,
  };
}

/** Stored alerts plus the stale leagues that have no stored row yet (shown, but they cannot be dismissed until the site can write). */
export function withStale(stored: readonly AlertRow[], stale: readonly Stale[], now: number = Date.now()): AlertRow[] {
  const have = new Set(stored.map((a) => a.key));
  const extra = stale.filter((s) => !have.has(`stale:${s.league}`)).map((s, i) => ({ id: -(i + 1), ...staleAlert(s, now) }));
  return [...stored, ...extra];
}

/** The outcome of a run as a sort of badge class. */
export const tone = (outcome: string | null | undefined): "ok" | "warn" | "bad" | "idle" =>
  outcome === "ok" ? "ok" : outcome === "warning" ? "warn" : outcome === "failed" ? "bad" : "idle";

/** Counts and details are stored as JSON text; a text that is not JSON is shown as it is, a missing one as nothing. */
export function parseJson(text: unknown): unknown {
  if (typeof text !== "string" || text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** "3 files, 2 copied": a counts object as a short line. */
export function countsLine(counts: unknown): string {
  if (!counts || typeof counts !== "object") return "";
  return Object.entries(counts as Record<string, unknown>)
    .filter(([, v]) => typeof v === "number" || typeof v === "string")
    .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
    .join(" · ");
}

/** Seconds between two times, or null. */
export function durationSeconds(start: string | null, end: string | null): number | null {
  const a = ms(start);
  const b = ms(end);
  return a && b && b >= a ? Math.round((b - a) / 1000) : null;
}

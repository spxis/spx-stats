import { z } from "zod";

/**
 * What the runner next to DS1 pushes into production's meta.ops_status (scripts/release/ops.py, migration 104) and what
 * api.ops_dashboard answers. No imports from the server, so a node test can load it. A section the runner could not read arrives as
 * { error }, and the page shows the others.
 */
const failed = z.object({ error: z.string() });
const maybe = <T extends z.ZodTypeAny>(ok: T) => z.union([failed, ok]);
const count = z.number().default(0);
const when = z.string().nullable().default(null);

const harvester = z.object({
  state: z.enum(["running", "paused", "idle", "stale", "stopped", "never"]),
  paused: z.object({ by: z.string().nullable(), at: when }).nullable().default(null),
  last_beat_at: when,
  run: z.object({ id: z.number().nullable(), outcome: z.string().nullable(), started_at: when, sha: z.string().nullable().default(null), paused_secs: count }).nullable().default(null),
  queue: z.record(z.string(), z.record(z.string(), z.number())).default({}),
  queued_total: count,
  gap: z.array(z.tuple([z.string(), z.string(), z.number()])).default([]),
  gap_total: count,
  today: z.object({ requests: count, bytes: count, archived: count }),
  hour: z.object({ requests: count, bytes: count, archived: count }),
  last_error: z.object({ kind: z.string().nullable(), target: z.string().nullable(), error: z.string().nullable(), at: when }).nullable().default(null),
  archive_rows: count,
});

const daily = z.object({
  last: z.object({ id: z.number().nullable(), outcome: z.string().nullable(), started_at: when, finished_at: when, counts: z.record(z.string(), z.number()).default({}) }).nullable().default(null),
  ok_7d: count,
  failed_7d: count,
  release: z.object({ number: z.string().nullable(), status: z.string().nullable(), at: when }).nullable().default(null),
});

/** One league of the daily scores job (scripts/release/ops.py shape_scores). `flags` are what the admin alerts come from: stale, overdue. */
const scoreLeague = z.object({
  league: z.string(),
  outcome: z.string(),
  reason: z.string().nullable().default(null),
  at: when,
  ok_at: when,
  changed_at: when,
  games_skipped: count,
  clubs_skipped: z.array(z.string()).default([]),
  waiting: count,
  overdue: count,
  oldest: when,
  sample: z.array(z.tuple([z.string(), z.string(), z.string()])).default([]),
  stale_hours: z.number().nullable().default(null),
  flags: z.array(z.enum(["stale", "overdue"])).default([]),
});

const scores = z.object({
  limits: z.object({ stale: z.number(), overdue: z.number(), no_run: z.number() }),
  last_run: z.object({ id: z.number().nullable(), outcome: z.string().nullable(), started_at: when }).nullable().default(null),
  running: z.boolean().default(false),
  quiet_hours: z.number().nullable().default(null),
  no_run: z.boolean().default(false),
  leagues: z.array(scoreLeague).default([]),
});

const incident = z.object({ since: when, recovered_at: when, reload_at: when, restart_at: when, probes_failed: count, error: z.string().nullable().default(null) });
const watchdog = z.object({
  enabled: z.boolean(),
  known: z.boolean(),
  last_probe_at: when,
  last_ok_at: when,
  last_probe_ok: z.boolean().nullable().default(null),
  streak: count,
  last_error: z.string().nullable().default(null),
  open: incident.nullable().default(null),
  last_incident: incident.nullable().default(null),
});

const releaseRef = z.object({ number: z.string().nullable(), title: z.string().nullable().default(null), kind: z.string().nullable().default(null), at: when });
const releases = z.object({
  pending: count, approved: count, running: count,
  last_done: releaseRef.nullable().default(null),
  last_failed: releaseRef.nullable().default(null),
  drift_checked_at: when,
  nightly_drift_day: z.string().nullable().default(null),
  runner: z.object({ sha: z.string().nullable().default(null), ref: z.string().nullable().default(null) }),
});

const sync = z.object({
  tables: z.array(z.tuple([z.string(), z.number().nullable(), z.number().nullable(), z.number()])).default([]),
  differs: count,
  count,
  checked_at: when,
  oldest_checked_at: when,
  trimmed: z.boolean().optional(),
});

const backup = z.object({
  archive_rows: count,
  archive_bytes: count,
  export: maybe(z.object({ at: when, outcome: z.string().nullable(), checked: count, copied: count, present: count, failed: count, bytes: count, seconds: z.number().nullable().default(null) })).nullable().default(null),
  last_ok_at: when,
});

export const snapshot = z.object({
  v: z.number(),
  at: z.string(),
  harvester: maybe(harvester),
  daily: maybe(daily),
  scores: maybe(scores).optional(),   // snapshots from before the scores section have none
  watchdog: maybe(watchdog),
  releases: maybe(releases),
  sync: maybe(sync),
  backup: maybe(backup),
});

const number = z.number().nullable().default(null);
const historyPoint = z.object({ id: z.number(), t: z.string(), pages: number, requests: number, gaps: number, queued: number, differs: number });

/** The leagues the daily scores job loads (scripts/daily/run.py LEAGUES); the order of the table on /admin/ops. */
export const SCORE_LEAGUES = ["nhl", "nba", "mlb", "nfl", "cfl"] as const;

export const REQUEST_KINDS = ["snapshot", "harvest_pause", "harvest_resume"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

const opsRequest = z.object({
  id: z.number(),
  kind: z.string(),
  requested_by: z.string(),
  requested_at: z.string(),
  status: z.enum(["queued", "done", "failed"]),
  finished_at: when,
  summary: z.string().nullable().default(null),
});

/** A scores request ("Update now" on one league, or every league when `league` is null), from migration 150's api.ops_dashboard. */
const scoreRequest = z.object({
  id: z.number(),
  league: z.string().nullable().default(null),
  requested_by: z.string(),
  requested_at: z.string(),
  status: z.enum(["queued", "running", "done", "failed", "nothing"]),
  started_at: when,
  finished_at: when,
  summary: z.string().nullable().default(null),
  release_number: z.string().nullable().default(null),
});

export const dashboard = z.object({
  latest: z.object({ id: z.number(), taken_at: z.string(), payload: snapshot }).nullable(),
  history: z.array(historyPoint).default([]),
  requests: z.array(opsRequest).default([]),
  score_requests: z.array(scoreRequest).default([]),   // none before migration 150
  server_now: z.string(),
});

export type Snapshot = z.infer<typeof snapshot>;
export type Dashboard = z.infer<typeof dashboard>;
export type HistoryPoint = z.infer<typeof historyPoint>;
export type OpsRequest = z.infer<typeof opsRequest>;
export type Harvester = z.infer<typeof harvester>;
export type Daily = z.infer<typeof daily>;
export type Scores = z.infer<typeof scores>;
export type ScoreLeague = z.infer<typeof scoreLeague>;
export type ScoreRequest = z.infer<typeof scoreRequest>;
export type Watchdog = z.infer<typeof watchdog>;
export type Releases = z.infer<typeof releases>;
export type Sync = z.infer<typeof sync>;
export type Backup = z.infer<typeof backup>;
export type Failed = z.infer<typeof failed>;

/** True for a section the runner could not read. */
export const isFailed = <T extends object>(section: T | Failed): section is Failed => "error" in section && Object.keys(section).length === 1;

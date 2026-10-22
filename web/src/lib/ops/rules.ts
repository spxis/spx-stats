import type { Backup, Dashboard, Harvester, HistoryPoint, OpsRequest, RequestKind, ScoreLeague, ScoreRequest, Snapshot, Sync } from "./schema.ts";
import { isFailed } from "./schema.ts";

/**
 * Pure helpers for /admin/ops: the shaping of what the runner pushed (a snapshot, a day of history, the last requests) into what the page
 * draws. No network, no server-only, so a node test can reason about each rule (scripts/ops.test.ts). The words are the page's own
 * (phrases `ops.*`); this file only decides which ones, and with what numbers.
 */

/** A snapshot older than this is a runner that has stopped: it writes an unchanged one every hour, so 90 minutes is one hour and slack. */
export const SNAPSHOT_STALE_MINUTES = 90;
/** The drift comparison runs every night and after each release; older than this is a comparison nobody has made. */
export const DRIFT_STALE_HOURS = 36;
/** The Dropbox export is meant to run hourly (launchd); an hour with no good run means the Mac is asleep, off the network, or the schedule is not installed. */
export const EXPORT_STALE_HOURS = 3;
/** The daily scores job runs once a day. */
export const DAILY_STALE_HOURS = 30;
/** The watchdog probes every minute. */
export const PROBE_STALE_MINUTES = 5;

export const ms = (iso: string | null | undefined): number | null => {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(t) ? null : t;
};

/** Whole minutes from `from` to `to` (never negative), or null when either is unreadable. */
export function minutesBetween(from: string | null | undefined, to: string | number): number | null {
  const a = ms(from);
  const b = typeof to === "number" ? to : ms(to);
  return a === null || b === null ? null : Math.max(0, Math.floor((b - a) / 60_000));
}

/** HH:MM in UTC, like the rest of the admin pages. */
export function clock(iso: string | null | undefined): string | null {
  const t = ms(iso);
  return t === null ? null : new Date(t).toISOString().slice(11, 16);
}

/** YYYY-MM-DD HH:MM in UTC. */
export function stampUtc(iso: string | null | undefined): string | null {
  const t = ms(iso);
  return t === null ? null : new Date(t).toISOString().slice(0, 16).replace("T", " ");
}

export type Age = { unit: "minute" | "hour" | "day"; n: number };

/** A span in minutes as its largest whole unit: 59 min, 3 h, 2 d. */
export function age(minutes: number): Age {
  if (minutes < 60) return { unit: "minute", n: minutes };
  if (minutes < 2 * 24 * 60) return { unit: "hour", n: Math.floor(minutes / 60) };
  return { unit: "day", n: Math.floor(minutes / (24 * 60)) };
}

export type AsOf = { clock: string | null; minutes: number | null; stale: boolean };

/** "as of HH:MM (N min ago)": measured against the database's clock, not the browser's. Stale when the runner has been silent too long. */
export function asOf(takenAt: string | null | undefined, serverNow: string): AsOf {
  const minutes = minutesBetween(takenAt, serverNow);
  return { clock: clock(takenAt), minutes, stale: minutes === null || minutes > SNAPSHOT_STALE_MINUTES };
}

// ---------------------------------------------------------------------------------------------------- sparklines

export type Spark = { points: string; min: number; max: number; last: number | null; count: number };

/**
 * The points of a small line chart for a series (null where the snapshot had no value), scaled into width x height with `pad` around.
 * Null when there are fewer than two values to draw. The y axis starts at 0 for a series that is never negative, so a flat low line does not
 * look like a mountain.
 */
export function sparkline(values: (number | null)[], width = 160, height = 32, pad = 2): Spark | null {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length < 2) return null;
  const max = Math.max(...present);
  const min = Math.min(...present) >= 0 ? 0 : Math.min(...present);
  const span = max - min || 1;
  const n = values.length;
  const step = n > 1 ? (width - 2 * pad) / (n - 1) : 0;
  const pts: string[] = [];
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) return;
    pts.push(`${(pad + i * step).toFixed(1)},${(height - pad - ((v - min) / span) * (height - 2 * pad)).toFixed(1)}`);
  });
  return { points: pts.join(" "), min, max, last: present[present.length - 1] ?? null, count: present.length };
}

export type SeriesKey = "pages" | "requests" | "gaps" | "queued" | "differs";

/** One series of the day's history, oldest first. */
export const series = (history: HistoryPoint[], key: SeriesKey): (number | null)[] => history.map((h) => h[key]);

// ---------------------------------------------------------------------------------------------------- DS1 versus production

export type SyncRowView = { table: string; ds1: number | null; prod: number | null; differs: boolean; delta: number | null };

/** Rows for the comparison table: the differing tables first (largest gap first), then the others by name. */
export function syncRows(sync: Sync): SyncRowView[] {
  const rows = sync.tables.map(([table, ds1, prod, differs]) => ({ table, ds1, prod, differs: differs === 1, delta: ds1 !== null && prod !== null ? prod - ds1 : null }));
  return rows.sort((a, b) => Number(b.differs) - Number(a.differs) || Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0) || a.table.localeCompare(b.table));
}

// ---------------------------------------------------------------------------------------------------- the harvester's controls

export type PauseControl = "pause" | "resume";

/**
 * Which button the harvester section shows: Resume while it is paused (as the snapshot saw it, or as a pause request the runner has not done yet
 * would make it), else Pause. A request already waiting for the runner turns the button off, with its own note.
 */
export function pauseControl(h: Harvester | null, requests: OpsRequest[]): { show: PauseControl; waiting: RequestKind | null } {
  const waiting = requests.find((r) => r.status === "queued" && (r.kind === "harvest_pause" || r.kind === "harvest_resume"));
  return { show: h?.state === "paused" ? "resume" : "pause", waiting: waiting ? (waiting.kind as RequestKind) : null };
}

/** The last request of a kind that is still waiting, or null: used to switch a button off. */
export function queuedOf(requests: OpsRequest[], kind: RequestKind): OpsRequest | null {
  return requests.find((r) => r.status === "queued" && r.kind === kind) ?? null;
}

// ---------------------------------------------------------------------------------------------------- what needs a look

export type IssueKey =
  | "snapshotStale" | "sectionFailed"
  | "harvesterPaused" | "harvesterStale" | "harvesterStopped" | "harvesterNever"
  | "backupNever" | "backupProblems" | "backupStale" | "backupMissingTable" | "backupBehind"
  | "syncDiffers" | "syncStale" | "syncNever"
  | "dailyFailed" | "dailyStale" | "dailyNever"
  | "scoresStale" | "scoresStaleNever" | "scoresOverdue" | "scoresNoRun"
  | "watchdogOpen" | "watchdogSilent" | "watchdogOff"
  | "releasesWaiting";

export type Issue = { key: IssueKey; level: "bad" | "warn" | "info"; vars: Record<string, string | number> };

const hoursSince = (iso: string | null | undefined, now: string | number): number | null => {
  const m = minutesBetween(iso, now);
  return m === null ? null : m / 60;
};

/**
 * Everything on the snapshot that needs a human, worst first. `now` is the database's clock at the time of the read. Ages inside the snapshot are
 * measured at the snapshot's own time (its `at`), so a quiet system does not look broken just because the page was opened later; only the
 * snapshot's own age uses `now`.
 */
export function issues(d: Dashboard): Issue[] {
  const out: Issue[] = [];
  const push = (key: IssueKey, level: Issue["level"], vars: Issue["vars"] = {}) => out.push({ key, level, vars });
  if (!d.latest) return out;
  const s: Snapshot = d.latest.payload;
  const a = asOf(d.latest.taken_at, d.server_now);
  if (a.stale) push("snapshotStale", "bad", { minutes: a.minutes ?? 0 });
  const at = s.at;
  const failed = (["harvester", "daily", "scores", "watchdog", "releases", "sync", "backup"] as const).filter((k) => s[k] !== undefined && isFailed(s[k]));
  if (failed.length) push("sectionFailed", "warn", { sections: failed.join(", ") });

  const h = s.harvester;
  if (!isFailed(h)) {
    if (h.state === "paused") push("harvesterPaused", "warn", { who: h.paused?.by ?? "" });
    else if (h.state === "stale") push("harvesterStale", "bad", { minutes: minutesBetween(h.last_beat_at, at) ?? 0 });
    else if (h.state === "stopped") push("harvesterStopped", "warn", { minutes: minutesBetween(h.last_beat_at, at) ?? 0 });
    else if (h.state === "never") push("harvesterNever", "info");
  }

  const b = s.backup;
  if (!isFailed(b)) {
    const e = b.export;
    if (e === null) push("backupNever", "warn");
    else if (isFailed(e)) push("backupMissingTable", "info");
    else {
      if (e.failed > 0) push("backupProblems", "bad", { failed: e.failed });
      const sinceOk = hoursSince(b.last_ok_at, at);
      if (sinceOk === null || sinceOk > EXPORT_STALE_HOURS) push("backupStale", "warn", { hours: sinceOk === null ? 0 : Math.floor(sinceOk) });
      const done = e.present + e.copied;
      if (b.archive_rows > done && e.failed === 0) push("backupBehind", "info", { rows: b.archive_rows - done });
    }
  }

  const y = s.sync;
  if (!isFailed(y)) {
    if (y.checked_at === null) push("syncNever", "warn");
    else {
      if (y.differs > 0) push("syncDiffers", "warn", { tables: y.differs });
      const since = hoursSince(y.checked_at, at);
      if (since !== null && since > DRIFT_STALE_HOURS) push("syncStale", "warn", { hours: Math.floor(since) });
    }
  }

  const j = s.daily;
  if (!isFailed(j)) {
    if (j.last === null) push("dailyNever", "info");
    else {
      if (j.last.outcome === "failed") push("dailyFailed", "bad");
      const since = hoursSince(j.last.started_at, at);
      if (since !== null && since > DAILY_STALE_HOURS) push("dailyStale", "warn", { hours: Math.floor(since) });
    }
  }

  const sc = s.scores;
  if (sc && !isFailed(sc)) {
    if (sc.no_run) push("scoresNoRun", "bad", { hours: sc.quiet_hours ?? 0 });
    for (const l of sc.leagues) {
      const league = l.league.toUpperCase();
      if (l.flags.includes("stale")) {
        if (l.stale_hours === null) push("scoresStaleNever", "bad", { league });
        else push("scoresStale", "bad", { league, hours: l.stale_hours });
      }
      if (l.flags.includes("overdue")) push("scoresOverdue", "warn", { league, count: l.overdue, hours: sc.limits.overdue });
    }
  }

  const w = s.watchdog;
  if (!isFailed(w)) {
    if (w.open) push("watchdogOpen", "bad", { probes: w.open.probes_failed });
    if (!w.enabled) push("watchdogOff", "info");
    else if (w.known) {
      const silent = minutesBetween(w.last_probe_at, at);
      if (silent !== null && silent > PROBE_STALE_MINUTES) push("watchdogSilent", "warn", { minutes: silent });
    }
  }

  const r = s.releases;
  if (!isFailed(r) && r.pending > 0) push("releasesWaiting", "info", { count: r.pending });

  const rank = { bad: 0, warn: 1, info: 2 } as const;
  return out.sort((x, y2) => rank[x.level] - rank[y2.level]);
}

/** The export's one-line verdict for the Backups table: never / problems / stale / ok. */
export function exportVerdict(b: Backup, at: string): "never" | "unknown" | "problems" | "stale" | "ok" {
  const e = b.export;
  if (e === null) return "never";
  if (isFailed(e)) return "unknown";
  if (e.failed > 0) return "problems";
  const since = hoursSince(b.last_ok_at, at);
  return since === null || since > EXPORT_STALE_HOURS ? "stale" : "ok";
}

export type Tone = "done" | "live" | "stale" | "";

/** The badge colour of the harvester's state: running is good, paused and idle are amber, stale and stopped are red. */
export function harvesterTone(state: Harvester["state"]): Tone {
  return state === "running" ? "done" : state === "paused" || state === "idle" || state === "never" ? "live" : "stale";
}

/** Minutes the database wants between two requests of one kind (migration 104). */
export const REQUEST_GAP_MINUTES: Record<RequestKind, number> = { snapshot: 2, harvest_pause: 1, harvest_resume: 1 };

/**
 * Why a request of this kind would be refused right now, from the requests the page holds: one is still waiting for the runner, or the last of
 * its kind ended too recently. Null when nothing says no (the database may still refuse: 20 an hour).
 */
export function requestBlock(requests: OpsRequest[], kind: RequestKind, now: number): "waiting" | "recent" | null {
  if (requests.some((r) => r.kind === kind && r.status === "queued")) return "waiting";
  const last = Math.max(0, ...requests.filter((r) => r.kind === kind).map((r) => ms(r.finished_at ?? r.requested_at) ?? 0));
  return last > 0 && now - last < REQUEST_GAP_MINUTES[kind] * 60_000 ? "recent" : null;
}

// ---------------------------------------------------------------------------------------------------- scores by league

/** Minutes the database wants between two scores requests for the same league (migration 150; 053 for every league). */
export const SCORE_REQUEST_GAP_MINUTES = 10;

/** The scores request that has not ended (queued for the runner, or running), or null. The database allows one at a time, whatever the league. */
export function openScoreRequest(requests: ScoreRequest[]): ScoreRequest | null {
  return requests.find((r) => r.status === "queued" || r.status === "running") ?? null;
}

/** The newest request that named this league (the requests arrive newest first), or null. */
export function lastScoreRequest(requests: ScoreRequest[], league: string): ScoreRequest | null {
  return requests.find((r) => r.league === league) ?? null;
}

/**
 * Why "Update now" for a league would be refused right now, from the requests the page holds: another request is open ("open"), or the last
 * request for the same league ended less than ten minutes ago ("recent"). Null when nothing says no (the database has the last word).
 */
export function scoreBlock(requests: ScoreRequest[], league: string, now: number): "open" | "recent" | null {
  if (openScoreRequest(requests)) return "open";
  const last = lastScoreRequest(requests, league);
  const t = last ? ms(last.finished_at ?? last.requested_at) : null;
  return t !== null && now - t < SCORE_REQUEST_GAP_MINUTES * 60_000 ? "recent" : null;
}

/** The badge colour of a league: red when it failed or is flagged stale, amber for a warning, a skip or games without a score, green when it is fine. */
export function leagueTone(l: ScoreLeague): Tone {
  if (l.flags.includes("stale") || l.outcome === "failed") return "stale";
  if (l.flags.includes("overdue") || l.outcome === "warning" || l.outcome === "skipped") return "live";
  return l.outcome === "ok" ? "done" : "";
}

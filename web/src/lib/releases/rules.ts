import { mark } from "../localTime.ts";

/** Pure helpers for the /admin/data page: no network, no server-only, so they can be reasoned about on their own. */

export const DRIFT_STALE_HOURS = 36;

export type SyncRow = { table_name: string; ds1_rows: number | null; prod_rows: number | null; state: "same" | "differs"; checked_at: string; detail: string | null };

export type FinishedRelease = { number: string; tables: string[]; status: string; finished_at: string | null };

export type DriftState = {
  /** Tables the latest comparison found different, and no release that touches them has finished since. */
  differs: SyncRow[];
  /** Tables a comparison found different, but a release that touches them finished after it: that result is out of date. */
  outdated: SyncRow[];
  /** The newest release that finished after the comparison of an outdated table. */
  newerRelease: string | null;
  lastChecked: string | null;
  stale: boolean;
};

/**
 * The red banner shows when a table differs as of a comparison no release has overtaken, when no check has been recorded, or
 * when the last one is older than 36 hours. A row that says "differs" but whose table a release changed afterwards is reported
 * as out of date, not as a mismatch. The runner writes the rows of a release's tables again right after it commits.
 */
export function driftState(sync: SyncRow[], releases: FinishedRelease[] = [], now: number = Date.now()): DriftState {
  const times = sync.map((s) => Date.parse(s.checked_at)).filter((t) => !Number.isNaN(t));
  const last = times.length ? Math.max(...times) : null;
  const later = (s: SyncRow) => releases.filter((r) => r.finished_at && r.tables.includes(s.table_name) && Date.parse(r.finished_at) > Date.parse(s.checked_at));
  const differing = sync.filter((s) => s.state === "differs");
  const outdated = differing.filter((s) => later(s).length > 0);
  const newest = outdated.flatMap(later).sort((a, b) => Date.parse(b.finished_at ?? "") - Date.parse(a.finished_at ?? ""))[0];
  return {
    differs: differing.filter((s) => !outdated.includes(s)),
    outdated,
    newerRelease: newest?.number ?? null,
    lastChecked: last === null ? null : new Date(last).toISOString(),
    stale: last === null || now - last > DRIFT_STALE_HOURS * 3600 * 1000,
  };
}

export function bytesLabel(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "–";
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v < 1024) return `${sign}${v} B`;
  if (v < 1024 * 1024) return `${sign}${(v / 1024).toFixed(0)} KB`;
  return `${sign}${(v / 1024 / 1024).toFixed(1)} MB`;
}

export function stamp(iso: string | null | undefined): string | null {
  return iso && !Number.isNaN(Date.parse(iso)) ? iso.slice(0, 16).replace("T", " ") : null;
}

/** True when the release is already where the admin wanted it, so a repeated tap counts as success. */
export function alreadyDecided(status: string, approve: boolean): boolean {
  return approve ? ["approved", "running", "done", "failed", "rolled_back"].includes(status) : status === "rejected";
}

export const AUTO_HOLD_MINUTES = 10;

/** The runner approves with names that start with "auto:", or "request:<admin>" for a scores update request (the site never can: the database refuses them as an actor). */
export function isAutoApproved(approvedBy: string | null | undefined): boolean {
  const v = (approvedBy ?? "").toLowerCase();
  return v.startsWith("auto:") || v.startsWith("request:");
}

/** When a waiting auto-eligible release approves itself: its hold counted from the time it was prepared. */
export function autoApproveAt(createdAt: string, minutes: number = AUTO_HOLD_MINUTES): string | null {
  const t = Date.parse(createdAt);
  return Number.isNaN(t) ? null : new Date(t + minutes * 60_000).toISOString();
}

export type AutoFilter = "all" | "auto" | "manual";

export function parseAutoFilter(value: string | string[] | undefined): AutoFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "auto" || v === "manual" ? v : "all";
}

/** True for releases that were approved by the runner, or are daily_scores releases (which can be). */
export function matchesAutoFilter(kind: string, approvedBy: string | null | undefined, filter: AutoFilter): boolean {
  const auto = kind === "daily_scores" || isAutoApproved(approvedBy);
  return filter === "all" || (filter === "auto" ? auto : !auto);
}

export const TABS = ["pending", "history", "drift", "settings"] as const;
export type Tab = (typeof TABS)[number];
export const TAB_COOKIE = "spxn-data-tab";

/** The tab to show: ?tab= first, then the one this viewer used last (cookie), then Pending. */
export function parseTab(param: string | string[] | undefined, remembered?: string | null): Tab {
  const v = Array.isArray(param) ? param[0] : param;
  const pick = (x: string | null | undefined): Tab | null => ((TABS as readonly string[]).includes(x ?? "") ? (x as Tab) : null);
  return pick(v) ?? pick(remembered) ?? "pending";
}

export const REQUEST_COOLDOWN_MINUTES = 10;

type RequestLike = { id: number; status: string; requested_at: string; finished_at: string | null; kind?: string; league?: string | null };

/**
 * Why a new request of this kind (scores or drift) cannot be made now, or null when it can: one open request at a time
 * whatever its kind (a live refresh is apart: it neither waits for nor blocks the others), then a cooldown after the last one of the same kind ends.
 */
export function requestBlock(requests: RequestLike[], now: number = Date.now(), cooldownMinutes: number = REQUEST_COOLDOWN_MINUTES, kind: string = "scores"): string | null {
  const open = requests.find((r) => (r.status === "queued" || r.status === "running") && (r.kind === "live") === (kind === "live"));
  if (open) return `Request #${open.id} is ${open.status}. Wait for it to finish.`;
  // the all-leagues request has its own cooldown: one for a single league (migration 150) does not count against it
  const last = Math.max(0, ...requests.filter((r) => (r.kind ?? "scores") === kind && (r.league ?? null) === null).map((r) => Date.parse(r.finished_at ?? r.requested_at)).filter((t) => !Number.isNaN(t)));
  const until = last + cooldownMinutes * 60_000;
  return last > 0 && until > now ? `The last request ended recently. You can ask again at ${mark(new Date(until).toISOString(), "clock")}.` : null;
}

/**
 * The counts of release_summary. `waiting`: pending releases that will not approve themselves (held ones and a proposed drift fix are
 * pending releases, so they are in it). `drift`: pending drift fixes, auto-approvable or not. `failed` (migration 106, absent before it):
 * releases that failed in the last two days and that no later release has made good.
 */
export type BarSummary = { waiting: number; drift: number; paused: boolean; failed?: number };

/** The short notices of the admin bar; empty means the bar is not shown at all. */
export function barMessages(s: BarSummary | null | undefined): string[] {
  if (!s) return [];
  const out: string[] = [];
  if (s.waiting > 0) out.push(s.waiting === 1 ? "1 release is waiting for approval" : `${s.waiting} releases are waiting for approval`);
  if (s.drift > 0) out.push("a drift fix is proposed");
  if ((s.failed ?? 0) > 0) out.push(s.failed === 1 ? "1 failed release needs a look" : `${s.failed} failed releases need a look`);
  if (s.paused) out.push("auto-approval is on Hold");
  return out;
}

/**
 * How many things wait for the admin, for "Data releases (N)" in the account menu. The same summary the bar reads, so no extra request:
 * the pending releases (a held one and a drift fix are pending releases, counted once in `waiting`; a drift fix that approves itself is
 * not waiting but is still counted through `drift`, never twice) plus the failed ones that need a look. Auto-approval on Hold is a state,
 * not an item, so it is not counted.
 */
export function waitingCount(s: BarSummary | null | undefined): number {
  if (!s) return 0;
  const count = (n: number | undefined) => (Number.isFinite(n) && (n as number) > 0 ? Math.floor(n as number) : 0);
  return Math.max(count(s.waiting), count(s.drift)) + count(s.failed);
}

export type HealthEvent = {
  failing_since: string;
  detected_at: string;
  probes_failed: number;
  reload_at: string | null;
  restart_at: string | null;
  recovered_at: string | null;
  last_error: string | null;
};

export type HealthLine = { kind: "none" | "down" | "past"; text: string };

/**
 * The "API health" line of /admin/data (its times are marks: draw it with <Stamped>), from the runner watchdog's incident list (newest first). "down" is an incident the watchdog has
 * not seen end; "past" is the latest one that has. The watchdog records an incident only after 5 failed probes in a row, so a blip leaves no row.
 */
export function healthLine(events: HealthEvent[]): HealthLine {
  const e = events[0];
  if (!e) return { kind: "none", text: "No outage of the public API recorded." };
  const actions = [e.reload_at ? `schema reload ${mark(e.reload_at, "clock")}` : null, e.restart_at ? `project restart ${mark(e.restart_at, "clock")}` : null].filter(Boolean);
  const did = actions.length ? ` The watchdog did: ${actions.join(", ")}.` : " The watchdog has not acted yet.";
  if (!e.recovered_at) return { kind: "down", text: `The public API was failing from ${mark(e.failing_since)} and has not been seen working since.${did}` };
  const minutes = Math.max(0, Math.round((Date.parse(e.recovered_at) - Date.parse(e.failing_since)) / 60000));
  const rest = events.length > 1 ? ` ${events.length} outages recorded in all.` : "";
  return { kind: "past", text: `Last outage ${mark(e.failing_since)} to ${mark(e.recovered_at, "clock")} (${minutes} min).${did}${rest}` };
}

/**
 * The tables that publish to Turso, not production (`TABLES` in scripts/release/turso.py; scripts/releases.test.ts checks this list
 * against that file). A release goes to one place only, so a release whose tables are all in this list is a Turso release.
 */
export const TURSO_TABLES: readonly string[] = [
  "core.external_id",
  "meta.verification",
  "meta.data_issue",
  "core.batted_ball_player",
  "core.betting_line",
  "api.person_admin",
  "api.totals",
  "api.quality",
  "api.provenance",
];

export type ReleaseTarget = "ds1" | "turso" | "production";

/**
 * Where a release writes. A DS1 step is DS1. The preview's target wins when present. The dashboard strips the preview from the
 * approved and recent lists, so without one the tables decide: all Turso tables means Turso, anything else production.
 */
export function releaseTarget(r: { kind: string; tables: string[]; preview?: { target?: string } | null }): ReleaseTarget {
  if (r.kind === "ds1_step") return "ds1";
  const said = r.preview?.target;
  if (said === "turso" || said === "production") return said;
  return r.tables.length > 0 && r.tables.every((t) => TURSO_TABLES.includes(t)) ? "turso" : "production";
}

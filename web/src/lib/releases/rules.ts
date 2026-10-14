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

type RequestLike = { id: number; status: string; requested_at: string; finished_at: string | null; kind?: string };

/**
 * Why a new request of this kind (scores or drift) cannot be made now, or null when it can: one open request at a time
 * whatever its kind, then a cooldown after the last one of the same kind ends.
 */
export function requestBlock(requests: RequestLike[], now: number = Date.now(), cooldownMinutes: number = REQUEST_COOLDOWN_MINUTES, kind: string = "scores"): string | null {
  const open = requests.find((r) => r.status === "queued" || r.status === "running");
  if (open) return `Request #${open.id} is ${open.status}. Wait for it to finish.`;
  const last = Math.max(0, ...requests.filter((r) => (r.kind ?? "scores") === kind).map((r) => Date.parse(r.finished_at ?? r.requested_at)).filter((t) => !Number.isNaN(t)));
  const until = last + cooldownMinutes * 60_000;
  return last > 0 && until > now ? `The last request ended recently. You can ask again at ${stamp(new Date(until).toISOString())?.slice(11)} UTC.` : null;
}

export type BarSummary = { waiting: number; drift: number; paused: boolean };

/** The short notices of the admin bar; empty means the bar is not shown at all. */
export function barMessages(s: BarSummary | null | undefined): string[] {
  if (!s) return [];
  const out: string[] = [];
  if (s.waiting > 0) out.push(s.waiting === 1 ? "1 release is waiting for approval" : `${s.waiting} releases are waiting for approval`);
  if (s.drift > 0) out.push("a drift fix is proposed");
  if (s.paused) out.push("auto-approval is on Hold");
  return out;
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

const clock = (iso: string | null | undefined) => (stamp(iso) ?? "?").slice(11) || "?";

/**
 * The "API health" line of /admin/data, from the runner watchdog's incident list (newest first). "down" is an incident the watchdog has
 * not seen end; "past" is the latest one that has. The watchdog records an incident only after 5 failed probes in a row, so a blip leaves no row.
 */
export function healthLine(events: HealthEvent[]): HealthLine {
  const e = events[0];
  if (!e) return { kind: "none", text: "No outage of the public API recorded." };
  const actions = [e.reload_at ? `schema reload ${clock(e.reload_at)}` : null, e.restart_at ? `project restart ${clock(e.restart_at)}` : null].filter(Boolean);
  const did = actions.length ? ` The watchdog did: ${actions.join(", ")} UTC.` : " The watchdog has not acted yet.";
  if (!e.recovered_at) return { kind: "down", text: `The public API was failing from ${stamp(e.failing_since)} UTC and has not been seen working since.${did}` };
  const minutes = Math.max(0, Math.round((Date.parse(e.recovered_at) - Date.parse(e.failing_since)) / 60000));
  const rest = events.length > 1 ? ` ${events.length} outages recorded in all.` : "";
  return { kind: "past", text: `Last outage ${stamp(e.failing_since)} to ${clock(e.recovered_at)} UTC (${minutes} min).${did}${rest}` };
}

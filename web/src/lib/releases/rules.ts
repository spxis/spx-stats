/** Pure helpers for the /admin/data page: no network, no server-only, so they can be reasoned about on their own. */

export const DRIFT_STALE_HOURS = 36;

export type SyncRow = { table_name: string; ds1_rows: number | null; prod_rows: number | null; state: "same" | "differs"; checked_at: string; detail: string | null };

export type DriftState = { differs: SyncRow[]; lastChecked: string | null; stale: boolean };

/** The red banner shows when any table differs, when no check has been recorded, or when the last one is older than 36 hours. */
export function driftState(sync: SyncRow[], now: number = Date.now()): DriftState {
  const times = sync.map((s) => Date.parse(s.checked_at)).filter((t) => !Number.isNaN(t));
  const last = times.length ? Math.max(...times) : null;
  return {
    differs: sync.filter((s) => s.state === "differs"),
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

/** The runner approves with names that start with "auto:" (the site never can: the database refuses them as an actor). */
export function isAutoApproved(approvedBy: string | null | undefined): boolean {
  return (approvedBy ?? "").toLowerCase().startsWith("auto:");
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

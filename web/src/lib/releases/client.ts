import "server-only";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { queuedAtBuild } from "@/lib/api/buildShare";
import { API_KEY, REST_URL, RETRY_REVALIDATE, REVALIDATE } from "@/lib/api/config";
import type { HealthEvent } from "./rules";

/**
 * The data releases, read and approved through two functions in the production database's `api` schema
 * (migration 045): api.release_dashboard(p_secret) and api.approve_release(p_secret, p_id, p_approve, p_actor).
 *
 *   RELEASE_APPROVAL_SECRET   a long random string (32 characters or more), set on the server only. The database
 *                             stores only its sha256. Without it this page shows "not set up" and cannot approve.
 *
 * The browser never sees the secret: it is read in server code and sent from the server to the database. The public
 * key the rest of the site uses cannot read or write the release tables; it can only call these two functions, and
 * both refuse a wrong secret. The only write approve_release can make is pending -> approved or rejected.
 * Migration 047 adds three more narrow functions: hold_release (an auto-approvable release goes back to pending),
 * pause_auto_approvals and resume_auto_approvals. The site never approves automatically; the runner does.
 * Migration 053 adds request_score_update (queues one request row, nothing else) and release_summary (three counts for the admin bar).
 */
export class ReleaseError extends Error {
  name = "ReleaseError";
}

const TIMEOUT_MS = 10_000;

export function secret(): string {
  const value = (process.env.RELEASE_APPROVAL_SECRET ?? "").trim();
  if (value.length < 32) throw new ReleaseError("Not set up: RELEASE_APPROVAL_SECRET is missing or shorter than 32 characters.");
  return value;
}

export async function rpc(fn: string, body: Record<string, unknown>, options: { noStore?: boolean } = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${REST_URL}rpc/${fn}`, {
      method: "POST",
      headers: { apikey: API_KEY, "content-type": "application/json", "content-profile": "api", accept: "application/json" },
      body: JSON.stringify(body),
      ...(options.noStore === false ? {} : { cache: "no-store" as const }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ReleaseError("The database did not answer.");
  }
  if (!res.ok) {
    if (res.status === 404) throw new ReleaseError("Production does not have the release functions yet (migration 045).");
    throw new ReleaseError(res.status === 400 || res.status === 403 ? "The database refused the request." : `The database answered ${res.status}.`);
  }
  return res.json();
}

const previewTable = z.object({
  ds1_rows: z.number().nullable(), prod_rows: z.number().nullable(),
  add: z.number(), change: z.number(), remove: z.number(), bytes_delta: z.number(),
  blockers: z.array(z.string()).default([]), warnings: z.array(z.string()).default([]),
}).passthrough();

const preview = z.object({
  tables: z.record(z.string(), previewTable).default({}),
  blockers: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  totals: z.object({ add: z.number().optional(), change: z.number().optional(), remove: z.number().optional(), bytes_delta: z.number().optional() }).partial().default({}),
  file: z.string().optional(),
  before: z.record(z.string(), z.number()).nullish(),
  after: z.record(z.string(), z.number()).nullish(),
  auto: z.object({
    eligible: z.boolean(), reasons: z.array(z.string()).default([]), games: z.number().optional(), hold_minutes: z.number().optional(),
  }).nullish(),
}).passthrough();

const release = z.object({
  id: z.number(),
  number: z.string(),
  kind: z.enum(["publish", "ds1_step", "rollback", "daily_scores"]),
  title: z.string(),
  notes: z.string().nullable(),
  ticket: z.string().nullable(),
  tables: z.array(z.string()),
  status: z.string(),
  preview: preview.nullish(),
  result: z.object({ totals: z.object({ add: z.number(), change: z.number(), remove: z.number() }).partial().optional() }).passthrough().nullish(),
  created_by: z.string(),
  created_at: z.string(),
  approved_by: z.string().nullable(),
  approved_at: z.string().nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  error: z.string().nullable(),
  held_by: z.string().nullish(),
  held_at: z.string().nullish(),
}).passthrough();

const scoreRequest = z.object({
  id: z.number(),
  requested_by: z.string(),
  requested_at: z.string(),
  status: z.enum(["queued", "running", "done", "failed", "nothing"]),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  summary: z.string().nullable(),
  release_number: z.string().nullable(),
  release_status: z.string().nullish(),
  kind: z.enum(["scores", "drift"]).default("scores"),
});

const dashboard = z.object({
  pending: z.array(release),
  approved: z.array(release),
  recent: z.array(release),
  sync: z.array(z.object({
    table_name: z.string(), ds1_rows: z.number().nullable(), prod_rows: z.number().nullable(),
    state: z.enum(["same", "differs"]), checked_at: z.string(), detail: z.string().nullable(),
  })),
  space: z.array(z.object({ table: z.string(), bytes: z.number() })),
  database_bytes: z.number(),
  requests: z.array(scoreRequest).default([]),
  request_cooldown_minutes: z.number().default(10),
  server_now: z.string().optional(),
  auto: z.object({
    paused: z.boolean(), paused_at: z.string().nullable(), paused_by: z.string().nullable(), reason: z.string().nullable(),
    resumed_at: z.string().nullable(), resumed_by: z.string().nullable(),
  }).nullish(),
});

export type Release = z.infer<typeof release>;
export type ScoreRequest = z.infer<typeof scoreRequest>;
export type Dashboard = z.infer<typeof dashboard>;

export async function releaseDashboard(): Promise<Dashboard> {
  const parsed = dashboard.safeParse(await rpc("release_dashboard", { p_secret: secret() }));
  if (!parsed.success) throw new ReleaseError("The release data did not have the expected shape.");
  return parsed.data;
}

/** Approve or reject one waiting release. The actor is the signed-in admin's verified email. Throws when the release is not waiting. */
export async function decideRelease(id: number, approve: boolean, actor: string): Promise<void> {
  await rpc("approve_release", { p_secret: secret(), p_id: id, p_approve: approve, p_actor: actor });
}

/** Put an automatically approvable release back to pending for John (migration 047). Throws when it cannot be held now. */
export async function holdRelease(id: number, actor: string): Promise<void> {
  await rpc("hold_release", { p_secret: secret(), p_id: id, p_actor: actor });
}

/** Pause every automatic approval. The reason is shown in the banner. */
export async function pauseAutoApprovals(actor: string, reason: string): Promise<void> {
  await rpc("pause_auto_approvals", { p_secret: secret(), p_actor: actor, p_reason: reason });
}

/** Clear the pause; the runner then approves the eligible queue, re-checking each release. */
export async function resumeAutoApprovals(actor: string): Promise<void> {
  await rpc("resume_auto_approvals", { p_secret: secret(), p_actor: actor });
}

/** Queue one scores update request (migration 053). Throws when one is open already or the last one ended less than about 10 minutes ago. */
export async function requestScoreUpdate(actor: string): Promise<void> {
  await rpc("request_score_update", { p_secret: secret(), p_actor: actor });
}

/** Queue one drift check ("Check now"): compare every table again. Same rules as the scores request: one open request, about 10 minutes apart. */
export async function requestDriftCheck(actor: string): Promise<void> {
  await rpc("request_drift_check", { p_secret: secret(), p_actor: actor });
}

const summary = z.object({ waiting: z.number(), drift: z.number(), paused: z.boolean() });
export type AdminSummary = z.infer<typeof summary>;

const cachedSummary = unstable_cache(
  async () => {
    const parsed = summary.safeParse(await rpc("release_summary", { p_secret: secret() }, { noStore: false }));
    if (!parsed.success) throw new ReleaseError("The release summary did not have the expected shape.");
    return parsed.data;
  },
  ["admin-bar-summary"],
  { revalidate: 60, tags: ["admin-bar"] },
);

/** Three small counts for the admin bar, kept for a minute and refreshed after an admin's own action. Null when it cannot be read. Call it only for a signed-in admin. */
export async function adminBarSummary(): Promise<AdminSummary | null> {
  try {
    return await cachedSummary();
  } catch {
    return null;
  }
}

const healthEvent = z.object({
  failing_since: z.string(),
  detected_at: z.string(),
  probes_failed: z.number(),
  reload_at: z.string().nullable(),
  restart_at: z.string().nullable(),
  recovered_at: z.string().nullable(),
  last_error: z.string().nullable(),
});

/**
 * The runner watchdog's list of outages of the public API, newest first (migration 090, api.api_health). Null when the function is
 * missing or the call fails: /admin/data then simply leaves the "API health" line out.
 */
export async function apiHealth(): Promise<HealthEvent[] | null> {
  try {
    const parsed = z.object({ events: z.array(healthEvent) }).safeParse(await rpc("api_health", { p_secret: secret() }));
    return parsed.success ? parsed.data.events : null;
  } catch {
    return null;
  }
}

/** The number and current status of one release, or null when the dashboard does not list it. */
export async function releaseStatus(id: number): Promise<{ number: string; status: string } | null> {
  const data = await releaseDashboard();
  const found = [...data.pending, ...data.approved, ...data.recent].find((r) => r.id === id);
  return found ? { number: found.number, status: found.status } : null;
}

const versionRow = z.array(z.object({ number: z.string().regex(/^\d{4}\.\d{2}\.\d{2}-\d+$/) }));

/**
 * The newest finished release that changed production data, for the footer. Null when the view is missing or the call fails.
 * Kept for a day like the pages around it (every page carries this footer, so a shorter time would make every kept page
 * regenerate that often); a release refreshes it at once through the "data-version" tag (POST /api/revalidate).
 */
export async function latestDataVersion(): Promise<string | null> {
  // A read that fails is tried once more and that try is kept briefly, so a footer drawn while the database struggles is replaced soon
  // (a page lives no longer than its shortest read) instead of going without the version for a day.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Sent once per `next build`, not once per page-drawing worker (api/buildShare.ts).
      const res = await queuedAtBuild("data_version", () =>
        fetch(`${REST_URL}data_version?select=number`, {
          headers: { apikey: API_KEY, "accept-profile": "api" },
          next: { revalidate: attempt ? RETRY_REVALIDATE : REVALIDATE, tags: ["data-version"] },
          signal: AbortSignal.timeout(3000),
        }),
      );
      if (!res.ok) continue;
      const parsed = versionRow.safeParse(await res.json());
      return parsed.success ? (parsed.data[0]?.number ?? null) : null;
    } catch {
      /* try again, then go without */
    }
  }
  return null;
}

import "server-only";
import { ReleaseError, rpc, secret } from "@/lib/releases/client";
import { dashboard, type Dashboard, type RequestKind } from "./schema";

/**
 * The DS1 side of the project, read from production (migration 104): api.ops_dashboard(p_secret) answers the newest snapshot the runner
 * pushed, a day of small history points and the last requests; api.request_ops(p_secret, p_actor, p_kind) adds ONE queued request row
 * (snapshot now, pause or resume the harvester) that the runner acts on within a minute. Same secret and same lock-down as /admin/data:
 * RELEASE_APPROVAL_SECRET, server only; the public key can call the two functions and nothing else.
 */
export class OpsError extends ReleaseError {
  name = "OpsError";
}

async function call(fn: string, body: Record<string, unknown>): Promise<unknown> {
  try {
    return await rpc(fn, { p_secret: secret(), ...body });
  } catch (error) {
    if (error instanceof ReleaseError && /migration 045/.test(error.message)) throw new OpsError("Production does not have the ops functions yet (migration 104).");
    throw error;
  }
}

export async function opsDashboard(): Promise<Dashboard> {
  const parsed = dashboard.safeParse(await call("ops_dashboard", {}));
  if (!parsed.success) throw new OpsError("The ops data did not have the expected shape.");
  return parsed.data;
}

/**
 * "Update now" on one league (migration 150, api.request_league_update): one queued scores request that names the league. The runner runs the
 * daily scores job for that league alone, under the same lock and the same auto-approval policy as an all-leagues request. Throws when the
 * database refuses it (one open request at a time, about ten minutes between requests for one league, or migration 150 is not on production).
 */
export async function requestLeagueUpdate(actor: string, league: string): Promise<void> {
  try {
    await rpc("request_league_update", { p_secret: secret(), p_actor: actor, p_league: league });
  } catch (error) {
    if (error instanceof ReleaseError && /migration 045/.test(error.message)) throw new OpsError("Production does not have the per-league update yet (migration 150).");
    throw error;
  }
}

/** Queue one request for the runner. Throws when the database refuses it (one waiting per kind, a minute or two between, 20 an hour). */
export async function requestOps(actor: string, kind: RequestKind): Promise<void> {
  await call("request_ops", { p_actor: actor, p_kind: kind });
}

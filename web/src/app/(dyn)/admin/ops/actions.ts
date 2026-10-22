"use server";

import { cookies, headers } from "next/headers";
import { sameOrigin } from "@/lib/auth/origin";
import { requireAdminWrite } from "@/lib/auth/user";
import { isConfirmed } from "@/lib/confirm";
import { speaker } from "@/lib/i18n/i18n";
import { effectiveLocale, LOCALE_COOKIE_NAME } from "@/lib/locale";
import { opsDashboard, requestLeagueUpdate, requestOps } from "@/lib/ops/client";
import { requestBlock, scoreBlock } from "@/lib/ops/rules";
import { REQUEST_KINDS, SCORE_LEAGUES, type RequestKind } from "@/lib/ops/schema";

export type OpsState = { ok: boolean; message: string } | null;

const isKind = (v: unknown): v is RequestKind => typeof v === "string" && (REQUEST_KINDS as readonly string[]).includes(v);

/**
 * Snapshot now, Pause harvester or Resume harvester: one queued request for the runner next to DS1 (it acts within a minute). Admin and
 * Origin are checked on the server and the confirmation is required, as for every admin action. The database function only adds one
 * row (one waiting per kind, a minute or two between, 20 an hour); when it refuses, the reason is worked out again from the current
 * requests so the message is specific. Answers in the reader's language.
 */
export async function opsRequest(_previous: OpsState, form: FormData): Promise<OpsState> {
  const user = await requireAdminWrite();
  // A server action cannot use currentSpeaker() (root params exist only in a route): read the language from the cookie and Accept-Language directly.
  const incoming = await headers();
  const { say } = speaker(effectiveLocale((await cookies()).get(LOCALE_COOKIE_NAME)?.value ?? null, incoming.get("accept-language")));
  if (!sameOrigin(incoming)) return { ok: false, message: say("ops.msg.origin") };
  if (!isConfirmed(form)) return { ok: false, message: say("ops.msg.notConfirmed") };
  const kind = form.get("kind");
  if (!isKind(kind)) return { ok: false, message: say("ops.msg.invalid") };
  try {
    await requestOps(user.email, kind);
  } catch {
    try {
      const data = await opsDashboard();
      const why = requestBlock(data.requests, kind, Date.parse(data.server_now));
      if (why === "waiting") return { ok: false, message: say("ops.msg.waiting") };
      if (why === "recent") return { ok: false, message: say("ops.msg.recent") };
    } catch {
      return { ok: false, message: say("ops.msg.unanswered") };
    }
    return { ok: false, message: say("ops.msg.refused") };
  }
  return { ok: true, message: say("ops.msg.requested") };
}

const isLeague = (v: unknown): v is string => typeof v === "string" && (SCORE_LEAGUES as readonly string[]).includes(v);

/**
 * "Update now" on one league's row: one scores request that names the league, for the runner (it runs the daily scores job for that league
 * alone, under the shared lock, and approves the release it prepares only if the automatic checks pass and the Hold switch is off). Same
 * checks as every admin action: admin, Origin, confirmation; the league must be one the job loads. The database function adds one row (one
 * open request at a time, about ten minutes between requests for one league); when it refuses, the reason is worked out again from the
 * current requests so the message is specific. Answers in the reader's language.
 */
export async function scoresLeagueRequest(_previous: OpsState, form: FormData): Promise<OpsState> {
  const user = await requireAdminWrite();
  const incoming = await headers();
  const { say } = speaker(effectiveLocale((await cookies()).get(LOCALE_COOKIE_NAME)?.value ?? null, incoming.get("accept-language")));
  if (!sameOrigin(incoming)) return { ok: false, message: say("ops.msg.origin") };
  if (!isConfirmed(form)) return { ok: false, message: say("ops.msg.notConfirmed") };
  const league = form.get("league");
  if (!isLeague(league)) return { ok: false, message: say("ops.msg.invalid") };
  try {
    await requestLeagueUpdate(user.email, league);
  } catch (error) {
    if (error instanceof Error && /migration 150/.test(error.message)) return { ok: false, message: say("ops.msg.league.noMigration") };
    try {
      const data = await opsDashboard();
      const why = scoreBlock(data.score_requests, league, Date.parse(data.server_now));
      if (why === "open") return { ok: false, message: say("ops.msg.league.open") };
      if (why === "recent") return { ok: false, message: say("ops.msg.league.recent") };
    } catch {
      return { ok: false, message: say("ops.msg.unanswered") };
    }
    return { ok: false, message: say("ops.msg.refused") };
  }
  return { ok: true, message: say("ops.msg.league.requested", { league: league.toUpperCase() }) };
}

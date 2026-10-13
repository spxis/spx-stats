"use server";

import { headers } from "next/headers";
import { sameOrigin } from "@/lib/auth/origin";
import { requireAdmin } from "@/lib/auth/user";
import { decideRelease, holdRelease, pauseAutoApprovals, releaseStatus, resumeAutoApprovals } from "@/lib/releases/client";
import { alreadyDecided } from "@/lib/releases/rules";

export type DecideState = { ok: boolean; message: string } | null;

const success = (number: string, approve: boolean): DecideState => ({
  ok: true,
  message: approve ? `Approved ${number}. The runner applies it within a minute.` : `Rejected ${number}.`,
});

/**
 * Approve or reject one waiting release. Admin is checked on the server (anyone else gets a 404), a request whose
 * Origin is not this site is refused, and the id and the decision are validated again. The only thing this can do
 * is move a pending release to approved or rejected, through the database's narrow function.
 * Repeating a decision that already took effect (a double tap, a retry after a timeout) is reported as success.
 */
export async function decide(_previous: DecideState, form: FormData): Promise<DecideState> {
  const user = await requireAdmin();
  if (!sameOrigin(await headers())) return { ok: false, message: "Request refused: it did not come from this site." };

  const rawId = form.get("id");
  const decision = form.get("decision");
  const id = typeof rawId === "string" && /^[0-9]{1,15}$/.test(rawId) ? Number(rawId) : 0;
  if (id < 1 || (decision !== "approve" && decision !== "reject")) return { ok: false, message: "That request was not valid." };
  const approve = decision === "approve";

  let refused = false;
  try {
    await decideRelease(id, approve, user.email);
  } catch {
    refused = true;
  }

  let current: { number: string; status: string } | null = null;
  try {
    current = await releaseStatus(id);
  } catch {
    if (refused) return { ok: false, message: "The database did not answer, so I cannot tell if it worked. Reload the page to see the release's status." };
  }

  if (!refused) return success(current?.number ?? `release ${id}`, approve);
  if (!current) return { ok: false, message: `Release ${id} was not found.` };
  if (alreadyDecided(current.status, approve)) return success(current.number, approve);
  if (current.status === "pending") return { ok: false, message: `${current.number} was not ${approve ? "approved" : "rejected"}. It is still waiting and may have blockers.` };
  return { ok: false, message: `${current.number} is ${current.status}, so it cannot be ${approve ? "approved" : "rejected"} now.` };
}

/**
 * Put a waiting auto-approvable release back for John. Same checks as decide: admin, Origin, a valid id. The database
 * only allows it for an eligible daily_scores release that has not started, and a repeat is reported as success.
 */
export async function hold(_previous: DecideState, form: FormData): Promise<DecideState> {
  const user = await requireAdmin();
  if (!sameOrigin(await headers())) return { ok: false, message: "Request refused: it did not come from this site." };
  const rawId = form.get("id");
  const id = typeof rawId === "string" && /^[0-9]{1,15}$/.test(rawId) ? Number(rawId) : 0;
  if (id < 1) return { ok: false, message: "That request was not valid." };

  let refused = false;
  try {
    await holdRelease(id, user.email);
  } catch {
    refused = true;
  }
  let current: { number: string; status: string } | null = null;
  try {
    current = await releaseStatus(id);
  } catch {
    if (refused) return { ok: false, message: "The database did not answer, so I cannot tell if it worked. Reload the page to see the release's status." };
  }
  const number = current?.number ?? `release ${id}`;
  if (!refused) return { ok: true, message: `Held ${number}. It stays pending until you decide.` };
  return { ok: false, message: `${number} could not be held${current ? ` (it is ${current.status}, or it was held already)` : ""}.` };
}

/** Pause or resume every automatic approval. Admin and Origin are checked; a pause needs a short reason. */
export async function setAutoPause(_previous: DecideState, form: FormData): Promise<DecideState> {
  const user = await requireAdmin();
  if (!sameOrigin(await headers())) return { ok: false, message: "Request refused: it did not come from this site." };
  const decision = form.get("decision");
  try {
    if (decision === "pause") {
      const reason = String(form.get("reason") ?? "").trim();
      if (reason.length < 1 || reason.length > 300) return { ok: false, message: "Give a reason of 1 to 300 characters." };
      await pauseAutoApprovals(user.email, reason);
      return { ok: true, message: "Automatic approvals are paused. Releases are still prepared but wait for you. Reload to see the banner." };
    }
    if (decision === "resume") {
      await resumeAutoApprovals(user.email);
      return { ok: true, message: "Automatic approvals resumed. The runner re-checks and approves the eligible queue within a minute. Reload to see the banner." };
    }
  } catch {
    return { ok: false, message: "The database refused the request. Reload the page and try again." };
  }
  return { ok: false, message: "That request was not valid." };
}

"use server";

import { headers } from "next/headers";
import { sameOrigin } from "@/lib/auth/origin";
import { requireAdmin } from "@/lib/auth/user";
import { decideRelease, releaseStatus } from "@/lib/releases/client";
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

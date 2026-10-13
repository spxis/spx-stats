"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sameOrigin } from "@/lib/auth/origin";
import { requireAdmin } from "@/lib/auth/user";
import { decideRelease } from "@/lib/releases/client";

/**
 * Approve or reject one waiting release. Admin is checked on the server (anyone else gets a 404), a request whose
 * Origin is not this site is refused, and the id and the decision are validated again. The only thing this can do
 * is move a pending release to approved or rejected, through the database's narrow function.
 */
export async function decide(form: FormData): Promise<void> {
  const user = await requireAdmin();
  if (!sameOrigin(await headers())) redirect("/admin/data?result=refused");

  const rawId = form.get("id");
  const decision = form.get("decision");
  const id = typeof rawId === "string" && /^[0-9]{1,15}$/.test(rawId) ? Number(rawId) : 0;
  if (id < 1 || (decision !== "approve" && decision !== "reject")) redirect("/admin/data?result=invalid");

  let result = decision === "approve" ? "approved" : "rejected";
  try {
    await decideRelease(id, decision === "approve", user.email);
  } catch {
    result = "error";
  }
  revalidatePath("/admin/data");
  redirect(`/admin/data?result=${result}`);
}

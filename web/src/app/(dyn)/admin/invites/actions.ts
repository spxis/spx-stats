"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sameOrigin } from "@/lib/auth/origin";
import { requireAdminWrite } from "@/lib/auth/user";
import { normalizeEmail, validEmail } from "@/lib/invite/rules";
import { addInvite, removeInvite } from "@/lib/invite/store";

const BACK = "/admin/invites";
const text = (form: FormData, name: string): string => {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
};

/** What the page says after an action: a short code (and the address), never free text from the request. */
const done = (code: "added" | "removed" | "bad" | "failed", email = ""): never =>
  redirect(`${BACK}?done=${code}${email ? `&email=${encodeURIComponent(email)}` : ""}`);

/**
 * Invites one address (field `email`, optional `note`). Admin and Origin are checked on the server (anyone else gets a 404 or nothing); the dev
 * sign-in's fake admin is refused by requireAdminWrite. The list lives in Turso (lib/invite/store.ts); a change shows within a minute on every instance.
 */
export async function inviteAddress(form: FormData): Promise<void> {
  const user = await requireAdminWrite();
  if (!sameOrigin(await headers())) return;
  const email = normalizeEmail(text(form, "email"));
  if (!validEmail(email)) return done("bad");
  const note = text(form, "note").replace(/[\r\n]+/g, " ").trim().slice(0, 200) || null;
  const result = await addInvite(email, user.email, note);
  return done(result.ok ? "added" : "failed", email);
}

/** Takes one address off the list (field `email`). Same checks as inviteAddress. Someone signed in keeps the page until the gate's copy of the list refreshes (a minute). */
export async function removeAddress(form: FormData): Promise<void> {
  await requireAdminWrite();
  if (!sameOrigin(await headers())) return;
  const email = normalizeEmail(text(form, "email"));
  if (!validEmail(email)) return done("bad");
  const result = await removeInvite(email);
  return done(result.ok ? "removed" : "failed", email);
}

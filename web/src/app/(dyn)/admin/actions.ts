"use server";

import { headers } from "next/headers";
import { sameOrigin } from "@/lib/auth/origin";
import { requireAdminWrite } from "@/lib/auth/user";
import { dismiss } from "@/lib/runlog/client";

/**
 * Dismiss one alert of the banner (hidden field `id`) or all of them (no id). Admin and Origin are checked on the server; the dev sign-in's
 * fake admin is refused (requireAdminWrite). The page is drawn again by Next after the action, so the banner and the count update at once.
 */
export async function dismissAlerts(form: FormData): Promise<void> {
  const user = await requireAdminWrite();
  if (!sameOrigin(await headers())) return;
  const raw = form.get("id");
  const id = raw === null || raw === "" ? null : Number.parseInt(String(raw), 10);
  if (id !== null && (!Number.isInteger(id) || id <= 0)) return;
  try {
    await dismiss(id, user.email);
  } catch {
    /* no token to write with, or Turso did not answer: the alerts stay, which the banner shows */
  }
}

import "server-only";
import { adminBarSummary } from "@/lib/releases/client";
import { barMessages } from "@/lib/releases/rules";
import { currentUser, type SessionUser } from "./user";

/** The signed-in reader and, for an admin, the line the admin bar shows (null when there is nothing to say). */
export interface SessionAccount { user: SessionUser | null; bar: string | null }

/** Who is signed in and what the admin bar says. The release summary is read only for an admin. */
export async function currentAccount(): Promise<SessionAccount> {
  const user = await currentUser();
  if (!user?.admin) return { user, bar: null };
  const messages = barMessages(await adminBarSummary());
  if (messages.length === 0) return { user, bar: null };
  const text = messages.join(" · ");
  return { user, bar: `${text.charAt(0).toUpperCase()}${text.slice(1)}. Open data releases` };
}

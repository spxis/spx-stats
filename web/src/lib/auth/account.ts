import "server-only";
import { adminBarSummary } from "@/lib/releases/client";
import { barMessages, waitingCount } from "@/lib/releases/rules";
import { currentUser, type SessionUser } from "./user";

/**
 * The signed-in reader and, for an admin, the line the admin bar shows (null when there is nothing to say) and how many things wait
 * for them ("Data releases (N)" in the account menu), both from the one cached admin summary.
 */
export interface SessionAccount { user: SessionUser | null; bar: string | null; waiting: number }

/** Who is signed in and what the admin bar says. The release summary is read only for an admin. */
export async function currentAccount(): Promise<SessionAccount> {
  const user = await currentUser();
  if (!user?.admin) return { user, bar: null, waiting: 0 };
  const summary = await adminBarSummary();
  const messages = barMessages(summary);
  const waiting = waitingCount(summary);
  if (messages.length === 0) return { user, bar: null, waiting };
  const text = messages.join(" · ");
  return { user, bar: `${text.charAt(0).toUpperCase()}${text.slice(1)}. Open data releases`, waiting };
}

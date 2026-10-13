import Link from "next/link";
import { currentUser } from "@/lib/auth/user";
import { adminBarSummary } from "@/lib/releases/client";
import { barMessages } from "@/lib/releases/rules";

/**
 * A slim notice above the header for signed-in admins only, when a release waits for approval, a drift fix is proposed or
 * auto-approval is on Hold. Nothing at all for anyone else (the summary is not even read), and nothing when there is nothing to say.
 * The counts are kept for a minute and refreshed after an admin's own action; there is no polling. English only.
 */
export async function AdminBar() {
  const user = await currentUser();
  if (!user?.admin) return null;
  const messages = barMessages(await adminBarSummary());
  if (messages.length === 0) return null;
  const text = messages.join(" · ");
  return (
    <div className="adminbar" role="status">
      <Link href="/admin/data">{text.charAt(0).toUpperCase() + text.slice(1)}. Open data releases</Link>
    </div>
  );
}

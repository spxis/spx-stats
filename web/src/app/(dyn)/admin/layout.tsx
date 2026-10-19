import { currentUser } from "@/lib/auth/user";
import { adminBarSummary } from "@/lib/releases/client";
import { waitingCount } from "@/lib/releases/rules";
import { alertView } from "@/lib/runlog/client";
import { AdminTabs } from "./AdminTabs";
import { AlertBanner } from "./AlertBanner";

/**
 * Around every admin page, the one admin shell: the tab bar (sections and their tabs) and the alert banner (job errors, stale scores), both
 * above the page, for an admin. Drawn per request like the pages; the counts come from the same cached summaries the account menu reads.
 * Anyone else gets the page's own 404 and no shell.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user?.admin) return children;
  const [summary, alerts] = await Promise.all([adminBarSummary(), alertView()]);
  const counts = {
    pending: Math.max(0, summary?.waiting ?? 0),
    drift: Math.max(0, summary?.drift ?? 0),
    alerts: alerts.open,
    total: waitingCount(summary) + alerts.open,
  };
  return (
    <>
      <AdminTabs counts={counts} />
      <AlertBanner />
      {children}
    </>
  );
}

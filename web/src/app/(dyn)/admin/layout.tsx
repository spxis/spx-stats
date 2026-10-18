import { currentUser } from "@/lib/auth/user";
import { AlertBanner } from "./AlertBanner";

/**
 * Around every admin page: the alert banner (job errors, stale scores) above the page, for an admin. Drawn per request like the pages.
 * Anyone else gets the page's own 404 and no banner.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <>
      {user?.admin ? <AlertBanner /> : null}
      {children}
    </>
  );
}

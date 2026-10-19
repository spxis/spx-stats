import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "@/components/Link";
import { devPageAllowed } from "@/lib/auth/preview";
import { currentUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dev", robots: { index: false, follow: false } };

const ADMIN_PAGES = [
  ["/admin/people", "People"],
  ["/admin/people/review", "People review"],
  ["/admin/tickets", "Tickets"],
  ["/admin/data", "Data releases (read only here)"],
  ["/admin/ops", "Ops (read only here)"],
  ["/admin/runs", "Run log and alerts (read only here)"],
  ["/admin/logos", "Logos to review"],
  ["/admin/invites", "Invite list (read only here)"],
] as const;

/** Local testing page for agents. A 404 unless `next dev` runs with SPXN_DEV_LOGIN=1 and the request names localhost (lib/auth/preview.ts, devLogin). */
export default async function DevPage() {
  if (!devPageAllowed(process.env, await headers())) notFound();
  const user = await currentUser();
  return (
    <section className="head fade">
      <h1>Dev</h1>
      {user ? (
        <p className="lede">Signed in as {user.email}{user.admin ? " (fake admin: reads only, every write is refused)" : ""}.</p>
      ) : (
        <p className="lede"><Link href="/login?next=/admin/dev">Sign in (this Mac)</Link> to see the admin pages.</p>
      )}
      <ul>
        {ADMIN_PAGES.map(([href, label]) => (
          <li key={href}><a href={href}>{label}</a></li>
        ))}
      </ul>
    </section>
  );
}

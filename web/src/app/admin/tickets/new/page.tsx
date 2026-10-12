import type { Metadata } from "next";
import Link from "next/link";
import { TicketForm } from "@/components/auth/TicketForm";
import { requireAdmin } from "@/lib/auth/user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "File a ticket", robots: { index: false, follow: false } };

export default async function NewTicketPage() {
  await requireAdmin();
  return (
    <section className="head fade">
      <h1>File a ticket</h1>
      <p className="lede">Goes onto the spx-stats board. <Link href="/admin/tickets">See the board</Link></p>
      <TicketForm />
    </section>
  );
}

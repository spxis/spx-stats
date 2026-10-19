import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/user";

/** The one Admin address (the account menu points here): it opens the Data section, whose page picks the tab this admin used last. */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminHome() {
  await requireAdmin();
  redirect("/admin/data");
}

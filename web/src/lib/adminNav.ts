import type { PhraseKey } from "@/lib/i18n/phrases.constants";

/**
 * The admin shell's navigation: four sections, each with its own sub-tabs, one list for every /admin page (the account menu has one
 * "Admin" link and this bar leads to everything else). Pure data and one function, so the shell and its test read the same list.
 * The addresses are the pages' own (nothing moved): bookmarks and the alert banner's links keep working.
 */
export type AdminSectionKey = "data" | "people" | "tickets" | "ops";
export type AdminCount = "pending" | "drift" | "alerts";

export interface AdminTab {
  key: string;
  href: string;
  label: PhraseKey;
  /** Which count draws as a badge on this tab. */
  count?: AdminCount;
}
export interface AdminSection {
  key: AdminSectionKey;
  label: PhraseKey;
  /** Where the section's own link goes (a section with a remembered tab, like Data, lets its page pick). */
  href: string;
  tabs: AdminTab[];
}

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    key: "data",
    label: "adminNav.data",
    href: "/admin/data",
    tabs: [
      { key: "pending", href: "/admin/data?tab=pending", label: "adminNav.pending", count: "pending" },
      { key: "history", href: "/admin/data?tab=history", label: "adminNav.history" },
      { key: "drift", href: "/admin/data?tab=drift", label: "adminNav.drift", count: "drift" },
      { key: "settings", href: "/admin/data?tab=settings", label: "adminNav.settings" },
      { key: "runs", href: "/admin/runs", label: "adminNav.runs", count: "alerts" },
      { key: "sources", href: "/admin/sources", label: "adminNav.sources" },
    ],
  },
  {
    key: "people",
    label: "adminNav.people",
    href: "/admin/people",
    tabs: [
      { key: "search", href: "/admin/people", label: "adminNav.peopleSearch" },
      { key: "review", href: "/admin/people/review", label: "adminNav.duplicates" },
      { key: "logos", href: "/admin/logos", label: "adminNav.logos" },
      { key: "invites", href: "/admin/invites", label: "adminNav.invites" },
    ],
  },
  {
    key: "tickets",
    label: "adminNav.tickets",
    href: "/admin/tickets",
    tabs: [
      { key: "pending", href: "/admin/tickets", label: "adminNav.ticketsPending" },
      { key: "history", href: "/admin/tickets?status=done", label: "adminNav.ticketsHistory" },
      { key: "new", href: "/admin/tickets/new", label: "adminNav.ticketsNew" },
    ],
  },
  {
    key: "ops",
    label: "adminNav.ops",
    href: "/admin/ops",
    tabs: [{ key: "ops", href: "/admin/ops", label: "adminNav.opsMachines" }],
  },
];

export interface AdminPlace { section: AdminSectionKey; tab: string }

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** Which section and tab an address belongs to; null for a page the shell has no tab for (the dev sign-in page). */
export function adminPlace(pathname: string, params: { get(name: string): string | null }): AdminPlace | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (under(path, "/admin/data")) {
    const tab = params.get("tab");
    return { section: "data", tab: tab === "history" || tab === "drift" || tab === "settings" ? tab : "pending" };
  }
  if (under(path, "/admin/runs")) return { section: "data", tab: "runs" };
  if (under(path, "/admin/sources")) return { section: "data", tab: "sources" };
  if (under(path, "/admin/people/review")) return { section: "people", tab: "review" };
  if (under(path, "/admin/people")) return { section: "people", tab: "search" };
  if (under(path, "/admin/logos")) return { section: "people", tab: "logos" };
  if (under(path, "/admin/invites")) return { section: "people", tab: "invites" };
  if (under(path, "/admin/tickets/new")) return { section: "tickets", tab: "new" };
  if (under(path, "/admin/tickets")) return { section: "tickets", tab: params.get("status") === "done" ? "history" : "pending" };
  if (under(path, "/admin/ops")) return { section: "ops", tab: "ops" };
  return null;
}

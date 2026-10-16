import Link from "next/link";
import { currentSpeaker } from "@/lib/i18n/currentLocale";

const TABS = [
  { href: "/admin/people", key: "peopleAdmin.tabSearch" as const },
  { href: "/admin/people/review", key: "peopleAdmin.tabReview" as const },
];

/** Search and the duplicates review, as a row of links. The choice is the path. */
export async function PeopleTabs({ current }: { current: "search" | "review" }) {
  const { say } = await currentSpeaker();
  const on = current === "search" ? "/admin/people" : "/admin/people/review";
  return (
    <nav className="tk-chips" aria-label={say("peopleAdmin.tabsAria")}>
      {TABS.map((t) => (
        <Link prefetch={false} key={t.href} href={t.href} className={t.href === on ? "on" : undefined} aria-current={t.href === on ? "page" : undefined}>
          {say(t.key)}
        </Link>
      ))}
    </nav>
  );
}

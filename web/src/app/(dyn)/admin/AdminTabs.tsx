"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useSpeaker } from "@/components/i18n/LocaleProvider";
import { ADMIN_SECTIONS, adminPlace, type AdminCount } from "@/lib/adminNav";

/** `total` is what waits for the admin in all (the number beside "Data releases" before: waiting releases and failed ones, plus open alerts). */
export type AdminCounts = Record<AdminCount | "total", number>;

/**
 * The one tab bar of every /admin page: the four sections on top, the current section's own tabs underneath (the look of the Data releases
 * tabs). Both rows scroll sideways at phone width instead of wrapping. The current place comes from the address, read in the browser, so the
 * layout around the pages stays one component. Badges are the counts the layout read from the cached admin summary.
 */
function Bar({ counts }: { counts: AdminCounts }) {
  const { say } = useSpeaker();
  const path = usePathname();
  const params = useSearchParams();
  const place = adminPlace(path, params);
  const section = ADMIN_SECTIONS.find((s) => s.key === place?.section);
  const badge = (n: number, tone: "live" | "stale") => (n > 0 ? <span className={`tk-badge ${tone}`}>{n}</span> : null);
  return (
    <>
      <nav className="adm-tabs adm-sections" aria-label={say("adminNav.aria")}>
        {ADMIN_SECTIONS.map((s) => (
          <Link prefetch={false} key={s.key} href={s.href} aria-current={place?.section === s.key ? "page" : undefined}>
            {say(s.label)}
            {s.key === "data" ? badge(counts.total, "live") : null}
          </Link>
        ))}
      </nav>
      {section && section.tabs.length > 1 ? (
        <nav className="adm-tabs adm-subtabs" aria-label={say(section.label)}>
          {section.tabs.map((t) => (
            <Link prefetch={false} key={t.key} href={t.href} aria-current={place?.tab === t.key ? "page" : undefined}>
              {say(t.label)}
              {t.count ? badge(counts[t.count], t.count === "pending" ? "live" : "stale") : null}
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  );
}

export function AdminTabs({ counts }: { counts: AdminCounts }) {
  return (
    <Suspense fallback={<div className="adm-tabs adm-sections" aria-hidden="true" />}>
      <Bar counts={counts} />
    </Suspense>
  );
}

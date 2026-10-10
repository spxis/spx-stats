"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEAGUES } from "@/lib/leagues";
import { useSpeaker } from "./i18n/LocaleProvider";

export function LeagueNav() {
  const { say } = useSpeaker();
  const current = usePathname().split("/")[1];
  return (
    <nav className="leagues" id="league-nav" aria-label={say("nav.leagues")}>
      {LEAGUES.map((l) => (
        <Link key={l.code} href={`/${l.code}`} aria-current={current === l.code ? "page" : undefined}>
          {l.short}
        </Link>
      ))}
    </nav>
  );
}

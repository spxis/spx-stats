"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEAGUES } from "@/lib/leagues";

export function LeagueNav() {
  const current = usePathname().split("/")[1];
  return (
    <nav className="leagues" id="league-nav" aria-label="Leagues">
      {LEAGUES.map((l) => (
        <Link key={l.code} href={`/${l.code}`} aria-current={current === l.code ? "page" : undefined}>
          {l.short}
        </Link>
      ))}
    </nav>
  );
}

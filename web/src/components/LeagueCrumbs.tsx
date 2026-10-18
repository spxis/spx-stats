"use client";

import Link from "@/components/Link";
import { useSelectedLayoutSegments } from "next/navigation";
import { LG } from "@/lib/leagues";
import { leagueTrail, trailHidden } from "@/lib/otherLeagues";
import { useSpeaker } from "./i18n/LocaleProvider";

/**
 * "NFL > AFL > 1964": the trail on the pages of a rival or predecessor league (lib/leagues.ts PARENT), whose tab in the menu is its parent's. It reads the
 * page's own address from the route, like LeagueNav, so a kept page is the same for everyone; a page of any other league has none.
 */
export function LeagueCrumbs() {
  const { say } = useSpeaker();
  const segments = useSelectedLayoutSegments();
  const parts = segments[0] === "s" || segments[0] === "q" ? segments.slice(1) : segments;
  const trail = trailHidden(parts) ? null : leagueTrail(parts);
  if (!trail) return null;
  const { parent, lg, year, deeper } = trail;
  return (
    <nav className="crumbs" aria-label={say("nav.crumbs")}>
      <Link href={`/${parent}`}>{LG[parent]}</Link>
      <span aria-hidden="true">›</span>
      {deeper ? <Link href={`/${lg}`}>{LG[lg]}</Link> : <span aria-current="page">{LG[lg]}</span>}
      {year ? (<><span aria-hidden="true">›</span><span aria-current="page">{year}</span></>) : null}
    </nav>
  );
}

"use client";

import Link from "@/components/Link";
import { useSelectedLayoutSegments } from "next/navigation";
import { isLeague, isMoreHockey, LG } from "@/lib/leagues";
import { leagueTrail, trailHidden } from "@/lib/otherLeagues";
import { useSpeaker } from "./i18n/LocaleProvider";

/**
 * "NFL ›" in the heading row of a rival or predecessor league's page (lib/leagues.ts PARENT), whose tab in the menu is its parent's. It sits in the row of the
 * heading's own eyebrow (the league's name follows it there), so the page has the same header as its parent's. It reads the page's own address from the
 * route, like LeagueNav, so a kept page is the same for everyone; a page of any other league has none.
 */
export function LeagueCrumbs() {
  const { say } = useSpeaker();
  const segments = useSelectedLayoutSegments();
  const parts = segments[0] === "s" || segments[0] === "q" ? segments.slice(1) : segments;
  const trail = trailHidden(parts) ? null : leagueTrail(parts);
  // A league on the More hockey page (the AHL) has no parent: its trail is "More hockey ›".
  if (!trail && !trailHidden(parts) && parts[0] && isLeague(parts[0]) && isMoreHockey(parts[0])) {
    return (
      <nav className="crumbs wide" aria-label={say("nav.crumbs")}>
        <Link href="/more-hockey">{say("hockey.crumbs")}</Link>
        <span aria-hidden="true">›</span>
      </nav>
    );
  }
  if (!trail) return null;
  return (
    <nav className="crumbs" aria-label={say("nav.crumbs")}>
      <Link href={`/${trail.parent}`}>{LG[trail.parent]}</Link>
      <span aria-hidden="true">›</span>
    </nav>
  );
}

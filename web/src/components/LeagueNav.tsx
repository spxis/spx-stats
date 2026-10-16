"use client";

import Link from "@/components/Link";
import { useRouter, useSelectedLayoutSegments } from "next/navigation";
import type { MouseEvent } from "react";
import { isLeague, LEAGUES, topLeague } from "@/lib/leagues";
import { useSpeaker } from "./i18n/LocaleProvider";

/** Pages that mean the same in every league, so switching league keeps their date or view. */
const SHARED = new Set(["scores", "all-time"]);

export function LeagueNav() {
  const { say } = useSpeaker();
  const router = useRouter();
  // The page's own address: a kept page is drawn once for everyone, so it is read from the route (the same on the server and in the
  // browser), minus the "s" or "q" the rewrites add (lib/routing.ts).
  const segments = useSelectedLayoutSegments();
  const parts = ["", ...(segments[0] === "s" || segments[0] === "q" ? segments.slice(1) : segments)];
  const current = parts[1];
  const keep = SHARED.has(parts[2] ?? "");
  const go = (e: MouseEvent, code: string) => {
    if (!keep || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    router.push(`/${[code, ...parts.slice(2)].join("/")}${location.search}`);
  };
  return (
    <nav className="leagues" id="league-nav" aria-label={say("nav.leagues")}>
      {LEAGUES.map((l) => (
        <Link key={l.code} href={`/${l.code}`} prefetch onClick={(e) => go(e, l.code)} aria-current={topLeague(current ?? "") === l.code ? "page" : undefined}>
          {l.short}
        </Link>
      ))}
      <Link href="/soccer" prefetch aria-current={current === "soccer" || current === "worldcup" || current === "mls" ? "page" : undefined}>{say("nav.soccer")}</Link>
      {current && isLeague(current) ? (
        <>
          <Link className="sub" href={`/${current}/scores`} prefetch aria-current={parts[2] === "scores" ? "page" : undefined}>{say("nav.scores")}</Link>
          <Link className="sub" href={`/${current}/all-time`} prefetch aria-current={parts[2] === "all-time" ? "page" : undefined}>{say("nav.allTime")}</Link>
        </>
      ) : null}
    </nav>
  );
}

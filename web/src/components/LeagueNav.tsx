"use client";

import IntentLink from "@/components/IntentLink";
import { useRouter, useSelectedLayoutSegments } from "next/navigation";
import type { MouseEvent } from "react";
import { menuEntries, menuFamilyOf, MORE_HOCKEY_PATH } from "@/lib/leagueFamilies";
import { isLeague } from "@/lib/leagues";
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
  const family = menuFamilyOf(current);
  const keep = SHARED.has(parts[2] ?? "");
  const go = (e: MouseEvent, code: string) => {
    if (!keep || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    router.push(`/${[code, ...parts.slice(2)].join("/")}${location.search}`);
  };
  return (
    <nav className={family === "nhl" ? "leagues withmore" : "leagues"} id="league-nav" aria-label={say("nav.leagues")}>
      {menuEntries(say("nav.soccer")).map((m) => (
        <IntentLink key={m.id} href={m.href} onClick={(e) => { if (m.id !== "soccer") go(e, m.href.slice(1)); }} aria-current={family === m.id ? "page" : undefined}>
          {m.label}
        </IntentLink>
      ))}
      {current && isLeague(current) ? (
        <>
          <IntentLink className="sub" href={`/${current}/scores`} aria-current={parts[2] === "scores" ? "page" : undefined}>{say("nav.scores")}</IntentLink>
          <IntentLink className="sub" href={`/${current}/all-time`} aria-current={parts[2] === "all-time" ? "page" : undefined}>{say("nav.allTime")}</IntentLink>
        </>
      ) : null}
      {family === "nhl" ? (
        <>
          <span className="leaguebreak" aria-hidden="true" />
          <IntentLink className="sub more" href={MORE_HOCKEY_PATH} aria-current={current === MORE_HOCKEY_PATH.slice(1) ? "page" : undefined}>{say("hockey.more")}</IntentLink>
        </>
      ) : null}
    </nav>
  );
}

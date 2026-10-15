import type { ReactNode } from "react";
import { isLeague } from "@/lib/leagues";

/**
 * Marks a page as one sport's, so the header swoosh's centre takes that sport's colour (`:root:has([data-sport])` rules in globals.css, which
 * set --mk-r to the league token). It is a hidden element in the segment's layout, so the page stays a kept one: no cookies, headers or query.
 * `sport` is a league code or "soccer" (World Cup, MLS); anything else (a bad address, which the page turns into a 404) marks nothing.
 */
export function SportMark({ sport, children }: { sport: string; children: ReactNode }) {
  return (
    <>
      {isLeague(sport) || sport === "soccer" ? <span hidden data-sport={sport} /> : null}
      {children}
    </>
  );
}
